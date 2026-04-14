import { invoke } from "@tauri-apps/api/core";

/** Chiffre une valeur via le backend Rust (AES-256-GCM) */
export async function encryptValue(plaintext: string): Promise<string> {
  return invoke<string>("encrypt_value", { plaintext });
}

/** Déchiffre une valeur via le backend Rust */
export async function decryptValue(ciphertext: string): Promise<string> {
  return invoke<string>("decrypt_value", { ciphertext });
}
