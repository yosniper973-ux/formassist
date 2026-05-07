use crate::crypto;
use base64::Engine as _;
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

/// Vérifie si la biométrie est disponible sur cette machine.
#[tauri::command]
pub fn is_biometric_available() -> bool {
    #[cfg(target_os = "macos")]
    {
        biometric_macos::can_evaluate()
    }
    #[cfg(target_os = "windows")]
    {
        biometric_windows::is_available()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        false
    }
}

/// Déclenche la vérification biométrique (Touch ID / Windows Hello).
/// Renvoie Ok(()) si l'utilisateur est authentifié, Err(message) sinon.
#[tauri::command]
pub fn authenticate_biometric(reason: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        biometric_macos::authenticate(&reason)
    }
    #[cfg(target_os = "windows")]
    {
        biometric_windows::authenticate(&reason)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = reason;
        Err("Biométrie non supportée sur cette plateforme.".to_string())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS : LocalAuthentication via objc2-local-authentication
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
mod biometric_macos {
    use objc2::runtime::Bool;
    use objc2_foundation::{NSError, NSString};
    use objc2_local_authentication::{LAContext, LAPolicy};
    use std::sync::{Arc, Condvar, Mutex};

    pub fn can_evaluate() -> bool {
        unsafe {
            let ctx = LAContext::new();
            ctx.canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthenticationWithBiometrics)
                .is_ok()
        }
    }

    pub fn authenticate(reason: &str) -> Result<(), String> {
        let holder: Arc<(Mutex<Option<bool>>, Condvar)> =
            Arc::new((Mutex::new(None), Condvar::new()));
        let holder_clone = holder.clone();

        unsafe {
            let ctx = LAContext::new();

            if ctx
                .canEvaluatePolicy_error(LAPolicy::DeviceOwnerAuthenticationWithBiometrics)
                .is_err()
            {
                return Err("Touch ID non disponible ou non configuré.".to_string());
            }

            let reason_ns = NSString::from_str(reason);

            let block = block2::RcBlock::new(move |success: Bool, _err: *mut NSError| {
                let (lock, cvar) = &*holder_clone;
                *lock.lock().unwrap() = Some(success.as_bool());
                cvar.notify_one();
            });

            ctx.evaluatePolicy_localizedReason_reply(
                LAPolicy::DeviceOwnerAuthenticationWithBiometrics,
                &reason_ns,
                &*block,
            );

            let (lock, cvar) = &*holder;
            let mut guard = lock.lock().unwrap();
            let timeout = std::time::Duration::from_secs(60);
            let result = loop {
                let (g, timed_out) = cvar.wait_timeout(guard, timeout).unwrap();
                guard = g;
                if timed_out.timed_out() {
                    break Err("Délai d'attente biométrique dépassé.".to_string());
                }
                if let Some(ok) = *guard {
                    break if ok {
                        Ok(())
                    } else {
                        Err("Authentification biométrique refusée ou annulée.".to_string())
                    };
                }
            };

            result
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows : UserConsentVerifier (Windows Hello)
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
mod biometric_windows {
    pub fn is_available() -> bool {
        use windows::Security::Credentials::UI::{
            UserConsentVerifier, UserConsentVerifierAvailability,
        };
        use windows::core::HSTRING;
        // RequestVerificationForWindowAsync est la bonne API sur Windows desktop
        // Pour vérifier la disponibilité on utilise CheckAvailabilityAsync
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build();
        match rt {
            Err(_) => false,
            Ok(rt) => rt.block_on(async {
                match UserConsentVerifier::CheckAvailabilityAsync() {
                    Err(_) => false,
                    Ok(op) => match op.await {
                        Ok(avail) => avail == UserConsentVerifierAvailability::Available,
                        Err(_) => false,
                    },
                }
            }),
        }
    }

    pub fn authenticate(reason: &str) -> Result<(), String> {
        use windows::Security::Credentials::UI::{
            UserConsentVerificationResult, UserConsentVerifier,
        };
        use windows::core::HSTRING;
        let reason_h = HSTRING::from(reason);
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;
        let result = rt.block_on(async {
            UserConsentVerifier::RequestVerificationAsync(&reason_h)
                .map_err(|e| e.to_string())?
                .await
                .map_err(|e| e.to_string())
        })?;
        match result {
            UserConsentVerificationResult::Verified => Ok(()),
            UserConsentVerificationResult::Canceled => {
                Err("Authentification annulée.".to_string())
            }
            _ => Err("Authentification Windows Hello échouée.".to_string()),
        }
    }
}

const KEYRING_SERVICE: &str = "FormAssist";
const KEYRING_USER: &str = "biometric_encryption_key";

/// Stocke la clé de chiffrement en mémoire dans le trousseau OS (Keychain / Credential Manager).
/// À appeler après une auth biométrique réussie lors de l'activation.
#[tauri::command]
pub fn save_key_to_keychain(state: State<'_, AuthState>) -> Result<(), String> {
    let enc_key = state.encryption_key.lock().map_err(|e| e.to_string())?;
    let key = enc_key.as_ref().ok_or("Application non déverrouillée.")?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(key);
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Impossible d'accéder au trousseau : {e}"))?;
    entry
        .set_password(&encoded)
        .map_err(|e| format!("Impossible de sauvegarder dans le trousseau : {e}"))?;
    Ok(())
}

/// Charge la clé depuis le trousseau et la place dans AuthState.
/// À appeler après une auth biométrique réussie lors du déverrouillage.
#[tauri::command]
pub fn load_key_from_keychain(state: State<'_, AuthState>) -> Result<bool, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Impossible d'accéder au trousseau : {e}"))?;

    match entry.get_password() {
        Ok(encoded) => {
            let key = base64::engine::general_purpose::STANDARD
                .decode(&encoded)
                .map_err(|e| format!("Clé corrompue dans le trousseau : {e}"))?;
            let mut enc_key = state.encryption_key.lock().map_err(|e| e.to_string())?;
            *enc_key = Some(key);
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}

/// Supprime la clé du trousseau (désactivation de la biométrie).
#[tauri::command]
pub fn delete_key_from_keychain() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Impossible d'accéder au trousseau : {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // déjà absent, pas d'erreur
        Err(e) => Err(format!("Impossible de supprimer du trousseau : {e}")),
    }
}

/// Vérifie si une clé biométrique est enregistrée dans le trousseau.
#[tauri::command]
pub fn is_biometric_enrolled() -> bool {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .ok()
        .and_then(|e| e.get_password().ok())
        .is_some()
}
