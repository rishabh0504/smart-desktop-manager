use std::path::Path;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use std::fs;

use super::settings::ConfigSection;
use crate::utils::path_visibility::is_hidden_or_system;

#[derive(Serialize)]
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
    _app: AppHandle,
    path: String,
    settings: ConfigSection,
    offset: usize,
    limit: usize,
) -> Result<DirectoryResponse, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err("Path does not exist".to_string());
    }

    let mut entries = Vec::new();
    let read_ptr = fs::read_dir(root).map_err(|e| e.to_string())?;

    let mut all_entries: Vec<_> = read_ptr.filter_map(|e| e.ok()).collect();

    // Sort entries: directories first, then alphabetically
    all_entries.sort_by(|a, b| {
        let a_is_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_is_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if a_is_dir != b_is_dir {
            b_is_dir.cmp(&a_is_dir)
        } else {
            a.file_name().cmp(&b.file_name())
        }
    });

    let total = all_entries.len();
    let paged_entries = all_entries.into_iter().skip(offset);

    for entry in paged_entries {
        if entries.len() >= limit {
            break;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        
        // Visibility filters
        if !settings.show_hidden_files && name.starts_with('.') {
            continue;
        }

        if !settings.show_system_files && is_hidden_or_system(&name, &entry.path()) {
            continue;
        }

        let metadata = entry.metadata().ok();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let path_buf = entry.path();
        let path_str = path_buf.to_string_lossy().to_string();

        let extension = if is_dir {
            None
        } else {
            path_buf.extension().map(|e| e.to_string_lossy().to_string().to_lowercase())
        };

        // Filter by extension if preview settings are active for this section
        if !is_dir {
            if let Some(ref ext) = extension {
                if !settings.preview_enabled.is_extension_enabled(ext) {
                    continue;
                }
            } else {
                if !settings.preview_enabled.is_extension_enabled("") {
                    continue;
                }
            }
        }

        // Blocked list filters
        if let Some(ref ext) = extension {
            if settings.blocked_extensions.contains(ext) {
                continue;
            }
        }

        if settings.blocked_names.contains(&name) {
            continue;
        }

        entries.push(FileEntry {
            name,
            path: path_str,
            canonical_path: fs::canonicalize(&path_buf)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| path_buf.to_string_lossy().to_string()),
            is_dir,
            size: metadata.as_ref().map(|m| m.len()),
            modified: metadata.and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs()),
            extension,
        });
    }

    let has_more = offset + entries.len() < total;

    Ok(DirectoryResponse {
        entries,
        total,
        has_more,
    })
}

#[tauri::command]
pub async fn create_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("Folder already exists".to_string());
    }
    fs::create_dir_all(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_item(old_path: String, new_path: String) -> Result<(), String> {
    let old = Path::new(&old_path);
    let new = Path::new(&new_path);
    if !old.exists() {
        return Err("Source does not exist".to_string());
    }
    if new.exists() {
        return Err("Destination already exists".to_string());
    }
    fs::rename(old, new).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("File already exists".to_string());
    }
    fs::write(p, "").map_err(|e| e.to_string())
}
