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
    pub document: bool,
    pub archive: bool,
    pub other: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ThemeSettings {
    pub use_custom_color: bool,
    pub custom_color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConfigSection {
    pub preview_enabled: PreviewSettings,
    pub show_hidden_files: bool,
    pub show_system_files: bool,
    pub blocked_extensions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub explorer: ConfigSection,
    pub dedupe: ConfigSection,
    pub content_search: ConfigSection,
    pub clean: ConfigSection,
    pub theme: ThemeSettings,
    pub setup_completed: bool,
}

impl Default for PreviewSettings {
    fn default() -> Self {
        Self {
            image: true,
            video: true,
            audio: true,
            text: true,
            document: true,
            archive: false,
            other: true,
        }
    }
}

impl Default for ThemeSettings {
    fn default() -> Self {
        Self {
            use_custom_color: false,
            custom_color: "#3b82f6".to_string(),
        }
    }
}

impl Default for ConfigSection {
    fn default() -> Self {
        Self {
            preview_enabled: PreviewSettings::default(),
            show_hidden_files: false,
            show_system_files: false,
            blocked_extensions: vec!["iso".to_string(), "tmp".to_string()],
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            explorer: ConfigSection::default(),
            dedupe: ConfigSection::default(),
            content_search: ConfigSection::default(),
            clean: ConfigSection::default(),
            theme: ThemeSettings::default(),
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
pub fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = get_settings_path(&app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    
    // Attempt to parse as new structure first
    if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
        return Ok(settings);
    }
    
    // Migration: Attempt to parse as old ExplorerSettings and move to explorer section
    #[derive(Debug, Serialize, Deserialize, Clone)]
    pub struct OldExplorerSettings {
        pub preview_enabled: PreviewSettings,
        pub show_hidden_files: bool,
        pub show_system_files: bool,
        pub blocked_extensions: Vec<String>,
        pub setup_completed: bool,
    }

    if let Ok(old) = serde_json::from_str::<OldExplorerSettings>(&content) {
        let mut new = AppSettings::default();
        new.explorer = ConfigSection {
            preview_enabled: old.preview_enabled,
            show_hidden_files: old.show_hidden_files,
            show_system_files: old.show_system_files,
            blocked_extensions: old.blocked_extensions,
        };
        new.dedupe = new.explorer.clone();
        new.content_search = new.explorer.clone();
        new.clean = new.explorer.clone();
        new.theme = ThemeSettings::default();
        new.setup_completed = old.setup_completed;
        return Ok(new);
    }

    Ok(AppSettings::default())
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = get_settings_path(&app)?;
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}
