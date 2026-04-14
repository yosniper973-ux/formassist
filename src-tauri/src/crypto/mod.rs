pub mod argon2_crypto;

pub use argon2_crypto::{
    derive_key, encrypt_data, decrypt_data, hash_password, verify_password, generate_salt,
};
