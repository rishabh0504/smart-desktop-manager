use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::Path;
use std::process::Command;

/// Max size (bytes) for text and binary preview to avoid OOM on large files.
const MAX_PREVIEW_BYTES: u64 = 50 * 1024 * 1024; // 50 MB

fn check_preview_size(p: &Path) -> Result<u64, String> {
    let meta = fs::metadata(p).map_err(|e| format!("Failed to read file: {}", e))?;
    if !meta.is_file() {
        return Err("Not a file".to_string());
    }
    if meta.len() > MAX_PREVIEW_BYTES {
        return Err(format!(
            "File too large for preview (max {} MB)",
            MAX_PREVIEW_BYTES / (1024 * 1024)
        ));
    }
    Ok(meta.len())
}

#[tauri::command]
pub async fn get_file_text_content(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }
    check_preview_size(p)?;
    fs::read_to_string(p).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn get_file_base64_content(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }
    check_preview_size(p)?;
    let data = fs::read(p).map_err(|e| format!("Failed to read binary file: {}", e))?;
    let mime = mime_guess::from_path(p).first_or_octet_stream();
    let base64 = general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, base64))
}

#[tauri::command]
pub async fn get_file_blob(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }
    check_preview_size(p)?;
    let data = fs::read(p).map_err(|e| format!("Failed to read file: {}", e))?;
    let mime = mime_guess::from_path(p).first_or_octet_stream();
    let base64 = general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, base64))
}

#[tauri::command]
pub async fn open_item(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .arg("/c")
            .arg("start")
            .arg("")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn show_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
