use tauri::AppHandle;

#[tauri::command]
pub fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Impossible de trouver le dossier de données : {e}"))?;

    // Ensure directory exists
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Impossible de créer le dossier de données : {e}"))?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

use tauri::Manager;
