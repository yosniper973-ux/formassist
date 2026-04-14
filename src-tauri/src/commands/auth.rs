use crate::crypto;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

/// In-memory state holding the derived encryption key after successful login
pub struct AuthState {
    pub encryption_key: Mutex<Option<Vec<u8>>>,
}

impl Default for AuthState {
    fn default() -> Self {
        Self {
            encryption_key: Mutex::new(None),
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct SetupPasswordRequest {
    pub password: String,
    pub security_mode: String, // "max" or "moderate"
    pub recovery_question: Option<String>,
    pub recovery_answer: Option<String>,
}

#[tauri::command]
pub fn check_password_exists(app: tauri::AppHandle) -> Result<bool, String> {
    // Check if password_hash exists in app_config via SQL plugin
    // This will be called from frontend which checks via db.ts
    // For now, return false (no password set)
    Ok(false)
}

#[tauri::command]
pub fn setup_password(
    state: State<'_, AuthState>,
    password: String,
    security_mode: String,
    recovery_question: Option<String>,
    recovery_answer: Option<String>,
) -> Result<String, String> {
    // Hash the password for verification
    let password_hash = crypto::hash_password(&password).map_err(|e| e.to_string())?;

    // Generate salt for encryption key derivation
    let salt = crypto::generate_salt();

    // Derive the encryption key
    let key = crypto::derive_key(&password, &salt).map_err(|e| e.to_string())?;

    // Store key in memory
    let mut enc_key = state.encryption_key.lock().map_err(|e| e.to_string())?;
    *enc_key = Some(key);

    // Return hash + salt as JSON for frontend to store in app_config
    let result = serde_json::json!({
        "password_hash": password_hash,
        "salt": salt,
        "security_mode": security_mode,
    });

    Ok(result.to_string())
}

#[tauri::command]
pub fn verify_password(
    state: State<'_, AuthState>,
    password: String,
    stored_hash: String,
    stored_salt: String,
) -> Result<bool, String> {
    let valid = crypto::verify_password(&password, &stored_hash).map_err(|e| e.to_string())?;

    if valid {
        let key = crypto::derive_key(&password, &stored_salt).map_err(|e| e.to_string())?;
        let mut enc_key = state.encryption_key.lock().map_err(|e| e.to_string())?;
        *enc_key = Some(key);
    }

    Ok(valid)
}

#[tauri::command]
pub fn lock_app(state: State<'_, AuthState>) -> Result<(), String> {
    let mut enc_key = state.encryption_key.lock().map_err(|e| e.to_string())?;
    *enc_key = None;
    Ok(())
}

#[tauri::command]
pub fn is_unlocked(state: State<'_, AuthState>) -> Result<bool, String> {
    let enc_key = state.encryption_key.lock().map_err(|e| e.to_string())?;
    Ok(enc_key.is_some())
}
