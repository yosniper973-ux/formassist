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

/// Crée une sauvegarde de la base de données SQLite
#[tauri::command]
pub fn create_backup(app: AppHandle, reason: String) -> Result<String, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = base.join("formassist.db");

    if !db_path.exists() {
        return Err("Base de données introuvable".to_string());
    }

    let backup_dir = base.join("backups");
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let timestamp = chrono_like_timestamp();
    let backup_name = format!("formassist_backup_{timestamp}.db");
    let backup_path = backup_dir.join(&backup_name);

    std::fs::copy(&db_path, &backup_path)
        .map_err(|e| format!("Erreur lors de la sauvegarde : {e}"))?;

    let size = std::fs::metadata(&backup_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(serde_json::json!({
        "path": backup_path.to_string_lossy(),
        "size": size,
        "reason": reason,
        "timestamp": timestamp
    })
    .to_string())
}

/// Restaure la base de données depuis une sauvegarde
#[tauri::command]
pub fn restore_backup(app: AppHandle, backup_path: String) -> Result<(), String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = base.join("formassist.db");
    let source = PathBuf::from(&backup_path);

    if !source.exists() {
        return Err("Fichier de sauvegarde introuvable".to_string());
    }

    // Créer une sauvegarde de sécurité avant restauration
    let timestamp = chrono_like_timestamp();
    let safety_backup = base
        .join("backups")
        .join(format!("formassist_pre_restore_{timestamp}.db"));
    std::fs::create_dir_all(safety_backup.parent().unwrap()).map_err(|e| e.to_string())?;

    if db_path.exists() {
        std::fs::copy(&db_path, &safety_backup)
            .map_err(|e| format!("Erreur sauvegarde de sécurité : {e}"))?;
    }

    std::fs::copy(&source, &db_path)
        .map_err(|e| format!("Erreur lors de la restauration : {e}"))?;

    Ok(())
}

/// Liste les sauvegardes disponibles
#[tauri::command]
pub fn list_backups(app: AppHandle) -> Result<String, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backup_dir = base.join("backups");

    if !backup_dir.exists() {
        return Ok("[]".to_string());
    }

    let mut backups = Vec::new();
    let entries = std::fs::read_dir(&backup_dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().map(|e| e == "db").unwrap_or(false) {
            let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
            backups.push(serde_json::json!({
                "path": path.to_string_lossy(),
                "name": path.file_name().unwrap_or_default().to_string_lossy(),
                "size": meta.len(),
            }));
        }
    }

    Ok(serde_json::to_string(&backups).map_err(|e| e.to_string())?)
}

/// Exporter la BDD vers un chemin choisi par l'utilisateur
#[tauri::command]
pub fn export_database(app: AppHandle, dest_path: String) -> Result<(), String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = base.join("formassist.db");

    if !db_path.exists() {
        return Err("Base de données introuvable".to_string());
    }

    std::fs::copy(&db_path, &dest_path)
        .map_err(|e| format!("Erreur export : {e}"))?;

    Ok(())
}
