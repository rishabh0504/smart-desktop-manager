use serde::{Serialize, Deserialize};
use sysinfo::Disks;

#[derive(Debug, Serialize, Deserialize)]
pub struct Volume {
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
    pub is_removable: bool,
    pub is_system: bool,
}

#[tauri::command]
pub fn list_volumes() -> Vec<Volume> {
    let disks = Disks::new_with_refreshed_list();
    disks.into_iter()
        .map(|d| {
            let name = if d.name().is_empty() {
                d.mount_point().to_string_lossy().to_string()
            } else {
                d.name().to_string_lossy().to_string()
            };

            Volume {
                name,
                mount_point: d.mount_point().to_string_lossy().to_string(),
                total_space: d.total_space(),
                available_space: d.available_space(),
                is_removable: d.is_removable(),
                // Simplistic check for system disk, can be refined per OS
                is_system: is_system_path(d.mount_point().to_str().unwrap_or("")),
            }
        })
        .collect()
}

fn is_system_path(path: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        path == "/" || path.contains("/System") || path.contains("/Library")
    }
    #[cfg(target_os = "windows")]
    {
        path.to_uppercase().starts_with("C:")
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        path == "/" || path.starts_with("/boot")
    }
}
