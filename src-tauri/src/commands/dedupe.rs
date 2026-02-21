use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Runtime};

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;
use crate::utils::file_types::{get_file_category, is_category_enabled};

/// Max files to consider in discovery phase to avoid OOM on 10TB+ volumes.
const MAX_DEDUPE_DISCOVERY_FILES: usize = 10_000_000;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProgressEvent {
    pub scanned: usize,
    pub duplicates_found: usize,
    pub current_path: String,
    pub status: String,
    pub elapsed_ms: u64,
}

use super::settings::ConfigSection;

#[tauri::command]
pub async fn find_duplicates<R: Runtime>(
    app: tauri::AppHandle<R>,
    paths: Vec<String>,
    settings: ConfigSection,
) -> Result<Vec<DuplicateGroup>, String> {
    let start_time = Instant::now();
    
    // Phase 0: Clean and Deduplicate Paths
    let mut unique_paths: Vec<PathBuf> = paths.into_iter()
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .collect();
    
    unique_paths.sort();
    let mut cleaned_paths = Vec::new();
    for path in unique_paths {
        if !cleaned_paths.iter().any(|p: &PathBuf| path.starts_with(p)) {
            cleaned_paths.push(path);
        }
    }

    // Determine disk type and parallelism
    let _ = rayon::ThreadPoolBuilder::new().num_threads(4).build_global();

    // Progress State
    let scanned_count = Arc::new(AtomicUsize::new(0));
    let progress_active = Arc::new(std::sync::atomic::AtomicBool::new(true));
    
    let total_discovered_shared = Arc::new(AtomicUsize::new(0));
    let duplicates_found_shared = Arc::new(AtomicUsize::new(0));
    let phase = Arc::new(AtomicUsize::new(0)); // 0: Discovery, 1: Quick Check, 2: Deep Analysis
    let current_phase_count = Arc::new(AtomicUsize::new(0));
    let current_phase_total = Arc::new(AtomicUsize::new(0));
    let last_path_shared = Arc::new(std::sync::Mutex::new(String::new()));

    // Background Progress Emitter
    let app_handle = app.clone();
    let scanned_clone = scanned_count.clone();
    let duplicates_clone = duplicates_found_shared.clone();
    let phase_clone = phase.clone();
    let p_count_clone = current_phase_count.clone();
    let p_total_clone = current_phase_total.clone();
    let path_clone = last_path_shared.clone();
    let active_clone = progress_active.clone();

    tokio::spawn(async move {
        while active_clone.load(Ordering::Relaxed) {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            
            let current_phase = phase_clone.load(Ordering::Relaxed);
            let p_count = p_count_clone.load(Ordering::Relaxed);
            let p_total = p_total_clone.load(Ordering::Relaxed);
            let current_path = if let Ok(p) = path_clone.lock() { p.clone() } else { String::new() };
            
            let status = match current_phase {
                0 => "Discovery: Scanning files...".to_string(),
                1 => format!("Phase 1/2: Quick Check ({}%)", if p_total > 0 { (p_count * 100) / p_total } else { 0 }),
                2 => format!("Phase 2/2: Deep Analysis ({}%)", if p_total > 0 { (p_count * 100) / p_total } else { 0 }),
                _ => "Finalizing...".to_string(),
            };
            
            let _ = app_handle.emit("dedupe-progress", ProgressEvent {
                scanned: scanned_clone.load(Ordering::Relaxed),
                duplicates_found: duplicates_clone.load(Ordering::Relaxed),
                current_path,
                status,
                elapsed_ms: start_time.elapsed().as_millis() as u64,
            });
        }
    });

    // Phase 1: Discovery
    let mut files_by_identity: HashMap<(u64, u64, u64), Vec<PathBuf>> = HashMap::new();
    for start_path in &cleaned_paths {
        let mut walker = ignore::WalkBuilder::new(start_path);
        walker.follow_links(false);
        // ignore::Walk respect .gitignore by default, we'll manually check hidden/system
        for result in walker.build() {
            if scanned_count.load(Ordering::Relaxed) >= MAX_DEDUPE_DISCOVERY_FILES {
                break;
            }
            let entry = match result {
                Ok(e) => e,
                Err(_) => continue,
            };
            
            if !entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                continue;
            }

            let path = entry.path().to_path_buf();
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

            // Visibility filters
            if !settings.show_hidden_files && name.starts_with('.') {
                continue;
            }
            // For dedupe, we might stick to simple hidden check or reuse the system check from dir.rs
            // Let's reuse name.starts_with('.') as a baseline for "hidden".

            let extension = path.extension().map(|e| e.to_string_lossy().to_string().to_lowercase()).unwrap_or_default();
            
            // Blocked extensions filter
            if settings.blocked_extensions.contains(&extension) {
                continue;
            }

            // Category/Preview filter
            let category = get_file_category(&extension);
            if !is_category_enabled(category, &settings) {
                continue;
            }

            let metadata = match path.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let size = metadata.len();
            if size == 0 {
                continue;
            }
            #[cfg(unix)]
            let key = (size, metadata.dev(), metadata.ino());
            #[cfg(not(unix))]
            let key = (size, 0u64, 0u64);

            files_by_identity.entry(key).or_default().push(path.clone());
            scanned_count.fetch_add(1, Ordering::Relaxed);
            if let Ok(mut p) = last_path_shared.lock() {
                *p = path.to_string_lossy().to_string();
            }
        }
    }

    let total_discovered = scanned_count.load(Ordering::Relaxed);
    total_discovered_shared.store(total_discovered, Ordering::Relaxed);

    let mut candidates_by_size: HashMap<u64, Vec<PathBuf>> = HashMap::new();
    let mut confirmed_hardlinks: Vec<DuplicateGroup> = Vec::new();

    for ((size, _, _), paths) in files_by_identity {
        if paths.len() > 1 {
            confirmed_hardlinks.push(DuplicateGroup {
                hash: "hard-link".to_string(),
                size,
                paths: paths.into_iter().map(|p| p.to_string_lossy().to_string()).collect(),
            });
        } else if let Some(path) = paths.into_iter().next() {
            candidates_by_size.entry(size).or_default().push(path);
        }
    }

    duplicates_found_shared.store(confirmed_hardlinks.len(), Ordering::Relaxed);
    for group in &confirmed_hardlinks {
        app.emit("duplicate-found", group.clone()).map_err(|e| e.to_string())?;
    }

    // Phase 2: Partial Hashing
    phase.store(1, Ordering::Relaxed);
    let potential_groups: Vec<(u64, Vec<PathBuf>)> = candidates_by_size
        .into_iter()
        .filter(|(_, paths)| paths.len() > 1)
        .collect();

    let total_potential = potential_groups.iter().map(|(_, p)| p.len()).sum::<usize>();
    current_phase_total.store(total_potential, Ordering::Relaxed);
    
    if total_potential == 0 && confirmed_hardlinks.is_empty() {
        progress_active.store(false, Ordering::Relaxed);
        return Ok(Vec::new());
    }

    let items_to_partial_hash: Vec<(u64, PathBuf)> = potential_groups
        .into_iter()
        .flat_map(|(size, paths)| paths.into_iter().map(move |p| (size, p)))
        .collect();

    type PartialHashKey = (u64, String);
    let partial_hashes: HashMap<PartialHashKey, Vec<PathBuf>> = items_to_partial_hash
        .par_iter()
        .filter_map(|(size, path): &(u64, PathBuf)| {
            current_phase_count.fetch_add(1, Ordering::Relaxed);
            // NO MUTEX LOCKS IN PAR_ITER
            get_smart_partial_hash(path, *size).ok().map(|hash| ((*size, hash), path.clone()))
        })
        .fold(HashMap::<PartialHashKey, Vec<PathBuf>>::new, |mut acc, (key, path)| {
            acc.entry(key).or_default().push(path);
            acc
        })
        .reduce(HashMap::<PartialHashKey, Vec<PathBuf>>::new, |mut a, b| {
            for (k, v) in b {
                a.entry(k).or_default().extend(v);
            }
            a
        });

    // Phase 3: Full Hashing
    phase.store(2, Ordering::Relaxed);
    let confirmed_groups: Vec<(u64, String, Vec<PathBuf>)> = partial_hashes
        .into_iter()
        .filter(|(_, paths): &(_, Vec<PathBuf>)| paths.len() > 1)
        .map(|((size, hash), paths)| (size, hash, paths))
        .collect();

    let total_to_full_hash = confirmed_groups.iter().map(|(_, _, p): &(u64, String, Vec<PathBuf>)| p.len()).sum::<usize>();
    current_phase_count.store(0, Ordering::Relaxed);
    current_phase_total.store(total_to_full_hash, Ordering::Relaxed);

    let final_results: Vec<DuplicateGroup> = confirmed_groups
        .into_iter()
        .flat_map(|(size, partial_hash, paths): (u64, String, Vec<PathBuf>)| {
            let app_outer = app.clone();
            let p_count = current_phase_count.clone();
            let duplicates_shared = duplicates_found_shared.clone();
            let partial_hash_inner = partial_hash.clone();
            
            let full_results: HashMap<String, Vec<PathBuf>> = paths.par_iter().filter_map(move |path: &PathBuf| {
                p_count.fetch_add(1, Ordering::Relaxed);
                // NO MUTEX LOCKS IN PAR_ITER

                if size <= 131072 { // 128KB
                    Some((partial_hash_inner.clone(), path.clone()))
                } else {
                    get_full_hash(path).ok().map(|hash| (hash, path.clone()))
                }
            })
            .fold(HashMap::<String, Vec<PathBuf>>::new, |mut acc, (hash, path)| {
                acc.entry(hash).or_default().push(path);
                acc
            })
            .reduce(HashMap::<String, Vec<PathBuf>>::new, |mut a, b| {
                for (k, v) in b {
                    a.entry(k).or_default().extend(v);
                }
                a
            });

            full_results.into_iter()
                .filter(|(_, paths): &(String, Vec<PathBuf>)| paths.len() > 1)
                .map(move |(hash, paths): (String, Vec<PathBuf>)| {
                    let group = DuplicateGroup {
                        hash,
                        size,
                        paths: paths.into_iter().map(|p: PathBuf| p.to_string_lossy().to_string()).collect(),
                    };
                    let _ = app_outer.emit("duplicate-found", group.clone());
                    duplicates_shared.fetch_add(1, Ordering::Relaxed);
                    group
                })
        })
        .collect();

    progress_active.store(false, Ordering::Relaxed);

    let all_duplicates = confirmed_hardlinks.into_iter().chain(final_results.into_iter()).collect::<Vec<_>>();

    app.emit("dedupe-progress", ProgressEvent {
        scanned: total_discovered,
        duplicates_found: all_duplicates.len(),
        current_path: "Scan complete".to_string(),
        status: "Done".to_string(),
        elapsed_ms: start_time.elapsed().as_millis() as u64,
    }).map_err(|e| e.to_string())?;

    Ok(all_duplicates)
}

fn get_smart_partial_hash(path: &Path, size: u64) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536]; // 64KB

    // Hash start
    let n1 = file.read(&mut buffer)?;
    hasher.update(&buffer[..n1]);

    // Hash end (if file is large enough to have a different end)
    if size > 65536 {
        let seek_pos = if size > 131072 { size - 65536 } else { 65536 };
        file.seek(SeekFrom::Start(seek_pos))?;
        let n2 = file.read(&mut buffer)?;
        hasher.update(&buffer[..n2]);
    }

    Ok(hex::encode(hasher.finalize()))
}

fn get_full_hash(path: &Path) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536]; // 64KB Buffer for Insane Speed
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 { break; }
        hasher.update(&buffer[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}
