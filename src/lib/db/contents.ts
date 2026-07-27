import { query, execute, generateId, now } from "./core";
import type { Row } from "./core";

export async function createContent(data: Record<string, unknown>): Promise<string> {
  const id = generateId();
  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => data[k]);

  await execute(
    `INSERT INTO generated_contents (id, ${keys.join(", ")}, created_at, updated_at)
     VALUES (?, ${placeholders}, ?, ?)`,
    [id, ...values, now(), now()],
  );
  return id;
}

export async function getContents(formationId: string, contentType?: string): Promise<Row[]> {
  let sql = "SELECT * FROM generated_contents WHERE formation_id = ? AND archived_at IS NULL";
  const params: unknown[] = [formationId];

  if (contentType) {
    sql += " AND content_type = ?";
    params.push(contentType);
  }

  return query(sql + " ORDER BY created_at DESC", params);
}

/**
 * Tous les contenus (assignés ou non) d'un centre, avec date du créneau
 * actuel s'il est assigné. Utilisé pour réutiliser un contenu sur plusieurs
 * créneaux (chaque réutilisation = duplication indépendante).
 */
export async function getAllContents(centreId?: string): Promise<Row[]> {
  const sql = `
    SELECT gc.*, f.title AS formation_title, f.rncp_code AS formation_code,
           f.centre_id AS centre_id, s.date AS slot_date
      FROM generated_contents gc
      JOIN formations f ON f.id = gc.formation_id
      LEFT JOIN slots s ON s.id = gc.slot_id
     WHERE gc.archived_at IS NULL
       ${centreId ? "AND f.centre_id = ?" : ""}
     ORDER BY gc.created_at DESC
  `;
  return query(sql, centreId ? [centreId] : []);
}

/**
 * Duplique un contenu existant et l'assigne au créneau cible. Copie toutes
 * les colonnes (titre, markdown, html, durée…) et les compétences liées,
 * mais avec un nouvel ID. Le contenu d'origine reste intact.
 */
export async function duplicateContentToSlot(contentId: string, slotId: string): Promise<string> {
  const rows = await query<Row>("SELECT * FROM generated_contents WHERE id = ?", [contentId]);
  const orig = rows[0];
  if (!orig) throw new Error("Contenu introuvable");

  const newId = generateId();
  const ts = now();
  // Recopie toutes les colonnes sauf id/slot_id/created_at/updated_at/archived_at
  const skip = new Set(["id", "slot_id", "created_at", "updated_at", "archived_at"]);
  const fields = Object.keys(orig).filter((k) => !skip.has(k));
  const values = fields.map((k) => orig[k] as unknown);
  const placeholders = fields.map(() => "?").join(", ");

  await execute(
    `INSERT INTO generated_contents (id, ${fields.join(", ")}, slot_id, created_at, updated_at)
     VALUES (?, ${placeholders}, ?, ?, ?)`,
    [newId, ...values, slotId, ts, ts],
  );

  // Recopie les compétences associées (relation N-N)
  await execute(
    `INSERT OR IGNORE INTO content_competences (content_id, competence_id)
     SELECT ?, competence_id FROM content_competences WHERE content_id = ?`,
    [newId, contentId],
  );

  return newId;
}

/**
 * Lie un contenu généré aux compétences qu'il couvre (relation N-N).
 * Alimente la présélection des cours sources et l'anti-doublon de la page Évaluations.
 */
export async function linkContentToCompetences(
  contentId: string,
  competenceIds: string[],
): Promise<void> {
  for (const compId of competenceIds) {
    await execute(
      "INSERT OR IGNORE INTO content_competences (content_id, competence_id) VALUES (?, ?)",
      [contentId, compId],
    );
  }
}

/** Paires (content_id, competence_id) pour tous les contenus d'une formation. */
export async function getCompetenceIdsByContent(formationId: string): Promise<Row[]> {
  return query(
    `SELECT cc.content_id, cc.competence_id
       FROM content_competences cc
       JOIN generated_contents gc ON gc.id = cc.content_id
      WHERE gc.formation_id = ? AND gc.archived_at IS NULL`,
    [formationId],
  );
}

export async function getUnassignedContents(centreId?: string): Promise<Row[]> {
  const sql = `
    SELECT gc.*, f.title AS formation_title, f.rncp_code AS formation_code, f.centre_id AS centre_id
      FROM generated_contents gc
      JOIN formations f ON f.id = gc.formation_id
     WHERE gc.slot_id IS NULL
       AND gc.archived_at IS NULL
       ${centreId ? "AND f.centre_id = ?" : ""}
     ORDER BY gc.created_at DESC
  `;
  return query(sql, centreId ? [centreId] : []);
}

export async function getContentsForSlot(slotId: string): Promise<Row[]> {
  return query(
    `SELECT gc.*, f.title AS formation_title, f.rncp_code AS formation_code
       FROM generated_contents gc
       JOIN formations f ON f.id = gc.formation_id
      WHERE gc.slot_id = ?
        AND gc.archived_at IS NULL
      ORDER BY gc.created_at DESC`,
    [slotId],
  );
}

export async function linkContentToSlot(contentId: string, slotId: string): Promise<void> {
  await execute(
    "UPDATE generated_contents SET slot_id = ?, updated_at = ? WHERE id = ?",
    [slotId, now(), contentId],
  );
}

export async function unlinkContentFromSlot(contentId: string): Promise<void> {
  await execute(
    "UPDATE generated_contents SET slot_id = NULL, updated_at = ? WHERE id = ?",
    [now(), contentId],
  );
}

export async function getUnassignedSheets(centreId?: string): Promise<Row[]> {
  const sql = `
    SELECT ps.*, f.title AS formation_title, f.rncp_code AS formation_code, f.centre_id AS centre_id
      FROM pedagogical_sheets ps
      JOIN formations f ON f.id = ps.formation_id
     WHERE ps.archived_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM sheet_slots ss WHERE ss.sheet_id = ps.id)
       ${centreId ? "AND f.centre_id = ?" : ""}
     ORDER BY ps.created_at DESC
  `;
  return query(sql, centreId ? [centreId] : []);
}

export async function getSheetsForSlot(slotId: string): Promise<Row[]> {
  return query(
    `SELECT ps.*, f.title AS formation_title, f.rncp_code AS formation_code
       FROM pedagogical_sheets ps
       JOIN formations f ON f.id = ps.formation_id
       JOIN sheet_slots ss ON ss.sheet_id = ps.id
      WHERE ss.slot_id = ?
        AND ps.archived_at IS NULL
      ORDER BY ps.created_at DESC`,
    [slotId],
  );
}

export async function linkSheetToSlot(sheetId: string, slotId: string): Promise<void> {
  await execute(
    "INSERT OR IGNORE INTO sheet_slots (sheet_id, slot_id) VALUES (?, ?)",
    [sheetId, slotId],
  );
}

export async function unlinkSheetFromSlot(sheetId: string, slotId: string): Promise<void> {
  await execute(
    "DELETE FROM sheet_slots WHERE sheet_id = ? AND slot_id = ?",
    [sheetId, slotId],
  );
}
