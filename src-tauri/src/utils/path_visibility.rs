use std::path::Path;

/// Matches [dir::is_hidden_or_system] — used for listing and dedupe discovery.
pub fn is_hidden_or_system(name: &str, path: &Path) -> bool {
    #[cfg(not(target_os = "windows"))]
    let _ = name;
    #[cfg(target_os = "macos")]
    {
        let path_str = path.to_string_lossy();
        path_str == "/System"
            || path_str.starts_with("/System/")
            || path_str == "/Library"
            || path_str.starts_with("/Library/")
            || path_str == "/private"
            || path_str.starts_with("/private/")
            || path_str == "/Applications"
            || path_str.starts_with("/Applications/")
            || path_str == "/bin"
            || path_str == "/usr"
            || path_str == "/sbin"
            || path_str == "/dev"
            || path_str == "/etc"
    }
    #[cfg(target_os = "windows")]
    {
        let name_upper = name.to_uppercase();
        name_upper == "RECYCLE.BIN"
            || name_upper == "SYSTEM VOLUME INFORMATION"
            || name_upper == "WINDOWS"
            || name_upper == "PROGRAM DATA"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        path.starts_with("/proc") || path.starts_with("/sys") || path.starts_with("/boot")
    }
}
