/**
 * Gestion des licences FormAssist.
 *
 * Types de clés :
 *  - DEV  : FA-DEV-YOHANN-2026  (permanent, hardcodé, hors ligne)
 *  - TEST : FA-TEST-YYYYMM-XXXXXX  (HMAC-SHA256, expire fin du mois indiqué)
 *  - PRO  : UUID Lemon Squeezy (validation API en ligne, grâce 7 jours offline)
 *
 * Essai gratuit : 14 jours à partir du premier lancement.
 */

import { db } from "./db";

// ─── Constantes ───────────────────────────────────────────────

const DEV_KEY = "FA-DEV-YOHANN-2026";
const HMAC_SECRET = "FA26KX92MP37QR81";
const TRIAL_DAYS = 14;
const OFFLINE_GRACE_DAYS = 7;

/**
 * Remplis ces deux valeurs dès que tu as créé ton compte Lemon Squeezy
 * et configuré ton produit FormAssist.
 *
 * Store ID  → tableau de bord LS > Settings > Store > Store ID
 * Variant ID → ton produit > la variante "Mensuel 39€" > ID (dans l'URL)
 *
 * Laisse à "" tant que LS n'est pas configuré : l'app indiquera à l'utilisateur
 * de contacter le support plutôt que de planter.
 */
const LS_STORE_ID = "";    // ex: "12345"
const LS_VARIANT_ID = "";  // ex: "67890"

// ─── Types ────────────────────────────────────────────────────

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

// ─── Validation Lemon Squeezy (clés PRO) ─────────────────────

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LsActivateResponse {
  activated?: boolean;
  error?: string;
  license_key?: { status: string; expires_at: string | null };
  instance?: { id: string };
}

interface LsValidateResponse {
  valid?: boolean;
  error?: string;
  license_key?: { status: string; expires_at: string | null };
}

/**
 * Première activation d'une clé PRO sur cet appareil.
 * Retourne l'instance_id à conserver en BDD pour les validations suivantes.
 */
async function lsActivate(
  key: string,
): Promise<{ ok: boolean; instanceId?: string; expiresAt?: string | null; error?: string }> {
  if (!LS_STORE_ID || !LS_VARIANT_ID) {
    return {
      ok: false,
      error:
        "La vente en ligne n'est pas encore ouverte. Contacte le développeur pour obtenir ta clé.",
    };
  }
  try {
    const instanceName = `FormAssist — ${navigator.platform} (${new Date().toLocaleDateString("fr-FR")})`;
    const resp = await fetch("https://api.lemonsqueezy.com/v1/licenses/activate", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ license_key: key, instance_name: instanceName }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await resp.json()) as LsActivateResponse;

    if (data.activated && data.license_key?.status === "active") {
      return {
        ok: true,
        instanceId: data.instance?.id,
        expiresAt: data.license_key.expires_at,
      };
    }
    return {
      ok: false,
      error: data.error ?? "Clé invalide ou abonnement inactif.",
    };
  } catch {
    return { ok: false, error: "Impossible de joindre le serveur de licence. Vérifie ta connexion internet." };
  }
}

/**
 * Re-validation d'une clé PRO déjà activée sur cet appareil.
 */
