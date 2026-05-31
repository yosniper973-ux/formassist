/**
 * Sauvegarde automatique FormAssist vers Supabase Storage.
 *
 * Chemin : {sha256(licenseKey)[0:16]}/{sha256(deviceId)[0:16]}.db
 * Bucket  : backups (public)
 *
 * Chaque appareil a son propre slot — deux PC avec la même clé ne
 * s'écrasent pas mutuellement. La détection « nouveau PC » liste les
 * slots des autres appareils et propose une restauration.
 */

import { invoke } from "@tauri-apps/api/core";
import { readFile, writeFile, remove } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { db } from "./db";

const SUPABASE_URL = "https://aacqzpvuavugsvxretso.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Vh3sSsMrwYENShX-5moeBA_Gu4a2Elr";
const BUCKET = "backups";
const BACKUP_INTERVAL_MS = 60 * 60 * 1000; // 1 heure

// ─── SHA-256 ────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Device ID (persistant, unique par installation) ─────────────

async function getOrCreateDeviceId(): Promise<string> {
  let id = await db.getConfig("device_id");
  if (!id) {
    id = crypto.randomUUID();
    await db.setConfig("device_id", id);
  }
  return id;
}

// ─── Calcul des chemins Supabase ─────────────────────────────────

export async function getBackupPath(): Promise<{
  keyHash: string;
  deviceHash: string;
  path: string;
}> {
  const licenseKey = await db.getConfig("license_key");
  if (!licenseKey) throw new Error("Aucune licence active.");

  const deviceId = await getOrCreateDeviceId();
  const keyHash = (await sha256Hex(licenseKey)).substring(0, 16);
  const deviceHash = (await sha256Hex(deviceId)).substring(0, 16);
  return { keyHash, deviceHash, path: `${keyHash}/${deviceHash}.db` };
}

// ─── API Supabase Storage ────────────────────────────────────────

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
  };
}

async function uploadBackup(path: string, data: Uint8Array): Promise<void> {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/octet-stream",
      "x-upsert": "true",
    },
    body: data,
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Upload échoué (${resp.status}): ${msg}`);
  }
}

async function downloadBackup(path: string): Promise<Uint8Array> {
  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) throw new Error(`Téléchargement échoué (${resp.status})`);
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

interface SupabaseListItem {
  name: string;
  updated_at: string;
  metadata?: { size?: number };
}

async function listDeviceBackups(
  keyHash: string,
): Promise<Array<{ deviceHash: string; updatedAt: string; size: number }>> {
  const url = `${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: `${keyHash}/`, limit: 20 }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) return [];
  const items = (await resp.json()) as SupabaseListItem[];
  return items.map((item) => ({
    // Supabase renvoie le nom relatif au préfixe : "deviceHash.db"
    deviceHash: item.name.replace(/\.db$/, ""),
    updatedAt: item.updated_at,
    size: item.metadata?.size ?? 0,
  }));
}

// ─── Export → upload ─────────────────────────────────────────────

/**
 * Exporte la BDD locale et la pousse sur Supabase.
 * Mémorise cloud_last_backup_at en BDD.
 */
export async function performCloudBackup(): Promise<void> {
  const { path } = await getBackupPath();
  const dataDir = await appDataDir();
  const tempPath = await join(dataDir, "cloud_backup_tmp.db");

  try {
    // 1. Exporter la BDD vers un fichier temporaire
    await invoke("export_database", { destPath: tempPath });
    // 2. Lire les octets
    const data = await readFile(tempPath);
    // 3. Pousser sur Supabase
    await uploadBackup(path, data);
    // 4. Mémoriser la date
    await db.setConfig("cloud_last_backup_at", new Date().toISOString());
  } finally {
    await remove(tempPath).catch(() => {});
  }
}

// ─── Download → restore ──────────────────────────────────────────

/**
 * Télécharge la sauvegarde d'un autre appareil et l'applique localement.
 * Appelle restore_backup (qui crée une sauvegarde de sécurité avant écraser).
 * Après cet appel, l'app doit être relancée (relaunch()).
 */
export async function restoreFromCloud(
  keyHash: string,
  deviceHash: string,
): Promise<void> {
  const cloudPath = `${keyHash}/${deviceHash}.db`;
  const dataDir = await appDataDir();
  const tempPath = await join(dataDir, "cloud_restore_tmp.db");

  try {
    const data = await downloadBackup(cloudPath);
    await writeFile(tempPath, data);
    await invoke("restore_backup", { backupPath: tempPath });
  } finally {
    await remove(tempPath).catch(() => {});
  }
}

// ─── Auto-backup (throttlé 1 h) ──────────────────────────────────

/**
 * Déclenche une sauvegarde cloud uniquement si :
 * - l'appareil est en ligne
 * - une licence est activée
 * - il s'est écoulé > 1h depuis la dernière sauvegarde cloud
 * Silencieux : les erreurs sont ignorées.
 */
export async function autoBackupIfNeeded(): Promise<void> {
  if (!navigator.onLine) return;

  const licenseKey = await db.getConfig("license_key");
  if (!licenseKey) return; // Pas de licence → pas de sauvegarde cloud

  const lastBackup = await db.getConfig("cloud_last_backup_at");
  if (lastBackup) {
    const elapsed = Date.now() - new Date(lastBackup).getTime();
    if (elapsed < BACKUP_INTERVAL_MS) return;
  }

  try {
    await performCloudBackup();
  } catch {
    // Silencieux — l'utilisateur n'est pas notifié des échecs auto
  }
}

// ─── Détection nouveau PC ─────────────────────────────────────────

export interface OtherDeviceBackup {
  keyHash: string;
  deviceHash: string;
  updatedAt: string;
  size: number;
}

/**
 * Liste les sauvegardes cloud des AUTRES appareils utilisant la même licence.
 * Retourne [] si aucune, ou si la licence n'est pas activée, ou en cas d'erreur.
 */
export async function findOtherDeviceBackups(): Promise<OtherDeviceBackup[]> {
  try {
    const licenseKey = await db.getConfig("license_key");
    if (!licenseKey) return [];

    const deviceId = await getOrCreateDeviceId();
    const keyHash = (await sha256Hex(licenseKey)).substring(0, 16);
    const myDeviceHash = (await sha256Hex(deviceId)).substring(0, 16);

    const all = await listDeviceBackups(keyHash);
    return all
      .filter((b) => b.deviceHash !== myDeviceHash)
      .map((b) => ({ keyHash, ...b }));
  } catch {
    return [];
  }
}

// ─── Utilitaires ─────────────────────────────────────────────────

export async function getLastCloudBackupAt(): Promise<string | null> {
  return db.getConfig("cloud_last_backup_at");
}
