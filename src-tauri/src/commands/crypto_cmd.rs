use crate::crypto;
use super::auth::AuthState;
use tauri::State;

#[tauri::command]
pub fn encrypt_value(
    state: State<'_, AuthState>,
    plaintext: String,
) -> Result<String, String> {
    let enc_key = state.encryption_key.lock().map_err(|e| e.to_string())?;
    let key = enc_key
        .as_ref()
        .ok_or_else(|| "Application verrouillée — déverrouille d'abord".to_string())?;
    crypto::encrypt_data(&plaintext, key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn decrypt_value(
    state: State<'_, AuthState>,
    ciphertext: String,
) -> Result<String, String> {
    let enc_key = state.encryption_key.lock().map_err(|e| e.to_string())?;
    let key = enc_key
        .as_ref()
        .ok_or_else(|| "Application verrouillée — déverrouille d'abord".to_string())?;
    crypto::decrypt_data(&ciphertext, key).map_err(|e| e.to_string())
}
