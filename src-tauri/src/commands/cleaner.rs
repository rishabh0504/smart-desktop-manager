use std::path::{Path, PathBuf};
use std::fs;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Runtime};
use std::time::Instant;
use super::settings::ConfigSection;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CleanProgressEvent {
    pub scanned_folders: usize,
    pub empty_folders_found: usize,
    pub current_path: String,
    pub status: String,
    pub elapsed_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmptyFolder {
    pub path: String,
    pub name: String,
    pub parent_path: String,
}

#[tauri::command]
pub async fn find_empty_folders<R: Runtime>(
    app: tauri::AppHandle<R>,
    paths: Vec<String>,
    settings: ConfigSection,
) -> Result<Vec<EmptyFolder>, String> {
    let start_time = Instant::now();
    let mut empty_folders = Vec::new();
    let mut scanned_count = 0;

    for start_path in paths {
        let path = PathBuf::from(&start_path);
        if !path.exists() || !path.is_dir() {
            continue;
        }

        // We use a simple recursive function to find empty folders.
        // A folder is empty if it contains no files and all its subfolders are also empty.
        find_recursive(&path, &settings, &mut empty_folders, &mut scanned_count, &app, start_time).await;
    }

    let _ = app.emit("clean-progress", CleanProgressEvent {
        scanned_folders: scanned_count,
        empty_folders_found: empty_folders.len(),
        current_path: "Scan complete".to_string(),
        status: "Done".to_string(),
        elapsed_ms: start_time.elapsed().as_millis() as u64,
    });

    Ok(empty_folders)
}

async fn find_recursive<R: Runtime>(
    path: &Path,
    settings: &ConfigSection,
    results: &mut Vec<EmptyFolder>,
    scanned_count: &mut usize,
    app: &tauri::AppHandle<R>,
    start_time: Instant,
) -> bool {
    *scanned_count += 1;
    
    // Periodic progress update
    if *scanned_count % 50 == 0 {
        let _ = app.emit("clean-progress", CleanProgressEvent {
            scanned_folders: *scanned_count,
            empty_folders_found: results.len(),
            current_path: path.to_string_lossy().to_string(),
            status: "Scanning...".to_string(),
            elapsed_ms: start_time.elapsed().as_millis() as u64,
        });
    }

    let entries = match fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return false,
    };

    let mut is_empty = true;
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        
        let name = entry.file_name().to_string_lossy().to_string();
        
        // Always ignore __MACOSX directories entirely for emptiness checks
        if name == "__MACOSX" {
            continue;
        }
        
        // Respect hidden/system toggles
        if !settings.show_hidden_files && name.starts_with('.') {
            continue;
        }
        
        // System files check can be more complex, but we'll stick to basic visibility for now
        // to match the requested "all" (hidden/system) logic.

        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if file_type.is_file() {
            is_empty = false;
        } else if file_type.is_dir() {
            let child_is_empty = Box::pin(find_recursive(&entry.path(), settings, results, scanned_count, app, start_time)).await;
            if !child_is_empty {
                is_empty = false;
            }
        } else {
            // Symlinks etc. - treat as non-empty or skip?
            // Usually we don't want to delete folders containing symlinks.
            is_empty = false;
        }
    }

    if is_empty {
        results.push(EmptyFolder {
            path: path.to_string_lossy().to_string(),
            name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
            parent_path: path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|| "/".to_string()),
        });
    }

    is_empty
}

#[tauri::command]
pub async fn delete_empty_folders(paths: Vec<String>) -> Result<(), String> {
    for path_str in paths {
        let path = PathBuf::from(&path_str);
        if !path.exists() || !path.is_dir() {
            continue;
        }

        // Delete the directory and any allowed hidden contents
        if let Err(e) = fs::remove_dir_all(&path) {
            // Fallback for tricky macOS folders or permissions
            #[cfg(unix)]
            let fallback_status = std::process::Command::new("rm")
                .arg("-rf")
                .arg(&path)
                .status();

            #[cfg(windows)]
            let fallback_status = std::process::Command::new("cmd")
                .arg("/c")
                .arg("rmdir")
                .arg("/s")
                .arg("/q")
                .arg(&path)
                .status();

            // If fallback failed or the directory still exists, return the original error
            if fallback_status.is_err() || !fallback_status.unwrap().success() || path.exists() {
                return Err(format!("Failed to delete {}: {}", path_str, e));
            }
        }

        // Recursive parent cleanup
        let mut current_parent = path.parent();
        while let Some(parent) = current_parent {
            // Check if parent is now empty (or only contains hidden/__MACOSX files)
            if is_dir_empty(parent) {
                if let Err(_) = fs::remove_dir_all(parent) {
                    // Stop if we hit permissions or root
                    break;
                }
                current_parent = parent.parent();
            } else {
                break;
            }
        }
    }
    Ok(())
}

fn is_dir_empty(path: &Path) -> bool {
    match fs::read_dir(path) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(e) = entry {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name != "__MACOSX" && !name.starts_with('.') {
                        return false;
                    }
                }
            }
            true
        },
        Err(_) => false,
    }
}
