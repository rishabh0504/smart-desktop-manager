use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter};

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

    for (index, path) in paths.iter().enumerate() {
        if cancel_flag.load(Ordering::Relaxed) {
            unregister_operation(&operation_id);
            return Err("Operation cancelled".to_string());
        }

        let p = PathBuf::from(path);
        
        let _ = app.emit("batch_progress", BatchProgress {
            operation_id: operation_id.clone(),
            current_item: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone()),
            processed_items: index,
            total_items,
            progress: (index as f64 / total_items as f64) * 100.0,
        });

        if p.exists() {
            if p.is_dir() {
                tokio::fs::remove_dir_all(&p).await.map_err(|e| format!("Failed to delete folder {}: {}", path, e))?;
            } else {
                tokio::fs::remove_file(&p).await.map_err(|e| format!("Failed to delete file {}: {}", path, e))?;
            }
        }
    }

    unregister_operation(&operation_id);
    let _ = app.emit("batch_completed", operation_id);
    Ok(())
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

    for (index, src) in sources.iter().enumerate() {
        if cancel_flag.load(Ordering::Relaxed) {
            unregister_operation(&operation_id);
            return Err("Operation cancelled".to_string());
        }

        let src_path = PathBuf::from(src);
        let file_name = src_path.file_name().unwrap_or_default();
        let target_path = unique_dest_path(&dest_path, file_name);

        let _ = app.emit("batch_progress", BatchProgress {
            operation_id: operation_id.clone(),
            current_item: file_name.to_string_lossy().into_owned(),
            processed_items: index,
            total_items,
            progress: (index as f64 / total_items as f64) * 100.0,
        });

        let is_dir = src_path.is_dir();
        let res = tokio::task::spawn_blocking(move || {
            if is_dir {
                let mut opts = fs_extra::dir::CopyOptions::new();
                opts.overwrite = false;
                fs_extra::dir::copy(&src_path, &target_path, &opts).map_err(|e| e.to_string()).map(|_| ())
            } else {
                let mut opts = fs_extra::file::CopyOptions::new();
                opts.overwrite = false;
                fs_extra::file::copy(&src_path, &target_path, &opts).map_err(|e| e.to_string()).map(|_| ())
            }
        })
        .await
        .map_err(|e| e.to_string())?;
        res.map_err(|e| e.to_string())?;
    }

    unregister_operation(&operation_id);
    let _ = app.emit("batch_completed", operation_id);
    Ok(())
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

    for (index, src) in sources.iter().enumerate() {
        if cancel_flag.load(Ordering::Relaxed) {
            unregister_operation(&operation_id);
            return Err("Operation cancelled".to_string());
        }

        let src_path = PathBuf::from(src);
        let file_name = src_path.file_name().unwrap_or_default();
        let target_path = unique_dest_path(&dest_path, file_name);

        let _ = app.emit("batch_progress", BatchProgress {
            operation_id: operation_id.clone(),
            current_item: file_name.to_string_lossy().into_owned(),
            processed_items: index,
            total_items,
            progress: (index as f64 / total_items as f64) * 100.0,
        });

        let is_dir = src_path.is_dir();
        let res = tokio::task::spawn_blocking(move || {
            if is_dir {
                let mut opts = fs_extra::dir::CopyOptions::new();
                opts.overwrite = false;
                fs_extra::dir::copy(&src_path, &target_path, &opts)
                    .map_err(|e| e.to_string())
                    .and_then(|_| std::fs::remove_dir_all(&src_path).map_err(|e| e.to_string()))
            } else {
                let mut opts = fs_extra::file::CopyOptions::new();
                opts.overwrite = false;
                fs_extra::file::move_file(&src_path, &target_path, &opts).map_err(|e| e.to_string()).map(|_| ())
            }
        })
        .await
        .map_err(|e| e.to_string())?;
        res.map_err(|e| e.to_string())?;
    }

    unregister_operation(&operation_id);
    let _ = app.emit("batch_completed", operation_id);
    Ok(())
}
