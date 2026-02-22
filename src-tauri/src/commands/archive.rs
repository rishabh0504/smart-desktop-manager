use tauri::command;
use std::fs::File;
use std::path::Path;
use std::io::{Read, Write};
use flate2::read::GzDecoder;
use tar::Archive;
use zip::read::ZipArchive;
use zip::write::FileOptions;
use zip::CompressionMethod;

#[command]
pub async fn extract_archive(path: String) -> Result<(), String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err("File does not exist".to_string());
    }

    let file_name = file_path.file_stem().unwrap_or_default().to_string_lossy();
    let parent_dir = file_path.parent().unwrap_or(Path::new(""));
    let mut dest_dir = parent_dir.join(file_name.as_ref());

    // If folder already exists, find a new name to avoid blind overwriting.
    let mut counter = 1;
    while dest_dir.exists() {
        dest_dir = parent_dir.join(format!("{} ({})", file_name, counter));
        counter += 1;
    }

    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let file = File::open(&file_path).map_err(|e| e.to_string())?;
    let path_str = path.to_lowercase();

    if path_str.ends_with(".zip") {
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        archive.extract(&dest_dir).map_err(|e| e.to_string())?;
    } else if path_str.ends_with(".tar.gz") || path_str.ends_with(".tgz") {
        let tar = GzDecoder::new(file);
        let mut archive = Archive::new(tar);
        archive.unpack(&dest_dir).map_err(|e| e.to_string())?;
    } else if path_str.ends_with(".tar") {
        let mut archive = Archive::new(file);
        archive.unpack(&dest_dir).map_err(|e| e.to_string())?;
    } else {
        return Err("Unsupported archive format. Supported formats: .zip, .tar.gz, .tgz, .tar".to_string());
    }

    Ok(())
}

#[command]
pub async fn compress_to_zip(paths: Vec<String>, dest_path: String) -> Result<(), String> {
    println!("Compressing {} items to: {}", paths.len(), dest_path);
    if paths.is_empty() {
        return Err("No files selected for compression".to_string());
    }

    let dest_file = File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(dest_file);
    let options = FileOptions::<()>::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o755);

    let mut buffer = Vec::new();

    for path_str in paths {
        let path = Path::new(&path_str);
        if !path.exists() {
            continue;
        }

        if path.is_file() {
            let file_name = path.file_name().unwrap_or_default().to_string_lossy().replace("\\", "/");
            zip.start_file(file_name, options).map_err(|e| e.to_string())?;
            let mut f = File::open(path).map_err(|e| e.to_string())?;
            f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            zip.write_all(&buffer).map_err(|e| e.to_string())?;
            buffer.clear();
        } else if path.is_dir() {
            let base_path = path.parent().unwrap_or(Path::new(""));

            for entry in walkdir::WalkDir::new(path) {
                let entry = match entry {
                    Ok(e) => e,
                    Err(_) => continue,
                };
                let entry_path = entry.path();
                let relative_path = entry_path.strip_prefix(base_path).unwrap_or(entry_path).to_string_lossy().replace("\\", "/");

                if entry_path.is_file() {
                    zip.start_file(relative_path, options).map_err(|e| e.to_string())?;
                    let mut f = File::open(entry_path).map_err(|e| e.to_string())?;
                    f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
                    zip.write_all(&buffer).map_err(|e| e.to_string())?;
                    buffer.clear();
                } else if entry_path.is_dir() && !relative_path.is_empty() {
                    zip.add_directory(relative_path, options).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}
