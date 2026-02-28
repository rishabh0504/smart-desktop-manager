use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Runtime};

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;

use super::settings::ConfigSection;

/// Safety cap to avoid OOM on huge volumes.
const MAX_DEDUPE_DISCOVERY_FILES: usize = 1_000_000;

// ── Public types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub paths: Vec<String>,
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
) -> Result<Vec<DuplicateGroup>, String> {
    let start_time = Instant::now();

    // ── Normalise + dedup root paths ─────────────────────────────────────
    let mut unique_paths: Vec<PathBuf> = paths
        .into_iter()
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .collect();
    unique_paths.sort();
    let mut root_paths: Vec<PathBuf> = Vec::new();
    for p in unique_paths {
        if !root_paths.iter().any(|r: &PathBuf| p.starts_with(r)) {
            root_paths.push(p);
        }
    }
    if root_paths.is_empty() {
        return Ok(Vec::new());
    }

    // ── Thread count from settings ───────────────────────────────────────
    let logical_cpus = num_cpus();
    let num_threads = match settings.thread_count {
        Some(n) if n >= 1 => n.min(logical_cpus * 2),
        _ => logical_cpus,
    };

    // Build a LOCAL Rayon thread pool — never touches the global pool.
    // Safe to rebuild on every scan, always uses the user-configured count.
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(num_threads)
        .build()
        .map_err(|e| e.to_string())?;

    // ── Shared progress state ────────────────────────────────────────────
    let scanned_count = Arc::new(AtomicUsize::new(0));
    let dups_found    = Arc::new(AtomicUsize::new(0));
    let phase_idx     = Arc::new(AtomicUsize::new(0)); // 0=disc,1=part,2=full,3=done
    let phase_done    = Arc::new(AtomicUsize::new(0));
    let phase_total   = Arc::new(AtomicUsize::new(0));
    let active        = Arc::new(AtomicBool::new(true));
    let last_path     = Arc::new(Mutex::new(String::new()));

    // ── Background progress emitter ──────────────────────────────────────
    {
        let app2      = app.clone();
        let scanned2  = scanned_count.clone();
        let dups2     = dups_found.clone();
        let phase2    = phase_idx.clone();
        let p_done2   = phase_done.clone();
        let p_total2  = phase_total.clone();
        let active2   = active.clone();
        let path2     = last_path.clone();
        let start2    = start_time;

        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                if !active2.load(Ordering::Relaxed) { break; }

                let ph   = phase2.load(Ordering::Relaxed) as u8;
                let done = p_done2.load(Ordering::Relaxed);
                let tot  = p_total2.load(Ordering::Relaxed);
                let sc   = scanned2.load(Ordering::Relaxed);
                let cur  = path2.lock().map(|g| g.clone()).unwrap_or_default();

                let percent: u8 = match ph {
                    0 => {
                        // Discovery — unknown total, animate 0→32 based on files found
                        if sc == 0 { 0 } else { (sc.min(500_000) * 32 / 500_000) as u8 }
                    }
                    1 => (33 + if tot > 0 { done.min(tot) * 33 / tot } else { 0 }) as u8,
                    2 => (66 + if tot > 0 { done.min(tot) * 33 / tot } else { 0 }) as u8,
                    _ => 100,
                };

                let status = match ph {
                    0 => format!("Discovering files… ({} scanned)", sc),
                    1 => format!("Quick check ({}/{})", done, tot),
                    2 => format!("Deep verify ({}/{})", done, tot),
                    _ => "Done".to_string(),
                };

                let _ = app2.emit("dedupe-progress", ProgressEvent {
                    scanned: sc,
                    duplicates_found: dups2.load(Ordering::Relaxed),
                    current_path: cur,
                    status,
                    percent,
                    phase: ph,
                    total_files: tot,
                    elapsed_ms: start2.elapsed().as_millis() as u64,
                });
            }
        });
    }

    // ── Phase 1: Discovery ───────────────────────────────────────────────
    // Walk all root folders serially (I/O bound; parallel walk gives no
    // speedup when the bottleneck is the storage device).
    // Collect (size, dev, ino, path) for every file that passes filters.

    #[cfg(unix)]
    type Identity = (u64, u64, u64); // (size, dev, ino)
    #[cfg(not(unix))]
    type Identity = (u64, u64, u64); // (size, 0, 0)

    let mut files_by_identity: HashMap<Identity, Vec<PathBuf>> = HashMap::new();

    for root in &root_paths {
        for entry in walkdir::WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if scanned_count.load(Ordering::Relaxed) >= MAX_DEDUPE_DISCOVERY_FILES {
                break;
            }
            if !entry.file_type().is_file() { continue; }

            let path = entry.path().to_path_buf();
            let name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            // Apply name filter
            if !settings.show_hidden_files && name.starts_with('.') { continue; }
            if settings.blocked_names.contains(&name) { continue; }

            // Apply extension filter
            let ext = path.extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if settings.blocked_extensions.contains(&ext.to_string()) { continue; }

            let meta = match path.metadata() { Ok(m) => m, Err(_) => continue };
            let size = meta.len();
            if size == 0 { continue; } // zero-byte files are always "equal" — skip

            #[cfg(unix)]
            let key: Identity = (size, meta.dev(), meta.ino());
            #[cfg(not(unix))]
            let key: Identity = (size, 0, 0);

            scanned_count.fetch_add(1, Ordering::Relaxed);
            if let Ok(mut g) = last_path.lock() { *g = path.to_string_lossy().to_string(); }

            files_by_identity.entry(key).or_default().push(path);
        }
    }

    // ── Filter: only sizes with ≥2 files need hashing ───────────────────
    // Group by size only (drop inode-duplicate paths — hardlinks are already
    // the same bytes, treat them as duplicates only if >1 path per inode).
    let mut items_to_partial_hash: Vec<(u64, PathBuf)> = Vec::new();
    let mut hardlink_groups: Vec<DuplicateGroup> = Vec::new();

    // First, group by (size) ignoring inode
    let mut by_size: HashMap<u64, Vec<(u64, u64, PathBuf)>> = HashMap::new();
    for ((size, dev, ino), paths) in files_by_identity {
        for path in paths {
            by_size.entry(size).or_default().push((dev, ino, path));
        }
    }

    for (size, entries) in by_size {
        if entries.len() < 2 { continue; }

        // Separate hard-links from distinct inodes
        let mut inode_map: HashMap<(u64, u64), Vec<PathBuf>> = HashMap::new();
        for (dev, ino, path) in entries {
            inode_map.entry((dev, ino)).or_default().push(path);
        }

        let mut non_hardlink: Vec<PathBuf> = Vec::new();
        for (_, group_paths) in inode_map {
            if group_paths.len() > 1 {
                // Hard-links are trivially duplicates
                hardlink_groups.push(DuplicateGroup {
                    hash: "hard-link".to_string(),
                    size,
                    paths: group_paths.into_iter().map(|p| p.to_string_lossy().to_string()).collect(),
                });
            } else {
                non_hardlink.extend(group_paths);
            }
        }
        if non_hardlink.len() >= 2 {
            for p in non_hardlink {
                items_to_partial_hash.push((size, p));
            }
        }
    }

    // Emit hard-link groups immediately
    dups_found.store(hardlink_groups.len(), Ordering::Relaxed);
    for g in &hardlink_groups {
        let _ = app.emit("duplicate-found", g.clone());
    }

    // ── Phase 2: Partial hash (first+last 64 KB) ─────────────────────────
    phase_idx.store(1, Ordering::Relaxed);
    phase_done.store(0, Ordering::Relaxed);
    let total_candidates = items_to_partial_hash.len();
    phase_total.store(total_candidates, Ordering::Relaxed);

    if total_candidates == 0 {
        active.store(false, Ordering::Relaxed);
        emit_done(&app, &start_time, hardlink_groups.len())?;
        return Ok(hardlink_groups);
    }

    type PartialKey = (u64, String); // (size, partial_hash_hex)
    let p_done_ph1 = phase_done.clone();
    let last_path_ph1 = last_path.clone();

    let partial_map: HashMap<PartialKey, Vec<PathBuf>> = pool.install(|| {
        items_to_partial_hash
            .par_iter()
            .filter_map(|(size, path)| {
                p_done_ph1.fetch_add(1, Ordering::Relaxed);
                if let Ok(mut g) = last_path_ph1.lock() {
                    *g = path.to_string_lossy().to_string();
                }
                get_smart_partial_hash(path, *size)
                    .ok()
                    .map(|h| ((*size, h), path.clone()))
            })
            .fold(
                HashMap::<PartialKey, Vec<PathBuf>>::new,
                |mut acc, (key, path)| { acc.entry(key).or_default().push(path); acc },
            )
            .reduce(
                HashMap::new,
                |mut a, b| { for (k, v) in b { a.entry(k).or_default().extend(v); } a },
            )
    });

    // ── Phase 3: Full hash (only groups that share a partial hash) ───────
    phase_idx.store(2, Ordering::Relaxed);
    phase_done.store(0, Ordering::Relaxed);

    let confirmed_groups: Vec<(u64, String, Vec<PathBuf>)> = partial_map
        .into_iter()
        .filter(|(_, v)| v.len() >= 2)
        .map(|((size, partial_hash), paths)| (size, partial_hash, paths))
        .collect();

    let total_to_verify: usize = confirmed_groups.iter().map(|(_, _, p)| p.len()).sum();
    phase_total.store(total_to_verify, Ordering::Relaxed);

    let p_done_ph2 = phase_done.clone();
    let dups_ph2   = dups_found.clone();
    let last_path_ph2 = last_path.clone();

    let final_groups: Vec<DuplicateGroup> = pool.install(|| {
        confirmed_groups
            .into_par_iter()
            .flat_map(|(size, partial_hash, paths)| {
                // For small files (≤128 KB) the partial hash already covers the entire
                // file content, so we can use it directly as the full hash.
                let full_map: HashMap<String, Vec<PathBuf>> = paths
                    .par_iter()
                    .filter_map(|path| {
                        p_done_ph2.fetch_add(1, Ordering::Relaxed);
                        if let Ok(mut g) = last_path_ph2.lock() {
                            *g = path.to_string_lossy().to_string();
                        }
                        let hash = if size <= 131_072 {
                            // ≤128 KB: partial hash == full hash
                            Some(partial_hash.clone())
                        } else {
                            get_full_hash(path).ok()
                        };
                        hash.map(|h| (h, path.clone()))
                    })
                    .fold(
                        HashMap::<String, Vec<PathBuf>>::new,
                        |mut acc, (h, p)| { acc.entry(h).or_default().push(p); acc },
                    )
                    .reduce(
                        HashMap::new,
                        |mut a, b| { for (k, v) in b { a.entry(k).or_default().extend(v); } a },
                    );

                full_map
                    .into_iter()
                    .filter(|(_, v)| v.len() >= 2)
                    .map(|(hash, paths)| {
                        dups_ph2.fetch_add(1, Ordering::Relaxed);
                        DuplicateGroup {
                            hash,
                            size,
                            paths: paths.into_iter().map(|p| p.to_string_lossy().to_string()).collect(),
                        }
                    })
                    .collect::<Vec<_>>()
            })
            .collect()
    });

    // Emit each confirmed group as it's found
    for g in &final_groups {
        let _ = app.emit("duplicate-found", g.clone());
    }

    active.store(false, Ordering::Relaxed);

    let all: Vec<DuplicateGroup> = hardlink_groups.into_iter().chain(final_groups).collect();
    emit_done(&app, &start_time, all.len())?;
    Ok(all)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}

