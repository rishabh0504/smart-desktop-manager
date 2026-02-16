use serde::Serialize;
use std::path::Path;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tauri::{AppHandle, Emitter};
use std::sync::atomic::Ordering;
use crate::commands::operation::{register_operation, unregister_operation};

#[derive(Serialize, Clone)]
pub struct CopyProgress {
    pub operation_id: String,
    pub bytes_written: u64,
    pub total_bytes: u64,
    pub progress: f64,
}

#[tauri::command]
pub async fn start_copy(
    app: AppHandle,
    operation_id: String,
    source: String,
    destination: String,
) -> Result<(), String> {
    let src_path = Path::new(&source);
    let dst_path = Path::new(&destination);

    if !src_path.exists() {
        return Err("Source file does not exist".to_string());
    }

    let metadata = tokio::fs::metadata(src_path).await.map_err(|e| e.to_string())?;
    let total_bytes = metadata.len();
    
    let cancel_flag = register_operation(operation_id.clone());

    let mut src_file = File::open(src_path).await.map_err(|e| e.to_string())?;
    let mut dst_file = File::create(dst_path).await.map_err(|e| e.to_string())?;

    let mut buffer = vec![0u8; 8 * 1024 * 1024]; // 8MB buffer
    let mut bytes_written = 0u64;

    while bytes_written < total_bytes {
        if cancel_flag.load(Ordering::Relaxed) {
            unregister_operation(&operation_id);
            let _ = tokio::fs::remove_file(dst_path).await;
            return Err("Operation cancelled".to_string());
        }

        let n = src_file.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if n == 0 { break; }
        
        dst_file.write_all(&buffer[..n]).await.map_err(|e| e.to_string())?;
        bytes_written += n as u64;

        let progress = (bytes_written as f64 / total_bytes as f64) * 100.0;
        let _ = app.emit("copy_progress", CopyProgress {
            operation_id: operation_id.clone(),
            bytes_written,
            total_bytes,
            progress,
        });
    }

    unregister_operation(&operation_id);
    let _ = app.emit("copy_completed", operation_id);
    Ok(())
}
