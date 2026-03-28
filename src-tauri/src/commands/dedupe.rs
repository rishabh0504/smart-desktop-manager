use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, BufReader};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Runtime};
use walkdir::WalkDir;
use moka::sync::Cache;
use lazy_static::lazy_static;

use super::settings::ConfigSection;
use crate::commands::operation::{register_operation, unregister_operation};
use crate::utils::path_visibility::is_hidden_or_system;
use crate::utils::text_like::is_text_like_extension;

lazy_static! {
    /// Global cache for file hashes to speed up repeated dedupe scans.
    /// Key: (Path, Size, ModifiedTime) -> Value: Hash string
    static ref HASH_CACHE: Cache<(String, u64, u64), String> = Cache::builder()
        .max_capacity(100_000)
        .time_to_idle(std::time::Duration::from_secs(3600 * 24)) // 24 hours
        .build();
}

/// Safety cap to avoid OOM on huge volumes.
const MAX_DEDUPE_DISCOVERY_FILES: usize = 1_000_000;

// ── Public types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub paths: Vec<String>,
    pub modified_times: Vec<u64>,
}

/// Progress event emitted every ~250 ms on "dedupe-progress".
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProgressEvent {
    pub scanned: usize,
    pub duplicates_found: usize,
    pub current_path: String,
    pub status: String,
    /// Accurate 0–100 overall percentage (0-33 discovery, 33-66 partial, 66-100 full).
    pub percent: u8,
    /// 0=discovery, 1=partial hash, 2=full hash, 3=done.
    pub phase: u8,
    /// Total candidate files in current phase (0 during early discovery).
    pub total_files: usize,
    pub elapsed_ms: u64,
}

// ── Main command ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn find_duplicates<R: Runtime>(
    app: tauri::AppHandle<R>,
    paths: Vec<String>,
    settings: ConfigSection,
) -> Result<(), String> {
    let start_time = Instant::now();
    let _cancel_flag = register_operation("dedupe".to_string());
    
    let root_paths: Vec<PathBuf> = paths.into_iter()
        .map(PathBuf::from)
        .filter(|p| p.exists() && !is_system_path(p))
        .collect();

    if root_paths.is_empty() {
        return Err("No valid paths provided for deduplication".to_string());
    }

    let scanned_count = Arc::new(AtomicUsize::new(0));
    let dups_found = Arc::new(AtomicUsize::new(0));
    let progress_active = Arc::new(AtomicBool::new(true));
    let last_path_shared = Arc::new(std::sync::Mutex::new(String::new()));

    let phase = Arc::new(std::sync::atomic::AtomicU8::new(0));
    let percent = Arc::new(std::sync::atomic::AtomicU8::new(0));
    let total_phase_files = Arc::new(AtomicUsize::new(0));

    let app_handle = app.clone();
    let scanned_clone = scanned_count.clone();
    let dups_clone = dups_found.clone();
    let path_clone = last_path_shared.clone();
    let active_clone = progress_active.clone();
    
    let phase_clone = phase.clone();
    let percent_clone = percent.clone();
    let total_clone = total_phase_files.clone();

    // Progress emitter thread
    tokio::spawn(async move {
        while active_clone.load(Ordering::Relaxed) {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            
            let current_path = if let Ok(p) = path_clone.lock() { p.clone() } else { String::new() };
            
            let _ = app_handle.emit("dedupe-progress", ProgressEvent {
                scanned: scanned_clone.load(Ordering::Relaxed),
                duplicates_found: dups_clone.load(Ordering::Relaxed),
                current_path,
                status: "Scanning...".to_string(),
                percent: percent_clone.load(Ordering::Relaxed),
                phase: phase_clone.load(Ordering::Relaxed),
                total_files: total_clone.load(Ordering::Relaxed),
                elapsed_ms: start_time.elapsed().as_millis() as u64,
            });
        }
    });

    let initial_candidates = walk_and_discover(&root_paths, &settings, &scanned_count, &last_path_shared);
    let potential_groups = group_by_size(initial_candidates);
    
    // Phase 1 (Partial Hashing) setup
    phase.store(1, Ordering::Relaxed);
    let partial_count: usize = potential_groups.values().map(|v| v.len()).sum();
    total_phase_files.store(partial_count, Ordering::Relaxed);

    let partial_results = process_partial_hashes(potential_groups, &percent, &last_path_shared);
    
    // Phase 2 (Full Hashing) setup
    phase.store(2, Ordering::Relaxed);
    let full_count: usize = partial_results.values().map(|v| v.len()).sum();
    total_phase_files.store(full_count, Ordering::Relaxed);

    let final_groups = process_full_hashes(partial_results, &dups_found, &app, &percent, &last_path_shared);

    progress_active.store(false, Ordering::Relaxed);
    unregister_operation(&"dedupe".to_string());

    // Final result
    let _ = app.emit("dedupe-progress", ProgressEvent {
        scanned: scanned_count.load(Ordering::Relaxed),
        duplicates_found: final_groups.len(),
        current_path: "Scan complete".to_string(),
        status: "Done".to_string(),
        percent: 100,
        phase: 3,
        total_files: 0,
        elapsed_ms: start_time.elapsed().as_millis() as u64,
    });

    Ok(())
}

