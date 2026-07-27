import { query, execute, generateId, now } from "./core";
import type { Row } from "./core";

export async function getSlots(formationId: string, dateFrom?: string, dateTo?: string): Promise<Row[]> {
  let sql = "SELECT * FROM slots WHERE formation_id = ?";
  const params: unknown[] = [formationId];

  if (dateFrom) {
    sql += " AND date >= ?";
    params.push(dateFrom);
  }
  if (dateTo) {
    sql += " AND date <= ?";
    params.push(dateTo);
  }

  return query(sql + " ORDER BY date, start_time", params);
}

export async function getAllSlots(dateFrom?: string, dateTo?: string): Promise<Row[]> {
  let sql = `
    SELECT s.*, f.title as formation_title, f.rncp_code as formation_code,
           c.id as centre_id, c.name as centre_name, c.color as centre_color
    FROM slots s
    JOIN formations f ON s.formation_id = f.id
    JOIN centres c ON f.centre_id = c.id
    WHERE f.archived_at IS NULL AND c.archived_at IS NULL
  `;
  const params: unknown[] = [];

  if (dateFrom) {
    sql += " AND s.date >= ?";
    params.push(dateFrom);
  }
  if (dateTo) {
    sql += " AND s.date <= ?";
    params.push(dateTo);
  }

  return query(sql + " ORDER BY s.date, s.start_time", params);
}

export async function createSlot(data: Record<string, unknown>): Promise<string> {
  const id = generateId();
  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => data[k]);

  await execute(
    `INSERT INTO slots (id, ${keys.join(", ")}, created_at, updated_at)
     VALUES (?, ${placeholders}, ?, ?)`,
    [id, ...values, now(), now()],
  );
  return id;
}

function _normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[\s.]/g, "");
}

function _extractCompetenceCodes(title: string | null | undefined): string[] {
  if (!title) return [];
  const matches = title.toUpperCase().match(/C{1,3}P*\s*\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(matches.map(_normalizeCode))];
}

export async function setSlotCompetences(slotId: string, competenceIds: string[]): Promise<void> {
  await execute("DELETE FROM slot_competences WHERE slot_id = ?", [slotId]);
  for (const id of competenceIds) {
    await execute(
      "INSERT OR IGNORE INTO slot_competences (slot_id, competence_id) VALUES (?, ?)",
      [slotId, id],
    );
  }
}

export async function backfillSlotCompetences(): Promise<void> {
  const slots = await query<{ id: string; title: string | null; formation_id: string }>(
    "SELECT id, title, formation_id FROM slots WHERE title IS NOT NULL",
  );
  if (slots.length === 0) return;

  const competences = await query<{ id: string; code: string; formation_id: string }>(
    `SELECT c.id, c.code, cp.formation_id
       FROM competences c
       JOIN ccps cp ON cp.id = c.ccp_id`,
  );

  const byFormation = new Map<string, Array<{ id: string; code: string }>>();
  for (const c of competences) {
    const list = byFormation.get(c.formation_id) ?? [];
    list.push({ id: c.id, code: c.code });
    byFormation.set(c.formation_id, list);
  }

  const existing = await query<{ slot_id: string; competence_id: string }>(
    "SELECT slot_id, competence_id FROM slot_competences",
  );
  const existingSet = new Set(existing.map((r) => `${r.slot_id}:${r.competence_id}`));

  for (const slot of slots) {
    const codes = _extractCompetenceCodes(slot.title);
    if (codes.length === 0) continue;
    const formationComps = byFormation.get(slot.formation_id) ?? [];
    for (const code of codes) {
      const match = formationComps.find((c) => _normalizeCode(c.code) === code);
      if (!match) continue;
      const key = `${slot.id}:${match.id}`;
      if (existingSet.has(key)) continue;
      await execute(
        "INSERT OR IGNORE INTO slot_competences (slot_id, competence_id) VALUES (?, ?)",
        [slot.id, match.id],
      );
    }
  }
}
