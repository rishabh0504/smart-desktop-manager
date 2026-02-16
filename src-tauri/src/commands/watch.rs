#[tauri::command]
pub async fn start_watching(_path: String) -> Result<(), String> {
    // Placeholder for notify crate implementation
    Ok(())
}

#[tauri::command]
pub async fn stop_watching(_path: String) -> Result<(), String> {
    // Placeholder
    Ok(())
}
