export const VIDEO_EXTENSIONS = [
    'mp4', 'm4v', 'webm', 'mkv', 'mov',
    'avi', 'wmv', 'asf',
    'ts', 'mts', 'm2ts', 'm3u8',
    'mpeg', 'mpg', 'mp2', 'mpe', 'mpv',
    'flv', 'f4v',
    '3gp', '3g2',
    'ogv',
    'vob', 'rm', 'rmvb', 'divx',
    'mk3d', 'qt',
    'hevc', 'h265', 'h264'
];

export const IMAGE_EXTENSIONS = [
    // Common web
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
    // Modern high-efficiency
    'avif', 'heic', 'heif',
    // High quality / print
    'tiff', 'tif',
    // Icons
    'ico', 'icns',
    // Camera RAW formats
    'raw', 'cr2', 'nef', 'arw', 'dng', 'orf', 'rw2',
    // Legacy
    'jfif', 'pjpeg', 'pjp'
];

export const AUDIO_EXTENSIONS = [
    'mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a',
    'aac', 'wma', 'aiff', 'aif', 'alac', 'opus',
    // Pro audio
    'mid', 'midi', 'amr', 'ape', 'wv',
    // Apple
    'caf'
];

export const TEXT_EXTENSIONS = [
    'txt', 'md', 'markdown',
    'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx',
    'json', 'jsonc',
    'yaml', 'yml',
    'html', 'htm', 'css', 'scss', 'sass',
    'xml', 'csv', 'tsv',
    'sql',
    'sh', 'bash', 'zsh', 'ps1',
    'env', 'ini', 'conf', 'config',
    'toml',
    'py', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
    'go', 'php', 'rb', 'swift', 'kt', 'dart',
    'r', 'lua', 'pl'
];

export const DOCUMENT_EXTENSIONS = [
    'pdf',
    // Microsoft Office
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    // OpenDocument
    'odt', 'ods', 'odp',
    // Apple iWork
    'pages', 'numbers', 'key',
    // Other common
    'rtf'
];

export const ARCHIVE_EXTENSIONS = [
    'zip', 'tar', 'gz', 'tgz',
    'bz2', 'xz',
    '7z', 'rar',
    'iso',
    'cab',
    'ar', 'lz', 'lzma',
    'z', 'war', 'ear'
];

const VIDEO_EXTENSION_SET = new Set(VIDEO_EXTENSIONS);
const IMAGE_EXTENSION_SET = new Set(IMAGE_EXTENSIONS);
const AUDIO_EXTENSION_SET = new Set(AUDIO_EXTENSIONS);
const TEXT_EXTENSION_SET = new Set(TEXT_EXTENSIONS);
const DOCUMENT_EXTENSION_SET = new Set(DOCUMENT_EXTENSIONS);
const ARCHIVE_EXTENSION_SET = new Set(ARCHIVE_EXTENSIONS);

export function isVideoExtension(ext: string | null | undefined): boolean {
    if (!ext) return false;
    return VIDEO_EXTENSION_SET.has(ext.toLowerCase().replace(/^\./, ''));
}

export function isImageExtension(ext: string | null | undefined): boolean {
    if (!ext) return false;
    return IMAGE_EXTENSION_SET.has(ext.toLowerCase().replace(/^\./, ''));
}

export function isAudioExtension(ext: string | null | undefined): boolean {
    if (!ext) return false;
    return AUDIO_EXTENSION_SET.has(ext.toLowerCase().replace(/^\./, ''));
}

export function isTextExtension(ext: string | null | undefined): boolean {
    if (!ext) return false;
    return TEXT_EXTENSION_SET.has(ext.toLowerCase().replace(/^\./, ''));
}

export function isDocumentExtension(ext: string | null | undefined): boolean {
    if (!ext) return false;
    return DOCUMENT_EXTENSION_SET.has(ext.toLowerCase().replace(/^\./, ''));
}

export function isArchiveExtension(ext: string | null | undefined): boolean {
    if (!ext) return false;
    return ARCHIVE_EXTENSION_SET.has(ext.toLowerCase().replace(/^\./, ''));
}
