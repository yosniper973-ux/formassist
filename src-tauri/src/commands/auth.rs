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
pub async fn is_biometric_available() -> bool {
    tokio::task::spawn_blocking(|| {
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
    })
    .await
    .unwrap_or(false)
}

/// Déclenche la vérification biométrique (Touch ID / Windows Hello).
/// Renvoie Ok(()) si l'utilisateur est authentifié, Err(message) sinon.
///
/// La commande est async + spawn_blocking pour éviter de figer le thread
/// principal Tauri (sur Windows en particulier, RequestVerificationAsync
/// peut bloquer plusieurs secondes pendant que l'utilisateur pose son doigt
/// ou tape son PIN — la fenêtre principale doit rester réactive).
#[tauri::command]
pub async fn authenticate_biometric(reason: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
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
    })
    .await
    .map_err(|e| format!("Erreur d'exécution biométrique : {e}"))?
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
    // UserConsentVerifier (Windows Hello) est une API WinRT UI qui exige :
    // 1) Le thread appelant doit avoir WinRT initialisé (RoInitialize)
    // 2) Le thread doit pomper des messages Win32 sinon l'UI Hello ne s'affiche
    //    pas et le callback de complétion n'est jamais livré.
    // Les threads de pool tokio n'ont ni l'un ni l'autre, ce qui explique
    // pourquoi un simple op.get() ou un polling de Status() bloque indéfiniment.
    //
    // Solution : on fait l'init COM/WinRT au début, on attache un handler de
    // complétion qui signale un AtomicBool, et on pompe les messages Win32
    // jusqu'à la complétion. C'est exactement le pattern recommandé par MS
    // pour les API WinRT UI utilisées hors d'un contexte UI natif.

    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use windows::Security::Credentials::UI::{
        UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability,
    };
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE,
    };
    use windows::core::HSTRING;
    use windows_future::{AsyncOperationCompletedHandler, IAsyncOperation};

    /// Initialise WinRT en mode multi-threadé pour le thread courant. Idempotent
    /// (les appels suivants renvoient S_FALSE qu'on ignore).
    fn ensure_winrt_initialized() {
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
    }

    /// Pompe les messages Win32 du thread courant jusqu'à ce que `done` soit
    /// signalé. Indispensable pour que l'UI Windows Hello s'affiche et que le
    /// handler de complétion soit livré.
    fn pump_until<T: windows::core::RuntimeType + Send + Clone + 'static>(
        op: &IAsyncOperation<T>,
        timeout: Duration,
    ) -> Result<T, String> {
        let done = Arc::new(AtomicBool::new(false));
        let done_clone = done.clone();
        let result_slot: Arc<Mutex<Option<Result<T, String>>>> = Arc::new(Mutex::new(None));
        let result_clone = result_slot.clone();

        let handler =
            AsyncOperationCompletedHandler::new(move |inner, _status| {
                let mapped: Result<T, String> = match inner.as_ref() {
                    Some(o) => o.GetResults().map_err(|e| e.to_string()),
                    None => Err("Référence d'opération vide.".to_string()),
                };
                if let Ok(mut g) = result_clone.lock() {
                    *g = Some(mapped);
                }
                done_clone.store(true, Ordering::SeqCst);
                Ok(())
            });

        op.SetCompleted(&handler)
            .map_err(|e| format!("Impossible d'attacher le handler WinRT : {e}"))?;

        let deadline = Instant::now() + timeout;
        unsafe {
            while !done.load(Ordering::SeqCst) {
                if Instant::now() >= deadline {
                    return Err("Délai d'attente dépassé.".to_string());
                }
                let mut msg = MSG::default();
                while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        }

        let taken = {
            let mut guard = result_slot.lock().map_err(|e| e.to_string())?;
            guard.take()
        };
        match taken {
            Some(r) => r,
            None => Err("Résultat WinRT vide.".to_string()),
        }
    }

    pub fn is_available() -> bool {
        ensure_winrt_initialized();
        let op = match UserConsentVerifier::CheckAvailabilityAsync() {
            Ok(op) => op,
            Err(_) => return false,
        };
        match pump_until(&op, Duration::from_secs(10)) {
            Ok(r) => r == UserConsentVerifierAvailability::Available,
            Err(_) => false,
        }
    }

    pub fn authenticate(reason: &str) -> Result<(), String> {
        ensure_winrt_initialized();
        let reason_h = HSTRING::from(reason);
        let op = UserConsentVerifier::RequestVerificationAsync(&reason_h)
            .map_err(|e| format!("Échec de la demande Windows Hello : {e}"))?;
        let result = pump_until(&op, Duration::from_secs(120))?;
        match result {
            UserConsentVerificationResult::Verified => Ok(()),
            UserConsentVerificationResult::Canceled => {
                Err("Authentification annulée.".to_string())
            }
            UserConsentVerificationResult::DeviceNotPresent => Err(
                "Aucun capteur biométrique détecté sur cette machine.".to_string(),
            ),
            UserConsentVerificationResult::NotConfiguredForUser => Err(
                "Windows Hello n'est pas configuré pour cet utilisateur. Configure une empreinte ou un PIN dans Paramètres Windows > Comptes > Options de connexion.".to_string(),
            ),
            UserConsentVerificationResult::DisabledByPolicy => Err(
                "Windows Hello est désactivé par la politique du système.".to_string(),
            ),
            UserConsentVerificationResult::DeviceBusy => Err(
                "Le capteur biométrique est occupé. Réessaie dans un instant.".to_string(),
            ),
            UserConsentVerificationResult::RetriesExhausted => Err(
                "Trop de tentatives. Saisis ton mot de passe Windows pour réessayer.".to_string(),
            ),
            _ => Err("Authentification Windows Hello échouée.".to_string()),
        }
    }
}

fn biometric_key_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Répertoire de données inaccessible : {e}"))?;
    Ok(dir.join("biometric.key"))
}

/// Stocke la clé de chiffrement dans le répertoire de données de l'app.
#[tauri::command]
pub fn save_key_to_keychain(
    app: tauri::AppHandle,
    state: State<'_, AuthState>,
) -> Result<(), String> {
    let enc_key = state.encryption_key.lock().map_err(|e| e.to_string())?;
    let key = enc_key.as_ref().ok_or("Application non déverrouillée.")?;

    let path = biometric_key_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Impossible de créer le répertoire : {e}"))?;
    }
    let encoded = base64::engine::general_purpose::STANDARD.encode(key);
    std::fs::write(&path, encoded.as_bytes())
        .map_err(|e| format!("Impossible de sauvegarder la clé : {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Charge la clé depuis le répertoire de données et la place dans AuthState.
#[tauri::command]
pub fn load_key_from_keychain(
    app: tauri::AppHandle,
    state: State<'_, AuthState>,
) -> Result<bool, String> {
    let path = biometric_key_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(encoded) => {
            let key = base64::engine::general_purpose::STANDARD
                .decode(encoded.trim())
                .map_err(|e| format!("Clé corrompue : {e}"))?;
            let mut enc_key = state.encryption_key.lock().map_err(|e| e.to_string())?;
            *enc_key = Some(key);
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}

/// Supprime la clé (désactivation de la biométrie).
#[tauri::command]
pub fn delete_key_from_keychain(app: tauri::AppHandle) -> Result<(), String> {
    let path = biometric_key_path(&app)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Impossible de supprimer la clé : {e}")),
    }
}

/// Vérifie si une clé biométrique est présente.
#[tauri::command]
pub fn is_biometric_enrolled(app: tauri::AppHandle) -> bool {
    biometric_key_path(&app)
        .map(|p| p.exists())
        .unwrap_or(false)
}
