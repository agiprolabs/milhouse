use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_hidden: bool,
}

#[tauri::command]
pub fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir_path = Path::new(&path);

    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    match fs::read_dir(dir_path) {
        Ok(read_dir) => {
            for entry in read_dir.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                let file_path = entry.path().to_string_lossy().to_string();
                let is_dir = entry.path().is_dir();
                let is_hidden = file_name.starts_with('.');

                entries.push(FileEntry {
                    name: file_name,
                    path: file_path,
                    is_dir,
                    is_hidden,
                });
            }
        }
        Err(e) => return Err(format!("Failed to read directory: {}", e)),
    }

    // Sort: directories first, then files, alphabetically
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    if !file_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}
