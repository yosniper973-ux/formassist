use std::path::PathBuf;
use tauri::AppHandle;

#[tauri::command]
pub fn save_imported_file(
    app: AppHandle,
    source_path: String,
    category: String,
) -> Result<String, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let dest_dir = base.join("imports").join(&category);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let source = PathBuf::from(&source_path);
    let filename = source
        .file_name()
        .ok_or_else(|| "Nom de fichier invalide".to_string())?;

    // Add timestamp prefix to avoid collisions
    let timestamp = chrono_like_timestamp();
    let dest_filename = format!("{timestamp}_{}", filename.to_string_lossy());
    let dest = dest_dir.join(&dest_filename);

    std::fs::copy(&source, &dest).map_err(|e| format!("Erreur de copie : {e}"))?;

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Impossible de lire le fichier : {e}"))
}

#[tauri::command]
pub fn read_file_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Impossible de lire le fichier : {e}"))
}

fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", d.as_secs())
}

use tauri::Manager;
