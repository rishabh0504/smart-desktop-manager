use serde::Serialize;
use std::fs;
use std::io::{BufReader, BufWriter, self, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Window};
use walkdir::WalkDir;
use rayon::prelude::*;

use crate::commands::operation::{register_operation, unregister_operation};

/// Returns a path under dest_dir that does not exist. If file_name exists, tries "stem (1).ext", "stem (2).ext", etc.
fn unique_dest_path(dest_dir: &Path, file_name: &std::ffi::OsStr) -> PathBuf {
    let path = dest_dir.join(file_name);
    if !path.exists() {
        return path;
    }
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("item");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
    for n in 1..10000 {
        let name = if ext.is_empty() {
            format!("{} ({})", stem, n)
        } else {
            format!("{} ({}).{}", stem, n, ext)
        };
        let candidate = dest_dir.join(&name);
        if !candidate.exists() {
            return candidate;
        }
    }
    path
}

#[derive(Serialize, Clone)]
pub struct BatchProgress {
    pub operation_id: String,
    pub current_item: String,
    pub processed_items: usize,
    pub total_items: usize,
    pub progress: f64,
}

/// Emitted for each successfully completed item so frontend can dequeue in real-time.
#[derive(Serialize, Clone)]
pub struct BatchItemCompleted {
    pub operation_id: String,
    pub path: String,
}

/// Emitted when the batch finishes (with or without errors).
#[derive(Serialize, Clone)]
pub struct BatchFinished {
    pub operation_id: String,
    pub failed_paths: Vec<String>,
}

#[tauri::command]
pub fn check_paths_exist(paths: Vec<String>) -> Vec<String> {
    paths.into_iter()
        .filter(|p| std::path::Path::new(p).exists())
        .collect()
}

#[tauri::command]
pub async fn delete_items(
    app: AppHandle,
    operation_id: String,
    paths: Vec<String>,
) -> Result<(), String> {
    let total_items = paths.len();
    let cancel_flag = register_operation(operation_id.clone());
    let processed_count = std::sync::atomic::AtomicUsize::new(0);
    let last_emit = std::sync::Arc::new(std::sync::Mutex::new(std::time::Instant::now()));
    let failed_paths = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));

    let op_id = operation_id.clone();
    let app_clone = app.clone();
    let failed_clone = failed_paths.clone();

    tokio::task::spawn_blocking(move || {
        paths.par_iter().for_each(|path| {
            if cancel_flag.load(Ordering::Relaxed) {
                return;
            }

            let p = PathBuf::from(path);
            let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone());
            let count = processed_count.fetch_add(1, Ordering::SeqCst) + 1;

            let mut last_emit_lock = last_emit.lock().unwrap();
            if last_emit_lock.elapsed().as_millis() > 100 || count == total_items {
                let _ = app_clone.emit("batch_progress", BatchProgress {
                    operation_id: op_id.clone(),
                    current_item: name.clone(),
                    processed_items: count,
                    total_items,
                    progress: (count as f64 / total_items as f64) * 100.0,
                });
                *last_emit_lock = std::time::Instant::now();
            }
            drop(last_emit_lock);

            if trash::delete(&p).is_ok() {
                let _ = app_clone.emit("batch_item_completed", BatchItemCompleted {
                    operation_id: op_id.clone(),
                    path: path.clone(),
                });
            } else {
                failed_clone.lock().unwrap().push(path.clone());
            }
        });
    }).await.map_err(|e| e.to_string())?;

    let failed = failed_paths.lock().unwrap().clone();
    let _ = app.emit("batch_finished", BatchFinished {
        operation_id: operation_id.clone(),
        failed_paths: failed.clone(),
    });
    unregister_operation(&operation_id);

    if failed.is_empty() {
        Ok(())
    } else {
        Err(format!("{} item(s) failed to delete", failed.len()))
    }
}

#[tauri::command]
pub async fn batch_copy(
    app: AppHandle,
    operation_id: String,
    sources: Vec<String>,
    destination_dir: String,
) -> Result<(), String> {
    let total_items = sources.len();
    let cancel_flag = register_operation(operation_id.clone());
    let dest_path = PathBuf::from(&destination_dir);

    let processed_count = std::sync::atomic::AtomicUsize::new(0);
    let last_emit = std::sync::Arc::new(std::sync::Mutex::new(std::time::Instant::now()));

    let op_id = operation_id.clone();
    let app_clone = app.clone();
    let res = tokio::task::spawn_blocking(move || {
        sources.par_iter().try_for_each(|src| {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err("Operation cancelled".to_string());
            }

            let src_path = PathBuf::from(src);
            let file_name = src_path.file_name().unwrap_or_default();
            let target_path = unique_dest_path(&dest_path, file_name);

            let count = processed_count.fetch_add(1, Ordering::SeqCst) + 1;

            let mut last_emit_lock = last_emit.lock().unwrap();
            if last_emit_lock.elapsed().as_millis() > 100 || count == total_items {
                let _ = app_clone.emit("batch_progress", BatchProgress {
                    operation_id: op_id.clone(),
                    current_item: file_name.to_string_lossy().into_owned(),
                    processed_items: count,
                    total_items,
                    progress: (count as f64 / total_items as f64) * 100.0,
                });
                *last_emit_lock = std::time::Instant::now();
            }
            drop(last_emit_lock);

            if src_path.is_dir() {
                let mut opts = fs_extra::dir::CopyOptions::new();
                opts.overwrite = false;
                let _ = fs_extra::dir::copy(&src_path, &target_path, &opts);
            } else {
                let mut opts = fs_extra::file::CopyOptions::new();
                opts.overwrite = false;
                let _ = fs_extra::file::copy(&src_path, &target_path, &opts);
            }
            Ok(())
        })
    }).await.map_err(|e| e.to_string())?;

    unregister_operation(&operation_id);
    if res.is_ok() {
        let _ = app.emit("batch_completed", operation_id);
    }
    res
}

