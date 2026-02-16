use serde::Serialize;

#[derive(Serialize)]
pub struct ThumbnailData {
    pub path: String,
    pub data: String, // Base64 or protocol URI
}

#[tauri::command]
pub async fn generate_thumbnail(_path: String) -> Result<ThumbnailData, String> {
    // Placeholder
    Ok(ThumbnailData {
        path: _path,
        data: "".to_string(),
    })
}

#[tauri::command]
pub async fn get_metadata(_path: String) -> Result<String, String> {
    // Placeholder
    Ok("{}".to_string())
}
