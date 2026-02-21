use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use super::settings::ConfigSection;

/// Max directory entries to load in one request to avoid OOM on huge dirs (e.g. 10TB volumes).
const MAX_DIR_ENTRIES: usize = 500_000;

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
    settings: ConfigSection,
) -> Result<DirectoryResponse, String> {
    let dir_path = Path::new(&path);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err("Path does not exist or is not a directory".to_string());
    }

    let entries_result = fs::read_dir(dir_path);
    if let Err(e) = entries_result {
        return Err(format!("Failed to read directory: {}", e));
    }

    struct PartialEntry {
        name: String,
        path: String,
        is_dir: bool,
        extension: Option<String>,
        entry: fs::DirEntry,
    }

    let mut all_entries = Vec::new();
    for entry in entries_result.unwrap() {
        if all_entries.len() >= MAX_DIR_ENTRIES {
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().into_owned();

        if !settings.show_hidden_files && name.starts_with('.') {
            continue;
        }
        if !settings.show_system_files && is_hidden_or_system(&name, &entry.path()) {
            continue;
        }

        let extension = entry
            .path()
            .extension()
            .map(|e| e.to_string_lossy().to_string().to_lowercase());
        
        if let Some(ref ext) = extension {
            if settings.blocked_extensions.contains(ext) {
                continue;
            }
        }

        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        let path_str = entry.path().to_string_lossy().into_owned();

        all_entries.push(PartialEntry {
            name,
            path: path_str,
            is_dir,
            extension,
            entry,
        });
    }

    // Sorting
    // If sorting by size or modified, we're forced to fetch metadata for everyone upfront.
    // Oh well, this is unavoidable if the user explicitly switches the sort.
    let needs_full_metadata = sort_by == "size" || sort_by == "modified";
    
    // Convert to the final struct if needed for sorting, or map later. Let's build full entries where needed.
    let mut resolved_entries: Vec<FileEntry> = if needs_full_metadata {
        all_entries.into_iter().map(|p| {
            let metadata = p.entry.metadata().ok();
            let size = if p.is_dir { None } else { metadata.as_ref().map(|m| m.len()) };
            let modified = metadata
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs());
            FileEntry {
                name: p.name,
                path: p.path.clone(),
                canonical_path: p.path,
                is_dir: p.is_dir,
                size,
                modified,
                extension: p.extension,
            }
        }).collect()
    } else {
        // Fast path: Just sorting by name. We just sort the PartialEntries.
        all_entries.sort_by(|a, b| {
            let cmp = a.name.to_lowercase().cmp(&b.name.to_lowercase());
            if order == "desc" { cmp.reverse() } else { cmp }
        });

        let total = all_entries.len();
        let end = (offset + limit).min(total);
        let has_more = end < total || total >= MAX_DIR_ENTRIES;

        let chunk = if offset < total {
            all_entries[offset..end].iter().map(|p| {
                let metadata = p.entry.metadata().ok();
                let size = if p.is_dir { None } else { metadata.as_ref().map(|m| m.len()) };
                let modified = metadata
                    .as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());
                FileEntry {
                    name: p.name.clone(),
                    path: p.path.clone(),
                    canonical_path: p.path.clone(),
                    is_dir: p.is_dir,
                    size,
                    modified,
                    extension: p.extension.clone(),
                }
            }).collect()
        } else {
            Vec::new()
        };

        return Ok(DirectoryResponse {
            entries: chunk,
            total,
            has_more,
        });
    };

    // Slow path sorting branch (if 'size' or 'modified' was selected)
    resolved_entries.sort_by(|a, b| {
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

    let total = resolved_entries.len();
    let end = (offset + limit).min(total);
    let has_more = end < total || total >= MAX_DIR_ENTRIES;
    
    let chunk = if offset < total {
        resolved_entries[offset..end].to_vec()
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
