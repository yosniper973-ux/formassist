import { query, execute, generateId, now } from "./core";
import type { Row } from "./core";

export async function getCentres(includeArchived = false): Promise<Row[]> {
  const where = includeArchived ? "" : "WHERE archived_at IS NULL";
  return query(`SELECT * FROM centres ${where} ORDER BY pinned DESC, name ASC`);
}

export async function getCentre(id: string): Promise<Row | null> {
  const rows = await query("SELECT * FROM centres WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function createCentre(data: Record<string, unknown>): Promise<string> {
  const id = generateId();
  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => data[k]);

  await execute(
    `INSERT INTO centres (id, ${keys.join(", ")}, created_at, updated_at)
     VALUES (?, ${placeholders}, ?, ?)`,
    [id, ...values, now(), now()],
  );
  return id;
}

export async function updateCentre(id: string, data: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(data);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => data[k]);

  await execute(
    `UPDATE centres SET ${sets}, updated_at = ? WHERE id = ?`,
    [...values, now(), id],
  );
}

export async function archiveCentre(id: string): Promise<void> {
  await execute("UPDATE centres SET archived_at = ? WHERE id = ?", [now(), id]);
}