async function lsValidate(
  key: string,
  instanceId: string,
): Promise<{ ok: boolean; expiresAt?: string | null }> {
  try {
    const resp = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ license_key: key, instance_id: instanceId }),
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await resp.json()) as LsValidateResponse;
    if (data.valid && data.license_key?.status === "active") {
      return { ok: true, expiresAt: data.license_key.expires_at };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

// ─── Validation d'une clé (sans écriture BDD) ────────────────

export async function validateKey(key: string): Promise<KeyValidationResult> {
  const k = key.trim();

  // ── Clé développeur ──────────────────────────────────────────
  if (k.toUpperCase() === DEV_KEY) {
    return { valid: true, type: "dev", expiresAt: null };
  }

  // ── Clé de test : FA-TEST-YYYYMM-XXXXXX ─────────────────────
  if (k.toUpperCase().startsWith("FA-TEST-")) {
    const parts = k.toUpperCase().split("-");
    if (parts.length !== 4) {
      return { valid: false, reason: "Format de clé invalide." };
    }
    const yyyymm = parts[2]!;
    const givenHmac = parts[3]!;

    if (!/^\d{6}$/.test(yyyymm)) {
      return { valid: false, reason: "Format de clé invalide." };
    }

    const prefix = `FA-TEST-${yyyymm}`;
    const fullHex = await hmacSha256Hex(HMAC_SECRET, prefix);
    const expectedHmac = fullHex.substring(0, 6);

    if (givenHmac !== expectedHmac) {
      return { valid: false, reason: "Clé invalide ou incorrecte." };
    }

    const year = parseInt(yyyymm.substring(0, 4), 10);
    const month = parseInt(yyyymm.substring(4, 6), 10);
    const expiresDate = new Date(year, month, 1);
    const expiresAt = expiresDate.toISOString().substring(0, 10);

    if (new Date() >= expiresDate) {
      return { valid: false, reason: `Cette clé de test a expiré le ${expiresAt}.` };
    }

    return { valid: true, type: "test", expiresAt };
  }

  // ── Clé PRO : UUID Lemon Squeezy ─────────────────────────────
  if (UUID_REGEX.test(k)) {
    const result = await lsActivate(k);
    if (result.ok) {
      // Stocker l'instance_id pour les validations futures
      await db.setConfig("license_instance_id", result.instanceId ?? "");
      await db.setConfig("license_last_validated_at", new Date().toISOString());
      return { valid: true, type: "pro", expiresAt: result.expiresAt ?? null };
    }
    return { valid: false, reason: result.error ?? "Activation impossible." };
  }

  return {
    valid: false,
    reason: "Clé non reconnue. Vérifie qu'elle est copiée correctement.",
  };
}

// ─── Activation d'une clé (validation + écriture BDD) ────────

export async function activateKey(key: string): Promise<KeyValidationResult> {
  const result = await validateKey(key.trim());
  if (result.valid) {
    const normalized =
      result.type === "pro" ? key.trim() : key.trim().toUpperCase();
    await db.setConfig("license_key", normalized);
    await db.setConfig("license_type", result.type);
    await db.setConfig("license_expires", result.expiresAt ?? "");
  }
  return result;
}

// ─── Désactivation Lemon Squeezy (transfert de PC) ───────────

async function lsDeactivate(key: string, instanceId: string): Promise<boolean> {
  try {
    const resp = await fetch("https://api.lemonsqueezy.com/v1/licenses/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ license_key: key, instance_id: instanceId }),
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await resp.json()) as { deactivated?: boolean };
    return data.deactivated === true;
  } catch {
    return false;
  }
}

/**
 * Désactive la licence PRO sur cet appareil.
 * À appeler AVANT de changer de PC pour libérer un slot d'activation.
 * La clé reste valide — elle pourra être re-saisie sur le nouveau PC.
 */
export async function deactivateLicenseOnThisDevice(): Promise<{ ok: boolean; error?: string }> {
  const [licenseKey, licenseType, instanceId] = await Promise.all([
    db.getConfig("license_key"),
    db.getConfig("license_type"),
    db.getConfig("license_instance_id"),
  ]);

  // DEV / TEST : pas d'instance LS, rien à faire côté serveur
  if (licenseType !== "pro" || !licenseKey) {
    await clearLicenseLocally();
    return { ok: true };
  }

  if (instanceId) {
    const ok = await lsDeactivate(licenseKey, instanceId);
    if (!ok) {
      return {
        ok: false,
        error:
          "Impossible de joindre le serveur Lemon Squeezy. " +
          "Vérifie ta connexion internet et réessaie.",
      };
    }
  }

  await clearLicenseLocally();
  return { ok: true };
}

async function clearLicenseLocally(): Promise<void> {
  await Promise.all([
    db.setConfig("license_key", ""),
    db.setConfig("license_type", ""),
    db.setConfig("license_expires", ""),
    db.setConfig("license_instance_id", ""),
    db.setConfig("license_last_validated_at", ""),
  ]);
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

    // DEV : permanent, pas de réseau
    if (licenseType === "dev") {
      return { kind: "active", type: "dev", expiresAt: null };
    }

    // TEST : vérification de la date d'expiration locale
    if (licenseType === "test") {
      if (licenseExpires && new Date() >= new Date(licenseExpires)) {
        return { kind: "expired_key", type: "test" };
      }
      return { kind: "active", type: "test", expiresAt: licenseExpires || null };
    }

    // PRO : re-validation Lemon Squeezy avec grâce offline
    if (licenseType === "pro") {
      const [instanceId, lastValidatedAt] = await Promise.all([
        db.getConfig("license_instance_id"),
        db.getConfig("license_last_validated_at"),
      ]);

      // Calcul jours depuis dernière validation réussie
      const daysSinceValidation = lastValidatedAt
        ? (Date.now() - new Date(lastValidatedAt).getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;

      // Dans la grâce (< 7j) : on fait confiance au cache, pas d'appel réseau
      if (daysSinceValidation < OFFLINE_GRACE_DAYS) {
        return { kind: "active", type: "pro", expiresAt: licenseExpires || null };
      }

      // Hors grâce : re-valider en ligne
      if (instanceId) {
        const check = await lsValidate(licenseKey, instanceId);
        if (check.ok) {
          await db.setConfig("license_last_validated_at", new Date().toISOString());
          if (check.expiresAt !== undefined) {
            await db.setConfig("license_expires", check.expiresAt ?? "");
          }
          return { kind: "active", type: "pro", expiresAt: check.expiresAt ?? licenseExpires ?? null };
        }
        // Pas de réponse (hors ligne) : tolérance supplémentaire de 7 jours si on
        // avait déjà une validation récente, sinon bloquer.
        if (daysSinceValidation < OFFLINE_GRACE_DAYS * 2) {
          return { kind: "active", type: "pro", expiresAt: licenseExpires || null };
        }
        return { kind: "expired_key", type: "pro" };
      }

      // Pas d'instance_id → clé corrompue, forcer re-activation
      return { kind: "expired_key", type: "pro" };
    }
  }

  // ── Essai gratuit ────────────────────────────────────────────
  if (trialStartedAt) {
    const daysDiff = Math.floor(
      (Date.now() - new Date(trialStartedAt).getTime()) / (1000 * 60 * 60 * 24),
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
