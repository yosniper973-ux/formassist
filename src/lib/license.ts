/**
 * Gestion des licences FormAssist.
 *
 * Types de clés :
 *  - DEV  : FA-DEV-YOHANN-2026  (permanent, hardcodé)
 *  - TEST : FA-TEST-YYYYMM-XXXXXX  (HMAC-SHA256, expire fin du mois indiqué)
 *  - PRO  : intégration Lemon Squeezy (futur)
 *
 * Essai gratuit : 14 jours à partir du premier lancement.
 */

import { db } from "./db";

const DEV_KEY = "FA-DEV-YOHANN-2026";
const HMAC_SECRET = "FA26KX92MP37QR81";
const TRIAL_DAYS = 14;

export type LicenseType = "dev" | "test" | "pro";

export type LicenseStatus =
  | { kind: "active"; type: LicenseType; expiresAt: string | null }
  | { kind: "trial"; daysLeft: number; trialStartedAt: string }
  | { kind: "no_license" }
  | { kind: "expired_trial" }
  | { kind: "expired_key"; type: LicenseType };

export type KeyValidationResult =
  | { valid: true; type: LicenseType; expiresAt: string | null }
  | { valid: false; reason: string };

// ─── HMAC-SHA256 via Web Crypto API ──────────────────────────
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
}

// ─── Validation d'une clé (sans écriture BDD) ────────────────
export async function validateKey(key: string): Promise<KeyValidationResult> {
  const k = key.trim().toUpperCase();

  // ── Clé développeur ──────────────────────────────────────────
  if (k === DEV_KEY) {
    return { valid: true, type: "dev", expiresAt: null };
  }

  // ── Clé de test : FA-TEST-YYYYMM-XXXXXX ─────────────────────
  if (k.startsWith("FA-TEST-")) {
    const parts = k.split("-");
    // Attendu : ["FA", "TEST", "YYYYMM", "XXXXXX"]
    if (parts.length !== 4) {
      return { valid: false, reason: "Format de clé invalide." };
    }
    const yyyymm = parts[2]!;
    const givenHmac = parts[3]!;

    if (!/^\d{6}$/.test(yyyymm)) {
      return { valid: false, reason: "Format de clé invalide." };
    }

    // Recalcul HMAC attendu
    const prefix = `FA-TEST-${yyyymm}`;
    const fullHex = await hmacSha256Hex(HMAC_SECRET, prefix);
    const expectedHmac = fullHex.substring(0, 6);

    if (givenHmac !== expectedHmac) {
      return { valid: false, reason: "Clé invalide ou incorrecte." };
    }

    // Vérification expiration : expire le 1er jour du mois suivant
    const year = parseInt(yyyymm.substring(0, 4), 10);
    const month = parseInt(yyyymm.substring(4, 6), 10); // 1-based
    // new Date(year, month, 1) → 1er du mois +1 (les mois Date sont 0-based)
    const expiresDate = new Date(year, month, 1);
    const expiresAt = expiresDate.toISOString().substring(0, 10);

    if (new Date() >= expiresDate) {
      return { valid: false, reason: `Cette clé de test a expiré le ${expiresAt}.` };
    }

    return { valid: true, type: "test", expiresAt };
  }

  // ── Clé PRO (futur Lemon Squeezy) ────────────────────────────
  return {
    valid: false,
    reason: "Clé non reconnue. Vérifie qu'elle est copiée correctement.",
  };
}

// ─── Activation d'une clé (validation + écriture BDD) ────────
export async function activateKey(key: string): Promise<KeyValidationResult> {
  const result = await validateKey(key);
  if (result.valid) {
    const normalized = key.trim().toUpperCase();
    await db.setConfig("license_key", normalized);
    await db.setConfig("license_type", result.type);
    await db.setConfig("license_expires", result.expiresAt ?? "");
  }
  return result;
}

// ─── Démarrer l'essai gratuit ─────────────────────────────────
export async function startTrial(): Promise<void> {
  await db.setConfig("trial_started_at", new Date().toISOString());
}

// ─── Statut courant de la licence ────────────────────────────
export async function getLicenseStatus(): Promise<LicenseStatus> {
  const [licenseKey, licenseType, licenseExpires, trialStartedAt] =
    await Promise.all([
      db.getConfig("license_key"),
      db.getConfig("license_type"),
      db.getConfig("license_expires"),
      db.getConfig("trial_started_at"),
    ]);

  // ── Licence activée ──────────────────────────────────────────
  if (licenseKey && licenseType) {
    if (licenseType === "dev") {
      return { kind: "active", type: "dev", expiresAt: null };
    }
    if (licenseExpires) {
      const expDate = new Date(licenseExpires);
      if (new Date() >= expDate) {
        return { kind: "expired_key", type: licenseType as LicenseType };
      }
    }
    return {
      kind: "active",
      type: licenseType as LicenseType,
      expiresAt: licenseExpires || null,
    };
  }

  // ── Essai gratuit ────────────────────────────────────────────
  if (trialStartedAt) {
    const start = new Date(trialStartedAt);
    const daysDiff = Math.floor(
      (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24),
    );
    const daysLeft = TRIAL_DAYS - daysDiff;
    if (daysLeft > 0) {
      return { kind: "trial", daysLeft, trialStartedAt };
    }
    return { kind: "expired_trial" };
  }

  // ── Aucune licence ni essai ───────────────────────────────────
  return { kind: "no_license" };
}
