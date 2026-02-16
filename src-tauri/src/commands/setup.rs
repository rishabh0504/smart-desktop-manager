use std::process::Command;
use tauri::{AppHandle, Emitter};
use serde::{Serialize, Deserialize};
use sysinfo::System;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemCapabilities {
    pub cpu_cores: usize,
    pub ram_gb: u64,
    pub has_gpu: bool,
    pub os: String,
    pub mode: String, // "Lite", "Balanced", "Performance"
}

#[tauri::command]
pub fn check_system_requirements() -> Result<SystemCapabilities, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_cores = sys.cpus().len();
    let ram_bytes = sys.total_memory();
    let ram_gb = ram_bytes / (1024 * 1024 * 1024);
    
    // Heuristic based on requirements
    let mode = if ram_gb >= 18 {
        "Performance"
    } else if ram_gb >= 16 {
        "Balanced"
    } else {
        "Lite"
    };

    let has_gpu = if cfg!(target_os = "macos") {
        // macOS: Assume Metal (Apple Silicon or modern Intel)
        true 
    } else if cfg!(target_os = "windows") {
        // Windows: Check for NVIDIA (typical for CUDA)
        Command::new("nvidia-smi").output().is_ok()
    } else {
        false
    };

    Ok(SystemCapabilities {
        cpu_cores,
        ram_gb,
        has_gpu,
        os: std::env::consts::OS.to_string(),
        mode: mode.to_string(),
    })
}

#[tauri::command]
pub fn check_ollama_status() -> bool {
    // Check if ollama is reachable in the PATH
    Command::new("ollama").arg("--version").output().is_ok()
}

#[tauri::command]
pub async fn pull_model(app: AppHandle, model: String) -> Result<(), String> {
    println!("Pulling model: {}", model);
    let output = Command::new("ollama")
        .arg("pull")
        .arg(&model)
        .output()
        .map_err(|e| format!("Failed to execute ollama: {}", e))?;

    if output.status.success() {
        app.emit("model-pull-complete", &model).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Ollama pull failed: {}", stderr))
    }
}

#[tauri::command]
pub fn is_setup_complete() -> bool {
    #[cfg(target_os = "macos")]
    let flag_path = std::path::PathBuf::from("/Library/Application Support/SmartDesktopManager/ready");
    
    #[cfg(target_os = "windows")]
    let flag_path = std::path::PathBuf::from("C:\\ProgramData\\SmartDesktopManager\\ready");
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return false;
    
    flag_path.exists()
}
