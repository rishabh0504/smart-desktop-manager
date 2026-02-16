use serde::Serialize;
use walkdir::WalkDir;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter};
use crate::commands::operation::{register_operation, unregister_operation};
use grep::searcher::{Searcher, Sink, SinkMatch};
use grep::regex::RegexMatcher;

#[derive(Serialize, Clone)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub line_number: Option<u64>,
    pub preview: Option<String>,
}

#[tauri::command]
pub async fn start_file_search(
    app: AppHandle,
    search_id: String,
    root: String,
    pattern: String,
) -> Result<(), String> {
    let cancel_flag = register_operation(search_id.clone());
    let pattern = pattern.to_lowercase();

    tokio::task::spawn_blocking(move || {
        for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
            if cancel_flag.load(Ordering::Relaxed) {
                break;
            }

            let name = entry.file_name().to_string_lossy();
            if name.to_lowercase().contains(&pattern) {
                let _ = app.emit("search_result", SearchResult {
                    path: entry.path().to_string_lossy().into_owned(),
                    name: name.into_owned(),
                    is_dir: entry.file_type().is_dir(),
                    line_number: None,
                    preview: None,
                });
            }
        }
        unregister_operation(&search_id);
        let _ = app.emit("search_completed", search_id);
    });

    Ok(())
}

struct MySink<'a> {
    app: &'a AppHandle,
    path: String,
    name: String,
}

impl<'a> Sink for MySink<'a> {
    type Error = std::io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch<'_>) -> Result<bool, Self::Error> {
        let preview = String::from_utf8_lossy(mat.bytes()).trim().to_string();
        let _ = self.app.emit("search_result", SearchResult {
            path: self.path.clone(),
            name: self.name.clone(),
            is_dir: false,
            line_number: Some(mat.line_number().unwrap_or(0)),
            preview: Some(preview),
        });
        Ok(true)
    }
}

#[tauri::command]
pub async fn start_content_search(
    app: AppHandle,
    search_id: String,
    root: String,
    pattern: String,
) -> Result<(), String> {
    let cancel_flag = register_operation(search_id.clone());
    let matcher = RegexMatcher::new(&pattern).map_err(|e| e.to_string())?;
    let mut searcher = Searcher::new();

    tokio::task::spawn_blocking(move || {
        for entry in WalkDir::new(&root).into_iter().filter_map(|e| e.ok()) {
            if cancel_flag.load(Ordering::Relaxed) {
                break;
            }

            if entry.file_type().is_file() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().into_owned();
                let mut sink = MySink {
                    app: &app,
                    path: path.to_string_lossy().into_owned(),
                    name,
                };
                let _ = searcher.search_path(&matcher, path, &mut sink);
            }
        }
        unregister_operation(&search_id);
        let _ = app.emit("search_completed", search_id);
    });

    Ok(())
}
