use serde::{Serialize, Deserialize};
use super::super::commands::settings::ConfigSection;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum FileCategory {
    Image,
    Video,
    Audio,
    Document,
    Archive,
    Other,
}

pub fn get_file_category(extension: &str) -> FileCategory {
    let ext = extension.to_lowercase();
    let ext = ext.trim_start_matches('.');

    if is_image_extension(ext) { return FileCategory::Image; }
    if is_video_extension(ext) { return FileCategory::Video; }
    if is_audio_extension(ext) { return FileCategory::Audio; }
    if is_document_extension(ext) { return FileCategory::Document; }
    if is_archive_extension(ext) { return FileCategory::Archive; }
    
    FileCategory::Other
}

pub fn is_category_enabled(category: FileCategory, settings: &ConfigSection) -> bool {
    match category {
        FileCategory::Image => settings.preview_enabled.image,
        FileCategory::Video => settings.preview_enabled.video,
        FileCategory::Audio => settings.preview_enabled.audio,
        FileCategory::Document => settings.preview_enabled.document,
        FileCategory::Archive => settings.preview_enabled.archive,
        FileCategory::Other => false, // Always disabled for core views
    }
}

fn is_image_extension(ext: &str) -> bool {
    matches!(ext, "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "svg" | "tiff" | "ico" | "heic" | "heif" | "avif")
}

fn is_video_extension(ext: &str) -> bool {
    matches!(ext, "mp4" | "m4v" | "webm" | "mkv" | "mov" | "avi" | "wmv" | "asf" | "ts" | "mts" | "m2ts" | "m3u8" | "mpeg" | "mpg" | "mp2" | "mpe" | "mpv" | "flv" | "f4v" | "3gp" | "3g2" | "ogv" | "vob" | "rm" | "rmvb" | "divx" | "mk3d" | "qt" | "hevc" | "h265" | "h264")
}

fn is_audio_extension(ext: &str) -> bool {
    matches!(ext, "mp3" | "wav" | "ogg" | "oga" | "flac" | "m4a" | "aac" | "wma" | "aiff" | "aif" | "alac" | "opus" | "mid" | "midi" | "amr" | "ape" | "wv" | "caf")
}

fn is_document_extension(ext: &str) -> bool {
    matches!(ext, "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt" | "ods" | "odp" | "pages" | "numbers" | "key" | "rtf" | "txt")
}

fn is_archive_extension(ext: &str) -> bool {
    matches!(ext, "zip" | "tar" | "gz" | "tgz" | "bz2" | "xz" | "7z" | "rar" | "iso" | "cab" | "ar" | "lz" | "lzma" | "z" | "war" | "ear")
}
