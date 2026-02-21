use crate::commands::settings::ConfigSection;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileCategory {
    Image,
    Video,
    Audio,
    Text,
    Document,
    Archive,
    Other,
}

pub fn get_file_category(extension: &str) -> FileCategory {
    let ext = extension.to_lowercase();
    let ext = ext.trim_start_matches('.');

    match ext {
        // Video
        "mp4" | "m4v" | "webm" | "mkv" | "mov" | "avi" | "wmv" | "asf" | "ts" | "mts" | "m2ts" | "m3u8" |
        "mpeg" | "mpg" | "mp2" | "mpe" | "mpv" | "flv" | "f4v" | "3gp" | "3g2" | "ogv" | "vob" | "rm" |
        "rmvb" | "divx" | "mk3d" | "qt" | "hevc" | "h265" | "h264" => FileCategory::Video,

        // Image
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "avif" | "heic" | "heif" | "tiff" |
        "tif" | "ico" | "icns" | "raw" | "cr2" | "nef" | "arw" | "dng" | "orf" | "rw2" | "jfif" |
        "pjpeg" | "pjp" => FileCategory::Image,

        // Audio
        "mp3" | "wav" | "ogg" | "oga" | "flac" | "m4a" | "aac" | "wma" | "aiff" | "aif" | "alac" |
        "opus" | "mid" | "midi" | "amr" | "ape" | "wv" | "caf" => FileCategory::Audio,

        // Text
        "txt" | "md" | "markdown" | "js" | "mjs" | "cjs" | "jsx" | "tsx" | "json" | "jsonc" |
        "yaml" | "yml" | "html" | "htm" | "css" | "scss" | "sass" | "xml" | "csv" | "tsv" | "sql" |
        "sh" | "bash" | "zsh" | "ps1" | "env" | "ini" | "conf" | "config" | "toml" | "py" | "rs" |
        "java" | "c" | "cpp" | "h" | "hpp" | "go" | "php" | "rb" | "swift" | "kt" | "dart" | "r" |
        "lua" | "pl" => FileCategory::Text,

        // Document
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt" | "ods" | "odp" | "pages" |
        "numbers" | "key" | "rtf" => FileCategory::Document,

        // Archive
        "zip" | "tar" | "gz" | "tgz" | "bz2" | "xz" | "7z" | "rar" | "iso" | "cab" | "ar" | "lz" |
        "lzma" | "z" | "war" | "ear" => FileCategory::Archive,

        _ => FileCategory::Other,
    }
}

pub fn is_category_enabled(category: FileCategory, settings: &ConfigSection) -> bool {
    match category {
        FileCategory::Image => settings.preview_enabled.image,
        FileCategory::Video => settings.preview_enabled.video,
        FileCategory::Audio => settings.preview_enabled.audio,
        FileCategory::Text => settings.preview_enabled.text,
        FileCategory::Document => settings.preview_enabled.document,
        FileCategory::Archive => settings.preview_enabled.archive,
        FileCategory::Other => settings.preview_enabled.other,
    }
}
