use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.shell().open(&url, None).map_err(|e| e.to_string())
}