#[tauri::command]
pub async fn batch_move(
    app: AppHandle,
    operation_id: String,
    sources: Vec<String>,
    destination_dir: String,
) -> Result<(), String> {
    let total_items = sources.len();
    let cancel_flag = register_operation(operation_id.clone());
    let dest_path = PathBuf::from(&destination_dir);

    let processed_count = std::sync::atomic::AtomicUsize::new(0);
    let last_emit = std::sync::Arc::new(std::sync::Mutex::new(std::time::Instant::now()));
    let failed_paths = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));

    let op_id = operation_id.clone();
    let app_clone = app.clone();
    let failed_clone = failed_paths.clone();

    tokio::task::spawn_blocking(move || {
        sources.par_iter().for_each(|src| {
            if cancel_flag.load(Ordering::Relaxed) {
                return;
            }

            let src_path = PathBuf::from(src);
            let file_name = src_path.file_name().unwrap_or_default();
            let target_path = unique_dest_path(&dest_path, file_name);

            let count = processed_count.fetch_add(1, Ordering::SeqCst) + 1;

            let mut last_emit_lock = last_emit.lock().unwrap();
            if last_emit_lock.elapsed().as_millis() > 100 || count == total_items {
                let _ = app_clone.emit("batch_progress", BatchProgress {
                    operation_id: op_id.clone(),
                    current_item: file_name.to_string_lossy().into_owned(),
                    processed_items: count,
                    total_items,
                    progress: (count as f64 / total_items as f64) * 100.0,
                });
                *last_emit_lock = std::time::Instant::now();
            }
            drop(last_emit_lock);

            let ok = if src_path.is_dir() {
                if std::fs::rename(&src_path, &target_path).is_ok() {
                    true
                } else {
                    let mut opts = fs_extra::dir::CopyOptions::new();
                    opts.overwrite = false;
                    if fs_extra::dir::copy(&src_path, &target_path, &opts).is_ok() {
                        trash::delete(&src_path).is_ok()
                    } else {
                        false
                    }
                }
            } else {
                if std::fs::rename(&src_path, &target_path).is_ok() {
                    true
                } else {
                    let mut opts = fs_extra::file::CopyOptions::new();
                    opts.overwrite = false;
                    fs_extra::file::move_file(&src_path, &target_path, &opts).is_ok()
                }
            };

            if ok {
                let _ = app_clone.emit("batch_item_completed", BatchItemCompleted {
                    operation_id: op_id.clone(),
                    path: src.clone(),
                });
            } else {
                failed_clone.lock().unwrap().push(src.clone());
            }
        });
    }).await.map_err(|e| e.to_string())?;

    let failed = failed_paths.lock().unwrap().clone();
    let _ = app.emit("batch_finished", BatchFinished {
        operation_id: operation_id.clone(),
        failed_paths: failed.clone(),
    });
    unregister_operation(&operation_id);

    if failed.is_empty() {
        Ok(())
    } else {
        Err(format!("{} item(s) failed to move", failed.len()))
    }
}

#[tauri::command]
pub fn fast_copy(src: String, dest: String, window: Window) -> Result<(), String> {
    let src_path = Path::new(&src);
    let dest_path = Path::new(&dest);

    if !dest_path.exists() {
        fs::create_dir_all(dest_path).map_err(|e| e.to_string())?;
    }

    let entries: Vec<PathBuf> = WalkDir::new(src_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .map(|e| e.into_path())
        .collect();

    let total = entries.len();
    let counter = std::sync::atomic::AtomicUsize::new(0);

    entries.par_iter().for_each(|path| {
        if let Ok(rel) = path.strip_prefix(src_path) {
            let target = dest_path.join(rel);

            if path.is_dir() {
                let _ = fs::create_dir_all(&target);
            } else {
                let _ = copy_file(path, &target);
            }

            let progress = counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let _ = window.emit("copy-progress", Some((progress, total)));
        }
    });

    Ok(())
}

fn copy_file(src: &Path, dest: &Path) -> io::Result<u64> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut reader = BufReader::new(fs::File::open(src)?);
    let mut writer = BufWriter::new(fs::File::create(dest)?);

    io::copy(&mut reader, &mut writer)
}
