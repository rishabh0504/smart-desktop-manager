use base64::{engine::general_purpose, Engine as _};
use image::imageops::FilterType;
use std::path::Path;

/// Max file size (bytes) to decode for thumbnails — avoids memory spikes on huge RAWs/DSLR.
const MAX_THUMBNAIL_DECODE_BYTES: u64 = 25 * 1024 * 1024; // 25 MB

#[tauri::command]
pub async fn get_thumbnail(path: String, width: u32, height: u32) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }
    let meta = std::fs::metadata(p).map_err(|e| format!("Failed to read file: {}", e))?;
    if meta.len() > MAX_THUMBNAIL_DECODE_BYTES {
        return Err(format!(
            "Image too large for thumbnail (max {} MB)",
            MAX_THUMBNAIL_DECODE_BYTES / (1024 * 1024)
        ));
    }

    let img = image::open(p).map_err(|e| format!("Failed to open image: {}", e))?;
    let thumbnail = img.resize_to_fill(width, height, FilterType::Lanczos3);

    let mut buffer = std::io::Cursor::new(Vec::new());
    thumbnail
        .write_to(&mut buffer, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode image: {}", e))?;

    let base64_str = general_purpose::STANDARD.encode(buffer.into_inner());
    Ok(format!("data:image/jpeg;base64,{}", base64_str))
}
