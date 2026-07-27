import { query, execute, now } from "./core";

export async function getConfig(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(
    "SELECT value FROM app_config WHERE key = ?",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setConfig(key: string, value: string, encrypted = false): Promise<void> {
  await execute(
    `INSERT INTO app_config (key, value, encrypted, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = ?, encrypted = ?, updated_at = ?`,
    [key, value, encrypted ? 1 : 0, now(), value, encrypted ? 1 : 0, now()],
  );
}

export async function deleteConfig(key: string): Promise<void> {
  await execute("DELETE FROM app_config WHERE key = ?", [key]);
}
