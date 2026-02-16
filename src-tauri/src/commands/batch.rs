use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use std::sync::atomic::Ordering;
use crate::commands::operation::{register_operation, unregister_operation};

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
        let target_path = dest_path.join(file_name);

        let _ = app.emit("batch_progress", BatchProgress {
            operation_id: operation_id.clone(),
            current_item: file_name.to_string_lossy().into_owned(),
            processed_items: index,
            total_items,
            progress: (index as f64 / total_items as f64) * 100.0,
        });

        if src_path.is_dir() {
            let mut options = fs_extra::dir::CopyOptions::new();
            options.overwrite = true;
            fs_extra::dir::copy(&src_path, &destination_dir, &options).map_err(|e| e.to_string())?;
        } else {
            let mut options = fs_extra::file::CopyOptions::new();
            options.overwrite = true;
            fs_extra::file::copy(&src_path, &target_path, &options).map_err(|e| e.to_string())?;
        }
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
        let target_path = dest_path.join(file_name);

        let _ = app.emit("batch_progress", BatchProgress {
            operation_id: operation_id.clone(),
            current_item: file_name.to_string_lossy().into_owned(),
            processed_items: index,
            total_items,
            progress: (index as f64 / total_items as f64) * 100.0,
        });

        if src_path.is_dir() {
            let mut options = fs_extra::dir::CopyOptions::new();
            options.overwrite = true;
            fs_extra::dir::move_dir(&src_path, &destination_dir, &options).map_err(|e| e.to_string())?;
        } else {
            let mut options = fs_extra::file::CopyOptions::new();
            options.overwrite = true;
            fs_extra::file::move_file(&src_path, &target_path, &options).map_err(|e| e.to_string())?;
        }
    }

    unregister_operation(&operation_id);
    let _ = app.emit("batch_completed", operation_id);
    Ok(())
}