fn is_system_path(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    #[cfg(target_os = "macos")]
    {
        path_str == "/System" || path_str.starts_with("/System/") ||
        path_str == "/Library" || path_str.starts_with("/Library/") ||
        path_str == "/private" || path_str.starts_with("/private/") ||
        path_str == "/Applications" || path_str.starts_with("/Applications/") ||
        path_str == "/bin" || path_str == "/usr" || path_str == "/sbin" ||
        path_str == "/dev" || path_str == "/etc"
    }
    #[cfg(target_os = "windows")]
    {
        let p_upper = path_str.to_uppercase();
        p_upper.contains("WINDOWS") || p_upper.contains("PROGRAM FILES") ||
        p_upper.contains("PROGRAM DATA") || p_upper.contains("RECYCLE.BIN") ||
        p_upper.contains("SYSTEM VOLUME INFORMATION")
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        path_str.starts_with("/proc") || path_str.starts_with("/sys") ||
        path_str.starts_with("/boot") || path_str.starts_with("/dev")
    }
}

fn walk_and_discover(
    roots: &[PathBuf], 
    settings: &ConfigSection,
    count: &AtomicUsize,
    last_path: &std::sync::Mutex<String>
) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for root in roots {
        let walker = WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok());
            
        for entry in walker {
            if files.len() >= MAX_DEDUPE_DISCOVERY_FILES { break; }
            if !entry.file_type().is_file() { continue; }
            
            let path = entry.path().to_path_buf();
            if is_system_path(&path) { continue; }
            
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            let name_str = name.to_string();
            
            if !settings.show_hidden_files && name.starts_with('.') { continue; }
            
            if !settings.show_system_files && is_hidden_or_system(&name_str, &path) {
                continue;
            }
            
            let extension = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            if settings.blocked_extensions.contains(&extension) { continue; }
            if settings.blocked_names.contains(&name_str) { continue; }

            // Filter by 4 core types
            if !settings.preview_enabled.is_extension_enabled(&extension) { continue; }

            if !settings.include_plain_text_in_duplicate_scan && is_text_like_extension(&extension) {
                continue;
            }

            if let Ok(mut p) = last_path.lock() { *p = path.to_string_lossy().to_string(); }
            count.fetch_add(1, Ordering::Relaxed);
            files.push(path);
        }
    }
    files
}

fn group_by_size(files: Vec<PathBuf>) -> HashMap<u64, Vec<PathBuf>> {
    let mut map: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    for path in files {
        if let Ok(meta) = fs::metadata(&path) {
            let size = meta.len();
            if size > 0 {
                map.entry(size).or_default().push(path);
            }
        }
    }
    map.retain(|_, v| v.len() >= 2);
    map
}

fn process_partial_hashes(
    size_groups: HashMap<u64, Vec<PathBuf>>,
    percent: &std::sync::atomic::AtomicU8,
    last_path: &std::sync::Mutex<String>
) -> HashMap<(u64, String), Vec<PathBuf>> {
    let mut partial_map: HashMap<(u64, String), Vec<PathBuf>> = HashMap::new();
    let total_files: usize = size_groups.values().map(|v| v.len()).sum();
    let mut processed = 0;
    
    for (size, paths) in size_groups {
        for path in paths {
            if let Ok(mut p) = last_path.lock() { *p = path.to_string_lossy().to_string(); }
            if let Ok(h) = compute_partial_hash(&path) {
                partial_map.entry((size, h)).or_default().push(path);
            }
            processed += 1;
            if total_files > 0 {
                let p_val: u8 = 33 + ((processed as f64 / total_files as f64) * 33.0) as u8;
                percent.store(p_val, Ordering::Relaxed);
            }
        }
    }
    partial_map.retain(|_, v| v.len() >= 2);
    partial_map
}

fn process_full_hashes<R: Runtime>(
    partial_groups: HashMap<(u64, String), Vec<PathBuf>>,
    dups_count: &AtomicUsize,
    app: &tauri::AppHandle<R>,
    percent: &std::sync::atomic::AtomicU8,
    last_path: &std::sync::Mutex<String>
) -> Vec<DuplicateGroup> {
    let mut mut_groups = Vec::new();
    let total_files: usize = partial_groups.values().map(|v| v.len()).sum();
    let mut processed = 0;
    
    for ((size, _), paths) in partial_groups {
        let mut full_map: HashMap<String, Vec<PathBuf>> = HashMap::new();
        for path in paths {
            if let Ok(mut p) = last_path.lock() { *p = path.to_string_lossy().to_string(); }
            if let Ok(h) = compute_file_hash(&path) {
                full_map.entry(h).or_default().push(path);
            }
            processed += 1;
            if total_files > 0 {
                let p_val: u8 = 66 + ((processed as f64 / total_files as f64) * 34.0) as u8;
                percent.store(p_val, Ordering::Relaxed);
            }
        }
        
        for (hash, p_list) in full_map {
            if p_list.len() >= 2 {
                dups_count.fetch_add(1, Ordering::Relaxed);
                
                let modified_times = p_list.iter().map(|p| {
                    p.metadata().ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0)
                }).collect();

                let group = DuplicateGroup {
                    hash: hash.clone(),
                    size,
                    paths: p_list.iter().map(|p| p.to_string_lossy().to_string()).collect(),
                    modified_times,
                };
                let _ = app.emit("duplicate-found", group.clone());
                mut_groups.push(group);
            }
        }
    }
    mut_groups
}

fn compute_partial_hash(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut buffer = [0u8; 16384];
    let n = file.read(&mut buffer)?;
    let hash = Sha256::digest(&buffer[..n]);
    Ok(hex::encode(hash))
}

fn compute_file_hash(path: &Path) -> std::io::Result<String> {
    let metadata = fs::metadata(path)?;
    let size = metadata.len();
    let mtime = metadata.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let cache_key = (path.to_string_lossy().to_string(), size, mtime);
    if let Some(cached_hash) = HASH_CACHE.get(&cache_key) {
        return Ok(cached_hash);
    }

    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0; 65536];

    loop {
        let n = reader.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }

    let hash = hex::encode(hasher.finalize());
    HASH_CACHE.insert(cache_key, hash.clone());
    Ok(hash)
}
