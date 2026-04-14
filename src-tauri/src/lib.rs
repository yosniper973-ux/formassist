pub mod commands;
pub mod crypto;
pub mod db;
pub mod mail;

use commands::auth::AuthState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(AuthState::default())
        .invoke_handler(tauri::generate_handler![
            // Auth
            commands::check_password_exists,
            commands::setup_password,
            commands::verify_password,
            commands::lock_app,
            commands::is_unlocked,
            // Crypto
            commands::encrypt_value,
            commands::decrypt_value,
            // Config
            commands::get_app_data_dir,
            commands::get_app_version,
            // Files
            commands::save_imported_file,
            commands::read_file_bytes,
            commands::read_file_text,
            // System
            commands::open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de FormAssist");
}
