use std::process::Command;
use sysinfo::System;
use std::fs;
use std::path::PathBuf;

fn main() {
    println!("========================================");
    println!("   Smart Desktop Manager - Installer   ");
    println!("========================================");
    
    // 1. System Requirements Check
    println!("\n[1/3] Verifying system requirements...");
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_cores = sys.cpus().len();
    let ram_bytes = sys.total_memory();
    let ram_gb = ram_bytes / (1024 * 1024 * 1024);

    println!("- CPU Cores: {}", cpu_cores);
    println!("- RAM: {} GB", ram_gb);

    if ram_gb < 8 {
        println!("WARNING: 8GB RAM is the minimum required for Lite mode.");
    }

    // 2. Ollama Installation & Verification
    println!("\n[2/3] Checking Ollama installation...");
    if Command::new("ollama").arg("--version").output().is_ok() {
        println!("  ✔ Ollama is already installed.");
    } else {
        println!("  - Ollama not found in PATH.");
        #[cfg(target_os = "macos")]
        {
            println!("  - Attempting to install Ollama system-wide...");
            // Ensure /usr/local/bin exists
            let _ = fs::create_dir_all("/usr/local/bin");
            
            // Try to download and move to /usr/local/bin
            let status = Command::new("sh")
                .arg("-c")
                .arg("curl -L https://ollama.com/download/ollama-darwin -o /tmp/ollama && chmod +x /tmp/ollama && mv /tmp/ollama /usr/local/bin/ollama")
                .status();
            
            if status.is_ok() && status.unwrap().success() {
                println!("  ✔ Ollama installed successfully to /usr/local/bin/ollama");
            } else {
                eprintln!("  ✘ ERROR: Failed to install Ollama automatically.");
                eprintln!("    Please install manually from https://ollama.com");
                std::process::exit(1);
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            eprintln!("  ✘ ERROR: Ollama not found. Please install manually.");
            std::process::exit(1);
        }
    }

    // 3. Model Bootstrapping
    println!("\n[3/3] Bootstrapping AI models (this may take a few minutes)...");
    let models = vec![
        "gemma3:1b",  // Sidecar Memory Agent
        "llama3.2:3b", // Main LLM
        "whisper:latest" // Whisper for STT
    ];
    
    // Use absolute path on macOS to ensure it works even if PATH isn't refreshed
    let ollama_bin = if cfg!(target_os = "macos") {
        "/usr/local/bin/ollama"
    } else {
        "ollama"
    };

    for model in models {
        println!("- Checking Model: {}...", model);
        let status = Command::new(ollama_bin)
            .arg("pull")
            .arg(model)
            .status();
        
        match status {
            Ok(s) if s.success() => println!("  ✔ {} ready.", model),
            _ => {
                eprintln!("  ✘ ERROR: Failed to pull {}. Check internet connection.", model);
                std::process::exit(1);
            }
        }
    }

    // 4. Set "Ready" Flag
    println!("\n[4/4] Finalizing configuration...");
    if let Some(config_dir) = get_global_config_dir() {
        println!("- Target Directory: {:?}", config_dir);
        if let Err(e) = fs::create_dir_all(&config_dir) {
            eprintln!("  ✘ ERROR creating directory: {}", e);
            std::process::exit(1);
        }
        let flag_path = config_dir.join("ready");
        if let Err(e) = fs::write(&flag_path, "1") {
            eprintln!("  ✘ ERROR writing flag: {}", e);
            std::process::exit(1);
        }
        println!("  ✔ Configuration flag set successfully.");
    }

    println!("\n========================================");
    println!("        INSTALLATION SUCCESSFUL         ");
    println!("========================================\n");
}

fn get_global_config_dir() -> Option<PathBuf> {
    if cfg!(target_os = "macos") {
        Some(PathBuf::from("/Library/Application Support/SmartDesktopManager"))
    } else if cfg!(target_os = "windows") {
        Some(PathBuf::from("C:\\ProgramData\\SmartDesktopManager"))
    } else {
        None
    }
}
