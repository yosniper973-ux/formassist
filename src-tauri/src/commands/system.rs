use tauri::Manager;

#[tauri::command]
pub fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    tauri::api::shell::open(&app.shell(), &url, None).map_err(|e| e.to_string())
}
