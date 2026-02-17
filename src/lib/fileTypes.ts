/** Video extensions supported for grid thumbnail preview and modal playback (ffmpeg can decode these). */
export const VIDEO_EXTENSIONS = [
    "mp4", "webm", "mov", "mkv", "avi", "3gp", "3g2", "m4v", "flv", "wmv",
    "mpeg", "mpg", "ogv", "ts", "m2ts", "mts", "vob", "f4v", "asf", "rm", "rmvb",
];

const VIDEO_EXTENSION_SET = new Set(VIDEO_EXTENSIONS.map((e) => e.toLowerCase()));

export function isVideoExtension(ext: string | null | undefined): boolean {
    if (!ext) return false;
    return VIDEO_EXTENSION_SET.has(ext.toLowerCase());
}
