use serde::Serialize;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{AppHandle, Emitter};

use crate::commands::operation::{register_operation, unregister_operation};
use grep::regex::RegexMatcher;
use grep::searcher::{Searcher, Sink, SinkMatch};

/// Default max search results to avoid flooding the UI on huge drives.
const DEFAULT_RESULT_LIMIT: usize = 10_000;

#[derive(Serialize, Clone)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub line_number: Option<u64>,
    pub preview: Option<String>,
}

fn walk_builder(root: &str, max_depth: Option<u32>) -> ignore::Walk {
    let mut builder = ignore::WalkBuilder::new(root);
    builder.follow_links(false);
    builder.hidden(false); // Show hidden files
    builder.git_global(false);
    builder.git_ignore(false);
    builder.require_git(false);
    if let Some(d) = max_depth {
        builder.max_depth(Some(d as usize));
    }
    builder.build()
}

#[tauri::command]
pub async fn start_file_search(
    app: AppHandle,
    search_id: String,
    root: String,
    pattern: String,
    max_depth: Option<u32>,
    result_limit: Option<usize>,
    item_type: Option<String>,
    extensions: Option<Vec<String>>,
) -> Result<(), String> {
    let cancel_flag = register_operation(search_id.clone());
    let pattern = pattern.to_lowercase();
    let limit = result_limit.unwrap_or(DEFAULT_RESULT_LIMIT);
    let filter_type = item_type.unwrap_or_else(|| "both".to_string());

    tokio::task::spawn_blocking(move || {
        let count = AtomicUsize::new(0);
        for result in walk_builder(&root, max_depth) {
            if cancel_flag.load(Ordering::Relaxed) {
                break;
            }
            let entry = match result {
                Ok(e) => e,
                Err(_) => continue,
            };
            let path = entry.path();
            let is_dir = path.is_dir();

            // Apply item_type filter
            match filter_type.as_str() {
                "file" if is_dir => continue,
                "folder" if !is_dir => continue,
                _ => {}
            }

            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };

            // Filter out Mac metadata and GIFs (as requested)
            if name.starts_with("._") || name.to_lowercase().ends_with(".gif") {
                continue;
            }

            // Apply extension filtering if provided
            if let Some(ref exts) = extensions {
                if !is_dir {
                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                    if !exts.iter().any(|e| e.to_lowercase() == ext) {
                        continue;
                    }
                }
            }

            if name.to_lowercase().contains(&pattern) {
                let c = count.fetch_add(1, Ordering::Relaxed);
                if c >= limit {
                    break;
                }
                let _ = app.emit(
                    "search_result",
                    SearchResult {
                        path: path.to_string_lossy().into_owned(),
                        name: name.to_string(),
                        is_dir,
                        size: entry.metadata().ok().map(|m| m.len()),
                        line_number: None,
                        preview: None,
                    },
                );
            }
        }
        unregister_operation(&search_id);
        let _ = app.emit("search_completed", search_id);
    });

    Ok(())
}

struct ContentSearchSink<'a> {
    app: &'a AppHandle,
    path: String,
    name: String,
    count: &'a AtomicUsize,
    limit: usize,
}

impl<'a> Sink for ContentSearchSink<'a> {
    type Error = std::io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch<'_>) -> Result<bool, Self::Error> {
        if self.count.load(Ordering::Relaxed) >= self.limit {
            return Ok(false);
        }
        self.count.fetch_add(1, Ordering::Relaxed);
        let preview = String::from_utf8_lossy(mat.bytes()).trim().to_string();
        let size = std::fs::metadata(&self.path).ok().map(|m| m.len());
        let _ = self.app.emit(
            "search_result",
            SearchResult {
                path: self.path.clone(),
                name: self.name.clone(),
                is_dir: false,
                size,
                line_number: Some(mat.line_number().unwrap_or(0)),
                preview: Some(preview),
            },
        );
        Ok(true)
    }
}

#[tauri::command]
pub async fn start_content_search(
    app: AppHandle,
    search_id: String,
    root: String,
    pattern: String,
    max_depth: Option<u32>,
    result_limit: Option<usize>,
    item_type: Option<String>,
    extensions: Option<Vec<String>>,
) -> Result<(), String> {
    let cancel_flag = register_operation(search_id.clone());
    let matcher = RegexMatcher::new(&pattern).map_err(|e| e.to_string())?;
    let mut searcher = Searcher::new();
    let limit = result_limit.unwrap_or(DEFAULT_RESULT_LIMIT);
    let filter_type = item_type.unwrap_or_else(|| "both".to_string());

    tokio::task::spawn_blocking(move || {
        let count = AtomicUsize::new(0);
        for result in walk_builder(&root, max_depth) {
            if cancel_flag.load(Ordering::Relaxed) {
                break;
            }
            let entry = match result {
                Ok(e) => e,
                Err(_) => continue,
            };

            let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

            // Apply item_type filter
            match filter_type.as_str() {
                "file" if is_dir => continue,
                "folder" if !is_dir => continue,
                _ => {}
            }

            // Content search only makes sense for files
            if is_dir {
                continue;
            }

            let path = entry.path();
            let path_str = path.to_string_lossy().into_owned();
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            // Filter out Mac metadata and GIFs (as requested)
            if name.starts_with("._") || name.to_lowercase().ends_with(".gif") {
                continue;
            }

            // Apply extension filtering if provided
            if let Some(ref exts) = extensions {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                if !exts.iter().any(|e| e.to_lowercase() == ext) {
                    continue;
                }
            }

            let mut sink = ContentSearchSink {
                app: &app,
                path: path_str,
                name,
                count: &count,
                limit,
            };
            let _ = searcher.search_path(&matcher, path, &mut sink);
        }
        unregister_operation(&search_id);
        let _ = app.emit("search_completed", search_id);
    });

    Ok(())
}
