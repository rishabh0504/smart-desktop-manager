use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Check existence of directory.
#[allow(dead_code)]
pub fn exists_dir(path: &Path) -> bool {
    path.is_dir()
}

/// Get file size in bytes. Returns None on error or if not a file.
#[allow(dead_code)]
pub fn file_size(path: &Path) -> Option<u64> {
    std::fs::metadata(path).ok().map(|m| m.len())
}

/// Remove file.
#[allow(dead_code)]
pub fn remove_file(path: &Path) -> bool {
    std::fs::remove_file(path).is_ok()
}

#[allow(dead_code)]
pub fn exists_file(path: &Path) -> bool {
    path.exists()
}

/// File modification time in seconds since epoch. None if not a file or metadata fails.
#[allow(dead_code)]
pub fn file_mtime_secs(path: &Path) -> Option<u64> {
    std::fs::metadata(path).ok()?
        .modified().ok()?
        .duration_since(UNIX_EPOCH).ok()
        .map(|d| d.as_secs())
}

/// Read entire file as bytes.
#[allow(dead_code)]
pub fn read_file_bytes(path: &Path) -> Option<Vec<u8>> {
    std::fs::read(path).ok()
}

/// Write bytes to file.
#[allow(dead_code)]
pub fn write_file_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

/// Create directory and parents.
#[allow(dead_code)]
pub fn create_dir_all(path: &Path) -> bool {
    std::fs::create_dir_all(path).is_ok()
}

/// List entries in directory: path, mtime_secs, is_dir.
#[allow(dead_code)]
pub fn list_dir_entries(dir_path: &Path) -> Option<Vec<(PathBuf, u64, bool)>> {
    let mut out = Vec::new();
    let entries = std::fs::read_dir(dir_path).ok()?;
    
    for entry in entries.flatten() {
        let path = entry.path();
        let metadata = entry.metadata().ok();
        let mtime = metadata.as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|mt| mt.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let is_dir = path.is_dir();
        out.push((path, mtime, is_dir));
    }
    Some(out)
}
