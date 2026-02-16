use std::path::Path;
use tauri::{AppHandle, Emitter};
use crate::commands::operation::{register_operation, unregister_operation};

#[tauri::command]
pub async fn start_move(
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

    let _cancel_flag = register_operation(operation_id.clone());

    // Simple move using fs::rename (works across same volume)
    // For different volumes, we might need copy + delete, but for now we'll keep it simple
    std::fs::rename(src_path, dst_path).map_err(|e| e.to_string())?;

    unregister_operation(&operation_id);
    let _ = app.emit("move_completed", operation_id);
    Ok(())
}
