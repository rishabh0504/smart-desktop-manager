pub mod commands;
pub mod utils;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            crate::commands::dir::read_dir_chunked,
            crate::commands::dir::create_folder,
            crate::commands::dir::create_file,
            crate::commands::dir::rename_item,
            crate::commands::copy::start_copy,
            crate::commands::move_op::start_move,
            crate::commands::batch::delete_items,
            crate::commands::batch::check_paths_exist,
            crate::commands::batch::batch_copy,
            crate::commands::batch::batch_move,
            crate::commands::batch::fast_copy,
            crate::commands::thumbnails::get_thumbnail,
            crate::commands::thumbnails::get_video_thumbnail,
            crate::commands::preview_op::get_file_text_content,
            crate::commands::preview_op::get_file_base64_content,
            crate::commands::preview_op::get_file_blob,
            crate::commands::preview_op::show_in_finder,
            crate::commands::preview_op::open_item,
            crate::commands::operation::cancel_operation,
            crate::commands::search::start_file_search,
            crate::commands::search::start_content_search,
            crate::commands::volumes::list_volumes,
            crate::commands::settings::load_settings,
            crate::commands::settings::save_settings,
            crate::commands::dedupe::find_duplicates,
            crate::commands::content_search::find_content_by_category,
            crate::commands::tree::get_tree_nodes,
            crate::commands::cleaner::find_empty_folders,
            crate::commands::cleaner::delete_empty_folders,
            crate::commands::setup::check_system_requirements,
            crate::commands::setup::check_ollama_status,
            crate::commands::setup::pull_model,
            crate::commands::setup::is_setup_complete,
            crate::commands::archive::extract_archive,
            crate::commands::archive::compress_to_zip
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
