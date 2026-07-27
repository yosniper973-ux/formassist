import { query, execute, now } from "./core";
import type { Row } from "./core";

export async function getStyleProfile(): Promise<Row | null> {
  const rows = await query("SELECT * FROM style_profile WHERE id = 'main'");
  return rows[0] ?? null;
}

export async function updateStyleProfile(data: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(data);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => data[k]);

  await execute(
    `UPDATE style_profile SET ${sets}, updated_at = ? WHERE id = 'main'`,
    [...values, now()],
  );
}
