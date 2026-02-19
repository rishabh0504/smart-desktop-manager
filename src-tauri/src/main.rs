// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::dir::{read_dir_chunked, create_folder, create_file, rename_item};
use commands::copy::start_copy;
use commands::move_op::start_move;
use commands::batch::{delete_items, batch_copy, batch_move, fast_copy};
use commands::thumbnails::{get_thumbnail, get_video_thumbnail};
use commands::preview_op::{get_file_text_content, get_file_base64_content, get_file_blob, show_in_finder, open_item};
use commands::operation::cancel_operation;
use commands::search::{start_file_search, start_content_search};

use commands::volumes::list_volumes;
use commands::settings::{load_settings, save_settings};
use commands::dedupe::find_duplicates;
use commands::content_search::find_content_by_category;
use commands::tree::get_tree_nodes;
use commands::cleaner::{find_empty_folders, delete_empty_folders};

use tauri::http::{header::*, Response, status::StatusCode};
use std::io::{Read, Seek, SeekFrom};
use percent_encoding::percent_decode_str;

fn main() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("vmedia", |_app, request| {
            let path = request.uri().path();
            // In Tauri v2, the path might be double-encoded or have a leading /
            let decoded_path = percent_decode_str(path.trim_start_matches('/'))
                .decode_utf8_lossy()
                .into_owned();
            
            let file_path = std::path::Path::new(&decoded_path);
            if !file_path.exists() || !file_path.is_file() {
                return Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Vec::new())
                    .unwrap();
            }

            let mut file = match std::fs::File::open(file_path) {
                Ok(f) => f,
                Err(_) => return Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .body(Vec::new())
                    .unwrap(),
            };

            let metadata = file.metadata().unwrap();
            let file_size = metadata.len();
            let mime_type = mime_guess::from_path(file_path).first_or_octet_stream().to_string();

            let range_header = request.headers().get(RANGE);
            
            let (start, end, status) = if let Some(range) = range_header {
                let range_str = range.to_str().unwrap_or("");
                if range_str.starts_with("bytes=") {
                    let parts: Vec<&str> = range_str["bytes=".len()..].split('-').collect();
                    let start = parts[0].parse::<u64>().unwrap_or(0);
                    let end = if parts.len() > 1 && !parts[1].is_empty() {
                        parts[1].parse::<u64>().unwrap_or(file_size - 1)
                    } else {
                        file_size - 1
                    };
                    (start, end, StatusCode::PARTIAL_CONTENT)
                } else {
                    (0, file_size - 1, StatusCode::OK)
                }
            } else {
                // Default to first 2MB if no range is requested for large files to avoid OOM
                let end = std::cmp::min(file_size, 2 * 1024 * 1024) - 1;
                (0, end, StatusCode::PARTIAL_CONTENT)
            };

            let content_length = end - start + 1;
            // Cap chunk size at 10MB to be safe
            let actual_len = std::cmp::min(content_length, 10 * 1024 * 1024);
            let mut buffer = vec![0u8; actual_len as usize];
            if file.seek(SeekFrom::Start(start)).is_err() {
                return Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .body(Vec::new())
                    .unwrap();
            }
            let n = file.read(&mut buffer).unwrap_or(0);
            buffer.truncate(n);

            Response::builder()
                .status(status)
                .header(CONTENT_TYPE, mime_type)
                .header(CONTENT_LENGTH, n.to_string())
                .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .header(CONTENT_RANGE, format!("bytes {}-{}/{}", start, start + (n as u64) - 1, file_size))
                .header(ACCEPT_RANGES, "bytes")
                .body(buffer)
                .unwrap()
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_dir_chunked,
            create_folder,
            create_file,
            rename_item,
            start_copy,
            start_move,
            delete_items,
            batch_copy,
            batch_move,
            fast_copy,
            get_thumbnail,
            get_video_thumbnail,
            get_file_text_content,
            get_file_base64_content,
            get_file_blob,
            show_in_finder,
            open_item,
            cancel_operation,
            start_file_search,
            start_content_search,
            list_volumes,
            load_settings,
            save_settings,
            find_duplicates,
            find_content_by_category,
            get_tree_nodes,
            find_empty_folders,
            delete_empty_folders,
            crate::commands::setup::check_system_requirements,
            crate::commands::setup::check_ollama_status,
            crate::commands::setup::pull_model,
            crate::commands::setup::is_setup_complete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
