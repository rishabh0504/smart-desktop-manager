use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;
use super::settings::ExplorerSettings;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub canonical_path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified: Option<u64>,
    pub extension: Option<String>,
}

#[derive(Serialize)]
pub struct DirectoryResponse {
    pub entries: Vec<FileEntry>,
    pub total: usize,
    pub has_more: bool,
}

#[tauri::command]
pub async fn read_dir_chunked(
    path: String,
    offset: usize,
    limit: usize,
    sort_by: String,
    order: String,
    settings: ExplorerSettings,
) -> Result<DirectoryResponse, String> {
    let dir_path = Path::new(&path);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err("Path does not exist or is not a directory".to_string());
    }

    let entries_result = fs::read_dir(dir_path);
    if let Err(e) = entries_result {
        return Err(format!("Failed to read directory: {}", e));
    }

    let mut all_entries = Vec::new();
    for entry in entries_result.unwrap() {
        if let Ok(entry) = entry {
            let name = entry.file_name().to_string_lossy().into_owned();
            
            // System/Hidden filtering
            if !settings.show_hidden_files && name.starts_with('.') {
                continue;
            }
            if !settings.show_system_files && is_hidden_or_system(&name, &entry.path()) {
                continue;
            }

            // Blocked extensions filtering
            let extension = entry.path().extension()
                .map(|e| e.to_string_lossy().to_string().to_lowercase());
            
            if let Some(ref ext) = extension {
                if settings.blocked_extensions.contains(ext) {
                    continue;
                }
            }

            let metadata = entry.metadata().ok();
            let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
            let size = if is_dir { None } else { metadata.as_ref().map(|m| m.len()) };
            let modified = metadata.as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs());
            
            let path_buf = entry.path();
            let canonical_path = path_buf.canonicalize().unwrap_or(path_buf.clone());
            let path_str = path_buf.to_string_lossy().into_owned();

            all_entries.push(FileEntry {
                name,
                path: path_str,
                canonical_path: canonical_path.to_string_lossy().into_owned(),
                is_dir,
                size,
                modified,
                extension,
            });
        }
    }

    // Sorting
    all_entries.sort_by(|a, b| {
        let cmp = match sort_by.as_str() {
            "size" => a.size.unwrap_or(0).cmp(&b.size.unwrap_or(0)),
            "modified" => a.modified.unwrap_or(0).cmp(&b.modified.unwrap_or(0)),
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        };

        if order == "desc" {
            cmp.reverse()
        } else {
            cmp
        }
    });

    let total = all_entries.len();
    let end = (offset + limit).min(total);
    let has_more = end < total;
    
    let chunk = if offset < total {
        all_entries[offset..end].to_vec()
    } else {
        Vec::new()
    };

    Ok(DirectoryResponse {
        entries: chunk,
        total,
        has_more,
    })
}

fn is_hidden_or_system(name: &str, path: &Path) -> bool {
    // Hidden files (dotfiles)
    if name.starts_with('.') {
        return true;
    }

    // System folders (simplified check)
    #[cfg(target_os = "macos")]
    {
        let path_str = path.to_string_lossy();
        path_str == "/System" || 
        path_str.starts_with("/System/") || 
        path_str == "/Library" || 
        path_str.starts_with("/Library/") ||
        path_str == "/private" ||
        path_str.starts_with("/private/")
    }
    #[cfg(target_os = "windows")]
    {
        let name_upper = name.to_uppercase();
        name_upper == "RECYCLE.BIN" || 
        name_upper == "SYSTEM VOLUME INFORMATION" ||
        name_upper == "WINDOWS" ||
        name_upper == "PROGRAM DATA"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        name.starts_with('.') || path.starts_with("/proc") || path.starts_with("/sys") || path.starts_with("/boot")
    }
}

#[tauri::command]
pub async fn create_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("Folder already exists".to_string());
    }
    fs::create_dir_all(p).map_err(|e| format!("Failed to create folder: {}", e))
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("File already exists".to_string());
    }
    fs::File::create(p).map_err(|e| format!("Failed to create file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn rename_item(path: String, new_name: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Item does not exist".to_string());
    }
    let parent = p.parent().ok_or("Cannot rename root")?;
    let new_path = parent.join(new_name);
    
    if new_path.exists() {
        return Err("Name already exists".to_string());
    }
    
    fs::rename(p, new_path).map_err(|e| e.to_string())
}