fn emit_done<R: Runtime>(
    app: &tauri::AppHandle<R>,
    start: &Instant,
    dups: usize,
) -> Result<(), String> {
    app.emit("dedupe-progress", ProgressEvent {
        scanned: 0,
        duplicates_found: dups,
        current_path: String::new(),
        status: "Done".to_string(),
        percent: 100,
        phase: 3,
        total_files: 0,
        elapsed_ms: start.elapsed().as_millis() as u64,
    }).map_err(|e| e.to_string())
}

/// Hash the first and last 64 KB of a file.
/// For files ≤64 KB only the start is hashed.
/// This is the key speed optimisation — for most duplicate-detection purposes
/// matching start+end is enough to rule out false positives before the full hash.
fn get_smart_partial_hash(path: &Path, size: u64) -> Result<String, std::io::Error> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536]; // 64 KB

    // Hash start
    let n1 = file.read(&mut buffer)?;
    hasher.update(&buffer[..n1]);

    // Hash end (only if file is large enough to have a different end section)
    if size > 65536 {
        let seek_pos = if size > 131072 { size - 65536 } else { 65536 };
        file.seek(SeekFrom::Start(seek_pos))?;
        let n2 = file.read(&mut buffer)?;
        hasher.update(&buffer[..n2]);
    }

    Ok(hex::encode(hasher.finalize()))
}

/// Full content hash. Uses mmap for large files for zero-copy performance.
fn get_full_hash(path: &Path) -> Result<String, std::io::Error> {
    let file = File::open(path)?;
    let meta = file.metadata()?;
    if meta.len() == 0 {
        return Ok(hex::encode(Sha256::digest(b"")));
    }

    // Use memory-mapped I/O for large files — the OS handles paging efficiently.
    if meta.len() > 512 * 1024 {
        // SAFETY: we only read from this mapping; no mutation.
        let mmap = unsafe { memmap2::Mmap::map(&file)? };
        return Ok(hex::encode(Sha256::digest(&mmap[..])));
    }

    // Small files: sequential buffered read
    use std::io::BufReader;
    let mut reader = BufReader::with_capacity(131_072, file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 131_072];
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}
