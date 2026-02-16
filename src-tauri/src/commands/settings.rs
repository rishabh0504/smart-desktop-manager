use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PreviewSettings {
    pub image: bool,
    pub video: bool,
    pub audio: bool,
    pub text: bool,
    pub pdf: bool,
    pub archive: bool,
    pub other: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExplorerSettings {
    pub preview_enabled: PreviewSettings,
    pub show_hidden_files: bool,
    pub show_system_files: bool,
    pub blocked_extensions: Vec<String>,
    pub setup_completed: bool,
}

impl Default for ExplorerSettings {
    fn default() -> Self {
        Self {
            preview_enabled: PreviewSettings {
                image: true,
                video: true,
                audio: true,
                text: true,
                pdf: true,
                archive: false,
                other: true,
            },
            show_hidden_files: false,
            show_system_files: false,
            blocked_extensions: vec!["iso".to_string(), "tmp".to_string()],
            setup_completed: false,
        }
    }
}

fn get_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_config_dir().map_err(|e| e.to_string())?;
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    path.push("settings.json");
    Ok(path)
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<ExplorerSettings, String> {
    let path = get_settings_path(&app)?;
    if !path.exists() {
        return Ok(ExplorerSettings::default());
    }
    
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let settings = serde_json::from_str(&content).unwrap_or_else(|_| ExplorerSettings::default());
    Ok(settings)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: ExplorerSettings) -> Result<(), String> {
    let path = get_settings_path(&app)?;
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}
