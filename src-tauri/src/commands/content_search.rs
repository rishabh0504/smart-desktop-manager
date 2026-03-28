use std::path::{PathBuf, Path};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Instant;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Runtime};

use super::settings::ConfigSection;
use super::dedupe::ProgressEvent;
use crate::utils::file_types::{get_file_category, is_category_enabled, FileCategory};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContentGroup {
    pub category: String,
    pub paths: Vec<String>,
}

fn is_system_path(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    #[cfg(target_os = "macos")]
    {
        path_str == "/System" || path_str.starts_with("/System/") ||
        path_str == "/Library" || path_str.starts_with("/Library/") ||
        path_str == "/private" || path_str.starts_with("/private/") ||
        path_str == "/Applications" || path_str.starts_with("/Applications/") ||
        path_str == "/bin" || path_str == "/usr" || path_str == "/sbin" ||
        path_str == "/dev" || path_str == "/etc"
    }
    #[cfg(target_os = "windows")]
    {
        let p_upper = path_str.to_uppercase();
        p_upper.contains("WINDOWS") || p_upper.contains("PROGRAM FILES") ||
        p_upper.contains("PROGRAM DATA") || p_upper.contains("RECYCLE.BIN") ||
        p_upper.contains("SYSTEM VOLUME INFORMATION")
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        path_str.starts_with("/proc") || path_str.starts_with("/sys") ||
        path_str.starts_with("/boot") || path_str.starts_with("/dev")
    }
}

#[tauri::command]
pub async fn find_content_by_category<R: Runtime>(
    app: tauri::AppHandle<R>,
    paths: Vec<String>,
    settings: ConfigSection,
) -> Result<Vec<ContentGroup>, String> {
    let start_time = Instant::now();
    
    let mut unique_paths: Vec<PathBuf> = paths.into_iter()
        .map(PathBuf::from)
        .filter(|p| p.exists() && !is_system_path(p))
        .collect();
    
    unique_paths.sort();
    let mut cleaned_paths = Vec::new();
    for path in unique_paths {
        if !cleaned_paths.iter().any(|p: &PathBuf| path.starts_with(p)) {
            cleaned_paths.push(path);
        }
    }

    let scanned_count = Arc::new(AtomicUsize::new(0));
    let progress_active = Arc::new(std::sync::atomic::AtomicBool::new(true));
    let last_path_shared = Arc::new(std::sync::Mutex::new(String::new()));

    let app_handle = app.clone();
    let scanned_clone = scanned_count.clone();
    let path_clone = last_path_shared.clone();
    let active_clone = progress_active.clone();

    tokio::spawn(async move {
        while active_clone.load(Ordering::Relaxed) {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            
            let current_path = if let Ok(p) = path_clone.lock() { p.clone() } else { String::new() };
            
            let _ = app_handle.emit("content-progress", ProgressEvent {
                scanned: scanned_clone.load(Ordering::Relaxed),
                duplicates_found: 0,
                current_path,
                status: "Scanning folders...".to_string(),
                percent: 0,
                phase: 0,
                total_files: 0,
                elapsed_ms: start_time.elapsed().as_millis() as u64,
            });
        }
    });

    let mut groups: HashMap<String, Vec<String>> = HashMap::new();

    for start_path in &cleaned_paths {
        let mut walker = ignore::WalkBuilder::new(start_path);
        walker.follow_links(false);
        for result in walker.build() {
            let entry = match result {
                Ok(e) => e,
                Err(_) => continue,
            };
            
            if !entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                continue;
            }

            let path = entry.path().to_path_buf();
            if is_system_path(&path) { continue; }
            
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

            if !settings.show_hidden_files && name.starts_with('.') {
                continue;
            }

            let extension = path.extension().map(|e| e.to_string_lossy().to_string().to_lowercase()).unwrap_or_default();
            
            if settings.blocked_extensions.contains(&extension) {
                continue;
            }

            if settings.blocked_names.contains(&name) {
                continue;
            }

            let file_cat = get_file_category(&extension);
            if !is_category_enabled(file_cat, &settings) {
                continue;
            }

            let category = match file_cat {
                FileCategory::Image => Some("Images"),
                FileCategory::Video => Some("Videos"),
                FileCategory::Audio => Some("Audio"),
                FileCategory::Document => Some("Documents"),
                FileCategory::Archive => Some("Compressed"),
                _ => None,
            };

            if let Some(cat) = category {
                let path_str = path.to_string_lossy().to_string();
                groups.entry(cat.to_string()).or_default().push(path_str.clone());
                
                scanned_count.fetch_add(1, Ordering::Relaxed);
                if let Ok(mut p) = last_path_shared.lock() {
                    *p = path_str;
                }
            }
        }
    }

    progress_active.store(false, Ordering::Relaxed);

    let result: Vec<ContentGroup> = groups.into_iter()
        .map(|(category, paths)| ContentGroup { category, paths })
        .collect();

    // Final progress event
    let _ = app.emit("content-progress", ProgressEvent {
        scanned: scanned_count.load(Ordering::Relaxed),
        duplicates_found: 0,
        current_path: "Scan complete".to_string(),
        status: "Done".to_string(),
        percent: 100,
        phase: 3,
        total_files: 0,
        elapsed_ms: start_time.elapsed().as_millis() as u64,
    });

    Ok(result)
}
