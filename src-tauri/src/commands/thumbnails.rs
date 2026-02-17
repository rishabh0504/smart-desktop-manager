use base64::{engine::general_purpose, Engine as _};
use image::imageops::FilterType;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::UNIX_EPOCH;
use lazy_static::lazy_static;
use tauri::Manager;

/// Max file size (bytes) to decode for thumbnails — avoids memory spikes on huge RAWs/DSLR.
const MAX_THUMBNAIL_DECODE_BYTES: u64 = 25 * 1024 * 1024; // 25 MB

/// Video thumbnail cache limits (for 5TB-scale: keep cache bounded).
const VIDEO_CACHE_DIR_NAME: &str = "video_thumbnails";
const MAX_CACHE_FILES: usize = 2000;
const MAX_CACHE_BYTES: u64 = 400 * 1024 * 1024; // 400 MB
const MEMORY_CACHE_CAP: u64 = 80;
const VIDEO_THUMB_DURATION_SECS: &str = "2";

lazy_static! {
    /// In-memory LRU for same-session repeat requests (avoids disk I/O).
    static ref MEMORY_CACHE: moka::sync::Cache<String, String> = moka::sync::Cache::builder()
        .max_capacity(MEMORY_CACHE_CAP)
        .build();
}

fn video_cache_key(path: &str, width: u32, height: u32, mtime_nanos: u64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    hasher.update(&[0]);
    hasher.update(width.to_string().as_bytes());
    hasher.update(&[0]);
    hasher.update(height.to_string().as_bytes());
    hasher.update(&[0]);
    hasher.update(mtime_nanos.to_string().as_bytes());
    hex::encode(hasher.finalize())
}

fn video_cache_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_cache_dir()
        .map(|p| p.join(VIDEO_CACHE_DIR_NAME))
        .unwrap_or_else(|_| {
            std::env::temp_dir()
                .join("smart-desktop-manager")
                .join(VIDEO_CACHE_DIR_NAME)
        })
}

/// Cache file extension: zstd-compressed GIF to save disk (fast encode/decode, minimal latency).
const CACHE_EXT: &str = "zst";
/// zstd level 1 = fast, still good ratio for GIFs.
const ZSTD_LEVEL: i32 = 1;

/// Evict oldest cache files by mtime until under MAX_CACHE_FILES and MAX_CACHE_BYTES.
fn evict_disk_cache_if_needed(cache_dir: &Path, new_file_size: u64) {
    let entries: Vec<_> = match std::fs::read_dir(cache_dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let path = e.path();
                let ext = path.extension().and_then(|x| x.to_str());
                if ext == Some(CACHE_EXT) || ext == Some("gif") {
                    let meta = std::fs::metadata(&path).ok()?;
                    let mtime = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_nanos() as u64;
                    Some((path, mtime, meta.len()))
                } else {
                    None
                }
            })
            .collect(),
        Err(_) => return,
    };
    let mut total: u64 = entries.iter().map(|(_, _, len)| len).sum::<u64>() + new_file_size;
    let mut count = entries.len() + 1;
    let mut by_age: Vec<_> = entries.into_iter().map(|(p, mtime, len)| (p, mtime, len)).collect();
    by_age.sort_by_key(|(_, mtime, _)| *mtime);
    for (path, _, len) in by_age {
        if count <= MAX_CACHE_FILES && total <= MAX_CACHE_BYTES {
            break;
        }
        let _ = std::fs::remove_file(&path);
        count = count.saturating_sub(1);
        total = total.saturating_sub(len);
    }
}

/// Common locations for ffmpeg when the app is launched from a bundle (e.g. .app) and has minimal PATH.
fn ffmpeg_paths_to_try() -> Vec<&'static str> {
    #[cfg(target_os = "macos")]
    return vec!["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"];
    #[cfg(not(target_os = "macos"))]
    return vec!["ffmpeg"];
}

/// Extract multiple frames as a short animated GIF for video preview (requires ffmpeg on PATH).
/// Uses first 2 seconds at 2 fps (4 frames). Results are cached on disk (with size limits) and in memory.
#[tauri::command]
pub async fn get_video_thumbnail(
    app: tauri::AppHandle,
    path: String,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_file() {
        return Err("File not found".to_string());
    }
    let mtime_nanos = std::fs::metadata(p)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?
        .modified()
        .map_err(|e| format!("Failed to get mtime: {}", e))?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Invalid mtime: {}", e))?
        .as_nanos() as u64;
    let cache_key = video_cache_key(&path, width, height, mtime_nanos);
    let cache_dir = video_cache_dir(&app);

    if let Some(data_url) = MEMORY_CACHE.get(&cache_key) {
        return Ok(data_url);
    }

    let cache_path_zst = cache_dir.join(format!("{}.{}", cache_key, CACHE_EXT));
    let cache_path_gif = cache_dir.join(format!("{}.gif", cache_key));
    if cache_path_zst.exists() {
        let compressed = std::fs::read(&cache_path_zst).map_err(|e| format!("Failed to read cache: {}", e))?;
        let bytes = zstd::decode_all(compressed.as_slice()).map_err(|e| format!("Failed to decompress cache: {}", e))?;
        let data_url = format!("data:image/gif;base64,{}", general_purpose::STANDARD.encode(&bytes));
        MEMORY_CACHE.insert(cache_key.clone(), data_url.clone());
        return Ok(data_url);
    }
    if cache_path_gif.exists() {
        let bytes = std::fs::read(&cache_path_gif).map_err(|e| format!("Failed to read cache: {}", e))?;
        let data_url = format!("data:image/gif;base64,{}", general_purpose::STANDARD.encode(&bytes));
        MEMORY_CACHE.insert(cache_key.clone(), data_url.clone());
        return Ok(data_url);
    }

    let _ = std::fs::create_dir_all(&cache_dir);
    let filter = format!(
        "fps=2,scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:color=black",
        width, height, width, height
    );
    let args = [
        "-y",
        "-i",
        path.as_str(),
        "-vf",
        filter.as_str(),
        "-t",
        VIDEO_THUMB_DURATION_SECS,
        "-f",
        "gif",
        "pipe:1",
    ];
    let mut last_err = String::new();
    for ffmpeg_bin in ffmpeg_paths_to_try() {
        let result = std::process::Command::new(ffmpeg_bin)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output();
        match result {
            Ok(output) if output.status.success() => {
                let bytes = output.stdout;
                let compressed = match zstd::encode_all(bytes.as_slice(), ZSTD_LEVEL) {
                    Ok(c) => c,
                    Err(_) => bytes.clone(),
                };
                let size_for_eviction = compressed.len() as u64;
                evict_disk_cache_if_needed(&cache_dir, size_for_eviction);
                if std::fs::write(&cache_path_zst, &compressed).is_err() {
                    // non-fatal: still return the thumbnail
                }
                let data_url = format!("data:image/gif;base64,{}", general_purpose::STANDARD.encode(&bytes));
                MEMORY_CACHE.insert(cache_key, data_url.clone());
                return Ok(data_url);
            }
            Ok(_) => continue,
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(format!("ffmpeg not available: {}", last_err))
}

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
