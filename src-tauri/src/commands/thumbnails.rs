use base64::{engine::general_purpose, Engine as _};
use image::{imageops::FilterType};
use std::path::Path;

#[tauri::command]
pub async fn get_thumbnail(path: String, width: u32, height: u32) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }

    // Load image
    let img = image::open(p).map_err(|e| format!("Failed to open image: {}", e))?;
    
    // Resize (maintain aspect ratio)
    let thumbnail = img.resize_to_fill(width, height, FilterType::Lanczos3);
    
    // Encode to JPEG in memory
    let mut buffer = std::io::Cursor::new(Vec::new());
    thumbnail.write_to(&mut buffer, image::ImageFormat::Jpeg).map_err(|e| format!("Failed to encode image: {}", e))?;
    
    // Convert to base64
    let base64_str = general_purpose::STANDARD.encode(buffer.into_inner());
    Ok(format!("data:image/jpeg;base64,{}", base64_str))
}
