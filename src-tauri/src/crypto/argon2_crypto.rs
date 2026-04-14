use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Erreur de chiffrement : {0}")]
    Encryption(String),
    #[error("Erreur de déchiffrement : {0}")]
    Decryption(String),
    #[error("Erreur de hachage : {0}")]
    Hashing(String),
    #[error("Mot de passe invalide")]
    InvalidPassword,
}

impl serde::Serialize for CryptoError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Generate a random 16-byte salt, returned as base64
pub fn generate_salt() -> String {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    B64.encode(salt)
}

/// Derive a 32-byte encryption key from password + salt using Argon2id
pub fn derive_key(password: &str, salt_b64: &str) -> Result<Vec<u8>, CryptoError> {
    let salt_bytes = B64
        .decode(salt_b64)
        .map_err(|e| CryptoError::Encryption(format!("Invalid salt: {e}")))?;

    let mut key = vec![0u8; 32];
    let argon2 = Argon2::default();
    argon2
        .hash_password_into(password.as_bytes(), &salt_bytes, &mut key)
        .map_err(|e| CryptoError::Encryption(format!("Key derivation failed: {e}")))?;

    Ok(key)
}

/// Hash password for verification storage (not for encryption key)
pub fn hash_password(password: &str) -> Result<String, CryptoError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| CryptoError::Hashing(format!("{e}")))?;
    Ok(hash.to_string())
}

/// Verify password against stored hash
pub fn verify_password(password: &str, hash: &str) -> Result<bool, CryptoError> {
    let parsed = PasswordHash::new(hash).map_err(|e| CryptoError::Hashing(format!("{e}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

/// Encrypt plaintext with AES-256-GCM using derived key
/// Returns base64-encoded: nonce (12 bytes) + ciphertext
pub fn encrypt_data(plaintext: &str, key: &[u8]) -> Result<String, CryptoError> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| CryptoError::Encryption(format!("Invalid key: {e}")))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| CryptoError::Encryption(format!("{e}")))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(B64.encode(combined))
}

/// Decrypt base64-encoded (nonce + ciphertext) with AES-256-GCM
pub fn decrypt_data(encrypted_b64: &str, key: &[u8]) -> Result<String, CryptoError> {
    let combined = B64
        .decode(encrypted_b64)
        .map_err(|e| CryptoError::Decryption(format!("Invalid base64: {e}")))?;

    if combined.len() < 13 {
        return Err(CryptoError::Decryption("Data too short".into()));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| CryptoError::Decryption(format!("Invalid key: {e}")))?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::InvalidPassword)?;

    String::from_utf8(plaintext).map_err(|e| CryptoError::Decryption(format!("UTF-8 error: {e}")))
}
