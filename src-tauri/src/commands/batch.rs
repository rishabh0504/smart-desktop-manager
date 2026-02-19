use serde::Serialize;
use std::fs;
use std::io::{BufReader, BufWriter, self};
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

#[tauri::command]
pub async fn delete_items(
    app: AppHandle,
    operation_id: String,
    paths: Vec<String>,
) -> Result<(), String> {
    let total_items = paths.len();
    let cancel_flag = register_operation(operation_id.clone());

    let op_id = operation_id.clone();
    let app_clone = app.clone();
    let res = tokio::task::spawn_blocking(move || {
        paths.par_iter().enumerate().try_for_each(|(index, path)| {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err("Operation cancelled".to_string());
            }

            let p = PathBuf::from(path);
            let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone());
            
            let _ = app_clone.emit("batch_progress", BatchProgress {
                operation_id: op_id.clone(),
                current_item: name,
                processed_items: index,
                total_items,
                progress: (index as f64 / total_items as f64) * 100.0,
            });

            if p.exists() {
                if p.is_dir() {
                    let _ = std::fs::remove_dir_all(&p);
                } else {
                    let _ = std::fs::remove_file(&p);
                }
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
pub async fn batch_copy(
    app: AppHandle,
    operation_id: String,
    sources: Vec<String>,
    destination_dir: String,
) -> Result<(), String> {
    let total_items = sources.len();
    let cancel_flag = register_operation(operation_id.clone());
    let dest_path = PathBuf::from(&destination_dir);

    let op_id = operation_id.clone();
    let app_clone = app.clone();
    let res = tokio::task::spawn_blocking(move || {
        sources.par_iter().enumerate().try_for_each(|(index, src)| {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err("Operation cancelled".to_string());
            }

            let src_path = PathBuf::from(src);
            let file_name = src_path.file_name().unwrap_or_default();
            let target_path = unique_dest_path(&dest_path, file_name);

            let _ = app_clone.emit("batch_progress", BatchProgress {
                operation_id: op_id.clone(),
                current_item: file_name.to_string_lossy().into_owned(),
                processed_items: index,
                total_items,
                progress: (index as f64 / total_items as f64) * 100.0,
            });

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

    let op_id = operation_id.clone();
    let app_clone = app.clone();
    let res = tokio::task::spawn_blocking(move || {
        sources.par_iter().enumerate().try_for_each(|(index, src)| {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err("Operation cancelled".to_string());
            }

            let src_path = PathBuf::from(src);
            let file_name = src_path.file_name().unwrap_or_default();
            let target_path = unique_dest_path(&dest_path, file_name);

            let _ = app_clone.emit("batch_progress", BatchProgress {
                operation_id: op_id.clone(),
                current_item: file_name.to_string_lossy().into_owned(),
                processed_items: index,
                total_items,
                progress: (index as f64 / total_items as f64) * 100.0,
            });

            if src_path.is_dir() {
                let mut opts = fs_extra::dir::CopyOptions::new();
                opts.overwrite = false;
                if fs_extra::dir::copy(&src_path, &target_path, &opts).is_ok() {
                    let _ = std::fs::remove_dir_all(&src_path);
                }
            } else {
                let mut opts = fs_extra::file::CopyOptions::new();
                opts.overwrite = false;
                let _ = fs_extra::file::move_file(&src_path, &target_path, &opts);
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

            // report progress
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
