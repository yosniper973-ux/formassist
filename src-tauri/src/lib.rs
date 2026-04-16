pub mod commands;
pub mod crypto;
pub mod db;
pub mod mail;

use commands::auth::AuthState;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial_schema",
        sql: include_str!("../migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:formassist.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
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
            // Email
            commands::send_email,
            // Backup
            commands::create_backup,
            commands::restore_backup,
            commands::list_backups,
            commands::export_database,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de FormAssist");
}
