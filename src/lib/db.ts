import Database from "@tauri-apps/plugin-sql";
import { v4 as uuidv4 } from "uuid";

let dbInstance: Database | null = null;

async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:formassist.db");
    await dbInstance.execute("PRAGMA journal_mode = WAL");
    await dbInstance.execute("PRAGMA busy_timeout = 30000");
    await dbInstance.execute("PRAGMA synchronous = NORMAL");
  }
  return dbInstance;
}

// ============================================================
// Helpers génériques
// ============================================================

type Row = Record<string, unknown>;

async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = await getDb();
  return d.select<T[]>(sql, params);
}

// Toutes les écritures passent par cette queue pour éviter les accès concurrents à SQLite.
let _writeQueue: Promise<void> = Promise.resolve();

async function execute(sql: string, params: unknown[] = []): Promise<void> {
  const op = _writeQueue.then(() => getDb().then(d => d.execute(sql, params)));
  _writeQueue = op.then(() => {}, () => {});
  await op;
}

function generateId(): string {
  return uuidv4();
}

function now(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

// ============================================================
// Config
// ============================================================

async function getConfig(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(
    "SELECT value FROM app_config WHERE key = ?",
    [key],
  );
  return rows[0]?.value ?? null;
}

async function setConfig(key: string, value: string, encrypted = false): Promise<void> {
  await execute(
    `INSERT INTO app_config (key, value, encrypted, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = ?, encrypted = ?, updated_at = ?`,
    [key, value, encrypted ? 1 : 0, now(), value, encrypted ? 1 : 0, now()],
  );
}

// ============================================================
// API Usage
// ============================================================

async function logApiUsage(entry: {
  model: string;
  task_type: string;
  input_tokens: number;
  output_tokens: number;
  cost_euros: number;
  related_entity?: string;
  related_type?: string;
}): Promise<void> {
  await execute(
    `INSERT INTO api_usage_log (id, model, task_type, input_tokens, output_tokens, cost_euros, related_entity, related_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId(),
      entry.model,
      entry.task_type,
      entry.input_tokens,
      entry.output_tokens,
      entry.cost_euros,
      entry.related_entity ?? null,
      entry.related_type ?? null,
      now(),
    ],
  );
}

async function getMonthlyApiCost(monthStart: string): Promise<number> {
  const rows = await query<{ total: number }>(
    "SELECT COALESCE(SUM(cost_euros), 0) as total FROM api_usage_log WHERE created_at >= ?",
    [monthStart],
  );
  return rows[0]?.total ?? 0;
}

// ============================================================
// Centres
// ============================================================

async function getCentres(includeArchived = false): Promise<Row[]> {
  const where = includeArchived ? "" : "WHERE archived_at IS NULL";
  return query(`SELECT * FROM centres ${where} ORDER BY pinned DESC, name ASC`);
}

async function getCentre(id: string): Promise<Row | null> {
  const rows = await query("SELECT * FROM centres WHERE id = ?", [id]);
  return rows[0] ?? null;
}

async function createCentre(data: Record<string, unknown>): Promise<string> {
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

async function updateCentre(id: string, data: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(data);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => data[k]);

  await execute(
    `UPDATE centres SET ${sets}, updated_at = ? WHERE id = ?`,
    [...values, now(), id],
  );
}

async function archiveCentre(id: string): Promise<void> {
  await execute("UPDATE centres SET archived_at = ? WHERE id = ?", [now(), id]);
}

// ============================================================
// Suppressions définitives (ON DELETE CASCADE gère les enfants)
// ============================================================

async function deleteCentre(id: string): Promise<void> {
  await execute("DELETE FROM centres WHERE id = ?", [id]);
}
async function deleteFormation(id: string): Promise<void> {
  await execute("DELETE FROM formations WHERE id = ?", [id]);
}
async function deleteGroup(id: string): Promise<void> {
  await execute("DELETE FROM groups WHERE id = ?", [id]);
}
async function deleteLearner(id: string): Promise<void> {
  await execute("DELETE FROM learners WHERE id = ?", [id]);
}
async function deleteSlot(id: string): Promise<void> {
  await execute("DELETE FROM slots WHERE id = ?", [id]);
}
async function deleteContent(id: string): Promise<void> {
  await execute("DELETE FROM generated_contents WHERE id = ?", [id]);
}
async function deleteCorrection(id: string): Promise<void> {
  await execute("DELETE FROM corrections WHERE id = ?", [id]);
}
async function deleteInvoice(id: string): Promise<void> {
  await execute("DELETE FROM invoices WHERE id = ?", [id]);
}
async function deletePedagogicalSheet(id: string): Promise<void> {
  await execute("DELETE FROM pedagogical_sheets WHERE id = ?", [id]);
}
async function deleteEmailTemplate(id: string): Promise<void> {
  await execute("DELETE FROM email_templates WHERE id = ?", [id]);
}
async function resetStyleProfile(): Promise<void> {
  await execute(
    "UPDATE style_profile SET self_description = NULL, analyzed_profile = NULL, confirmed = 0, sample_files = NULL, updated_at = ? WHERE id = 'main'",
    [now()],
  );
}

// ============================================================
// Formations
// ============================================================

async function getFormations(centreId: string, includeArchived = false): Promise<Row[]> {
  const where = includeArchived
    ? "WHERE centre_id = ?"
    : "WHERE centre_id = ? AND archived_at IS NULL";
  return query(`SELECT * FROM formations ${where} ORDER BY start_date DESC`, [centreId]);
}

async function createFormation(data: Record<string, unknown>): Promise<string> {
  const id = generateId();
  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => data[k]);

  await execute(
    `INSERT INTO formations (id, ${keys.join(", ")}, created_at, updated_at)
     VALUES (?, ${placeholders}, ?, ?)`,
    [id, ...values, now(), now()],
  );
  return id;
}

// ============================================================
// REAC (CCP, Competences, Criteria)
// ============================================================

async function saveParsedReac(
  formationId: string,
  ccps: Array<{
    code: string;
    title: string;
    competences: Array<{
      code: string;
      title: string;
      description?: string;
      criteria: string[];
      savoirs?: {
        sf_techniques?: string[];
        sf_organisationnels?: string[];
        sf_relationnels?: string[];
        savoirs?: string[];
      };
    }>;
  }>,
): Promise<void> {
  await execute("BEGIN");
  try {
    // ON DELETE CASCADE supprime automatiquement competences et evaluation_criteria
    await execute("DELETE FROM ccps WHERE formation_id = ?", [formationId]);

    for (let i = 0; i < ccps.length; i++) {
      const ccp = ccps[i]!;
      const ccpId = generateId();
      await execute(
        "INSERT INTO ccps (id, formation_id, code, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [ccpId, formationId, ccp.code, ccp.title, i, now()],
      );

      for (let j = 0; j < ccp.competences.length; j++) {
        const comp = ccp.competences[j]!;
        const compId = generateId();
        await execute(
          "INSERT INTO competences (id, ccp_id, code, title, description, sort_order, in_scope, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
          [compId, ccpId, comp.code, comp.title, comp.description ?? null, j, now()],
        );

        for (let k = 0; k < comp.criteria.length; k++) {
          await execute(
            "INSERT INTO evaluation_criteria (id, competence_id, description, sort_order) VALUES (?, ?, ?, ?)",
            [generateId(), compId, comp.criteria[k], k],
          );
        }

        // Savoirs
        if (comp.savoirs) {
          const categoryMap: Array<['sf_technique' | 'sf_organisationnel' | 'sf_relationnel' | 'savoir', string[]]> = [
            ['sf_technique', comp.savoirs.sf_techniques ?? []],
            ['sf_organisationnel', comp.savoirs.sf_organisationnels ?? []],
            ['sf_relationnel', comp.savoirs.sf_relationnels ?? []],
            ['savoir', comp.savoirs.savoirs ?? []],
          ];
          let savoirOrder = 0;
          for (const [cat, items] of categoryMap) {
            for (const item of items) {
              await execute(
                "INSERT INTO competence_savoirs (id, competence_id, category, content, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                [generateId(), compId, cat, item, savoirOrder++, now()],
              );
            }
          }
        }
      }
    }

    await execute("UPDATE formations SET reac_parsed = 1, updated_at = ? WHERE id = ?", [
      now(),
      formationId,
    ]);
    await execute("COMMIT");
  } catch (err) {
    await execute("ROLLBACK").catch(() => {});
    throw err;
  }
}

async function copyReacToFormation(
  sourceFormationId: string,
  targetFormationId: string,
): Promise<void> {
  // Purge cible
  const existingCcps = await query<{ id: string }>(
    "SELECT id FROM ccps WHERE formation_id = ?",
    [targetFormationId],
  );
  for (const ccp of existingCcps) {
    const comps = await query<{ id: string }>(
      "SELECT id FROM competences WHERE ccp_id = ?",
      [ccp.id],
    );
    for (const comp of comps) {
      await execute("DELETE FROM evaluation_criteria WHERE competence_id = ?", [comp.id]);
    }
    await execute("DELETE FROM competences WHERE ccp_id = ?", [ccp.id]);
  }
  await execute("DELETE FROM ccps WHERE formation_id = ?", [targetFormationId]);

  // Lecture source
  const srcCcps = await query<{
    id: string;
    code: string;
    title: string;
    sort_order: number;
  }>(
    "SELECT id, code, title, sort_order FROM ccps WHERE formation_id = ? ORDER BY sort_order",
    [sourceFormationId],
  );

  for (const srcCcp of srcCcps) {
    const newCcpId = generateId();
    await execute(
      "INSERT INTO ccps (id, formation_id, code, title, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [newCcpId, targetFormationId, srcCcp.code, srcCcp.title, srcCcp.sort_order, now()],
    );

    const srcComps = await query<{
      id: string;
      code: string;
      title: string;
      description: string | null;
      sort_order: number;
      in_scope: number;
    }>(
      "SELECT id, code, title, description, sort_order, in_scope FROM competences WHERE ccp_id = ? ORDER BY sort_order",
      [srcCcp.id],
    );

    for (const srcComp of srcComps) {
      const newCompId = generateId();
      await execute(
        "INSERT INTO competences (id, ccp_id, code, title, description, sort_order, in_scope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          newCompId,
          newCcpId,
          srcComp.code,
          srcComp.title,
          srcComp.description,
          srcComp.sort_order,
          srcComp.in_scope,
          now(),
        ],
      );

      const srcCriteria = await query<{ description: string; sort_order: number }>(
        "SELECT description, sort_order FROM evaluation_criteria WHERE competence_id = ? ORDER BY sort_order",
        [srcComp.id],
      );
      for (const crit of srcCriteria) {
        await execute(
          "INSERT INTO evaluation_criteria (id, competence_id, description, sort_order) VALUES (?, ?, ?, ?)",
          [generateId(), newCompId, crit.description, crit.sort_order],
        );
      }
    }
  }

  await execute("UPDATE formations SET reac_parsed = 1, updated_at = ? WHERE id = ?", [
    now(),
    targetFormationId,
  ]);
}

// ============================================================
// Savoirs
// ============================================================

export type Savoir = {
  id: string;
  competence_id: string;
  category: 'sf_technique' | 'sf_organisationnel' | 'sf_relationnel' | 'savoir';
  content: string;
  sort_order: number;
};

async function getSavoirsForFormation(formationId: string): Promise<Savoir[]> {
  return query<Savoir>(
    `SELECT cs.* FROM competence_savoirs cs
     JOIN competences c ON cs.competence_id = c.id
     JOIN ccps ON c.ccp_id = ccps.id
     WHERE ccps.formation_id = ?
     ORDER BY c.sort_order, cs.category, cs.sort_order`,
    [formationId],
  );
}

// ============================================================
// Groups & Learners
// ============================================================

async function getGroups(formationId: string): Promise<Row[]> {
  return query(
    "SELECT * FROM groups WHERE formation_id = ? AND archived_at IS NULL ORDER BY name",
    [formationId],
  );
}

async function createGroup(formationId: string, name: string, description?: string): Promise<string> {
  const id = generateId();
  await execute(
    "INSERT INTO groups (id, formation_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, formationId, name, description ?? null, now(), now()],
  );
  return id;
}

async function updateGroup(id: string, name: string, description?: string): Promise<void> {
  await execute(
    "UPDATE groups SET name = ?, description = ?, updated_at = ? WHERE id = ?",
    [name, description ?? null, now(), id],
  );
}

async function getLearners(groupId: string): Promise<Row[]> {
  return query(
    "SELECT * FROM learners WHERE group_id = ? AND archived_at IS NULL ORDER BY last_name, first_name",
    [groupId],
  );
}

async function createLearner(data: Record<string, unknown>): Promise<string> {
  const id = generateId();
  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => data[k]);

  await execute(
    `INSERT INTO learners (id, ${keys.join(", ")}, created_at, updated_at)
     VALUES (?, ${placeholders}, ?, ?)`,
    [id, ...values, now(), now()],
  );
  return id;
}

// ============================================================
// Slots (Planning)
// ============================================================

async function getSlots(formationId: string, dateFrom?: string, dateTo?: string): Promise<Row[]> {
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

async function getAllSlots(dateFrom?: string, dateTo?: string): Promise<Row[]> {
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

async function createSlot(data: Record<string, unknown>): Promise<string> {
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

async function setSlotCompetences(slotId: string, competenceIds: string[]): Promise<void> {
  await execute("DELETE FROM slot_competences WHERE slot_id = ?", [slotId]);
  for (const id of competenceIds) {
    await execute(
      "INSERT OR IGNORE INTO slot_competences (slot_id, competence_id) VALUES (?, ?)",
      [slotId, id],
    );
  }
}

async function backfillSlotCompetences(): Promise<void> {
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

// ============================================================
// Generated Contents
// ============================================================

async function createContent(data: Record<string, unknown>): Promise<string> {
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

async function getContents(formationId: string, contentType?: string): Promise<Row[]> {
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
async function getAllContents(centreId?: string): Promise<Row[]> {
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
async function duplicateContentToSlot(contentId: string, slotId: string): Promise<string> {
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

async function getUnassignedContents(centreId?: string): Promise<Row[]> {
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

async function getContentsForSlot(slotId: string): Promise<Row[]> {
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

async function linkContentToSlot(contentId: string, slotId: string): Promise<void> {
  await execute(
    "UPDATE generated_contents SET slot_id = ?, updated_at = ? WHERE id = ?",
    [slotId, now(), contentId],
  );
}

async function unlinkContentFromSlot(contentId: string): Promise<void> {
  await execute(
    "UPDATE generated_contents SET slot_id = NULL, updated_at = ? WHERE id = ?",
    [now(), contentId],
  );
}

async function getUnassignedSheets(centreId?: string): Promise<Row[]> {
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

async function getSheetsForSlot(slotId: string): Promise<Row[]> {
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

async function linkSheetToSlot(sheetId: string, slotId: string): Promise<void> {
  await execute(
    "INSERT OR IGNORE INTO sheet_slots (sheet_id, slot_id) VALUES (?, ?)",
    [sheetId, slotId],
  );
}

async function unlinkSheetFromSlot(sheetId: string, slotId: string): Promise<void> {
  await execute(
    "DELETE FROM sheet_slots WHERE sheet_id = ? AND slot_id = ?",
    [sheetId, slotId],
  );
}

// ============================================================
// Invoices
// ============================================================

async function getInvoices(centreId?: string, status?: string): Promise<Row[]> {
  let sql = "SELECT * FROM invoices WHERE archived_at IS NULL";
  const params: unknown[] = [];

  if (centreId) {
    sql += " AND centre_id = ?";
    params.push(centreId);
  }
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }

  return query(sql + " ORDER BY created_at DESC", params);
}

async function createInvoice(data: Record<string, unknown>): Promise<string> {
  const id = generateId();
  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(", ");
  const values = keys.map((k) => data[k]);

  await execute(
    `INSERT INTO invoices (id, ${keys.join(", ")}, created_at, updated_at)
     VALUES (?, ${placeholders}, ?, ?)`,
    [id, ...values, now(), now()],
  );
  return id;
}

// ============================================================
// Style Profile
// ============================================================

async function getStyleProfile(): Promise<Row | null> {
  const rows = await query("SELECT * FROM style_profile WHERE id = 'main'");
  return rows[0] ?? null;
}

async function updateStyleProfile(data: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(data);
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => data[k]);

  await execute(
    `UPDATE style_profile SET ${sets}, updated_at = ? WHERE id = 'main'`,
    [...values, now()],
  );
}

// ============================================================
// RC/RE (par formation)
// ============================================================

async function saveRcre(
  formationId: string,
  data: { text?: string; pdfB64?: string },
): Promise<void> {
  await execute(
    `UPDATE formations SET rcre_text = ?, rcre_pdf_b64 = ?, updated_at = ? WHERE id = ?`,
    [data.text ?? null, data.pdfB64 ?? null, now(), formationId],
  );
}

async function getRcre(
  formationId: string,
): Promise<{ rcre_text: string | null; rcre_pdf_b64: string | null } | null> {
  const rows = await query<{ rcre_text: string | null; rcre_pdf_b64: string | null }>(
    "SELECT rcre_text, rcre_pdf_b64 FROM formations WHERE id = ?",
    [formationId],
  );
  return rows[0] ?? null;
}

// ============================================================
// Dossiers DP / Projet
// ============================================================

export interface DossierCorrection {
  id: string;
  learner_id: string;
  formation_id: string;
  dossier_type: "dp" | "projet";
  filename: string | null;
  submission_text: string | null;
  feedback_markdown: string | null;
  model_used: string | null;
  validated: boolean;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

async function saveDossierCorrection(data: {
  learnerId: string;
  formationId: string;
  dossierType: "dp" | "projet";
  filename: string | null;
  submissionText: string | null;
  feedbackMarkdown: string;
  modelUsed: string;
}): Promise<string> {
  const id = generateId();
  const n = now();
  await execute(
    `INSERT INTO dossier_corrections
      (id, learner_id, formation_id, dossier_type, filename, submission_text, feedback_markdown, model_used, validated, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id,
      data.learnerId,
      data.formationId,
      data.dossierType,
      data.filename ?? null,
      data.submissionText ?? null,
      data.feedbackMarkdown,
      data.modelUsed,
      n,
      n,
    ],
  );
  return id;
}

async function getDossierCorrections(formationId?: string, centreId?: string): Promise<Row[]> {
  if (formationId) {
    return query(
      `SELECT dc.*, l.first_name as learner_first_name, l.last_name as learner_last_name,
              f.title as formation_title
       FROM dossier_corrections dc
       LEFT JOIN learners l ON dc.learner_id = l.id
       LEFT JOIN formations f ON dc.formation_id = f.id
       WHERE dc.formation_id = ?
       ORDER BY dc.created_at DESC`,
      [formationId],
    );
  }
  if (centreId) {
    return query(
      `SELECT dc.*, l.first_name as learner_first_name, l.last_name as learner_last_name,
              f.title as formation_title
       FROM dossier_corrections dc
       LEFT JOIN learners l ON dc.learner_id = l.id
       LEFT JOIN formations f ON dc.formation_id = f.id
       WHERE f.centre_id = ?
       ORDER BY dc.created_at DESC
       LIMIT 100`,
      [centreId],
    );
  }
  return query(
    `SELECT dc.*, l.first_name as learner_first_name, l.last_name as learner_last_name,
            f.title as formation_title
     FROM dossier_corrections dc
     LEFT JOIN learners l ON dc.learner_id = l.id
     LEFT JOIN formations f ON dc.formation_id = f.id
     ORDER BY dc.created_at DESC
     LIMIT 100`,
  );
}

async function getDossierCorrection(id: string): Promise<Row | null> {
  const rows = await query(
    `SELECT dc.*, l.first_name as learner_first_name, l.last_name as learner_last_name,
            l.email as learner_email, f.title as formation_title
     FROM dossier_corrections dc
     LEFT JOIN learners l ON dc.learner_id = l.id
     LEFT JOIN formations f ON dc.formation_id = f.id
     WHERE dc.id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

async function markDossierSent(id: string): Promise<void> {
  const n = now();
  await execute(
    "UPDATE dossier_corrections SET sent_at = ?, updated_at = ? WHERE id = ?",
    [n, n, id],
  );
}

async function deleteDossierCorrection(id: string): Promise<void> {
  await execute("DELETE FROM dossier_corrections WHERE id = ?", [id]);
}

// ============================================================
// Migrations
// ============================================================

/**
 * Les migrations sont appliquées automatiquement par tauri-plugin-sql au chargement.
 * Cette fonction force simplement l'initialisation de la connexion BDD.
 */
async function runMigrations(): Promise<void> {
  // Déclenche le chargement de la BDD (et donc l'application automatique des migrations)
  await getDb();
}

async function deleteConfig(key: string): Promise<void> {
  await execute("DELETE FROM app_config WHERE key = ?", [key]);
}

// ============================================================
// Export public API
// ============================================================

export const db = {
  // Core
  query,
  execute,
  generateId,
  runMigrations,
  deleteConfig,
  // Config
  getConfig,
  setConfig,
  // API Usage
  logApiUsage,
  getMonthlyApiCost,
  // Centres
  getCentres,
  getCentre,
  createCentre,
  updateCentre,
  archiveCentre,
  deleteCentre,
  // Formations
  getFormations,
  createFormation,
  deleteFormation,
  // REAC
  saveParsedReac,
  copyReacToFormation,
  // Savoirs
  getSavoirsForFormation,
  // RC/RE
  saveRcre,
  getRcre,
  // Dossiers DP / Projet
  saveDossierCorrection,
  getDossierCorrections,
  getDossierCorrection,
  markDossierSent,
  deleteDossierCorrection,
  // Groups & Learners
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getLearners,
  createLearner,
  deleteLearner,
  // Slots
  getSlots,
  getAllSlots,
  createSlot,
  deleteSlot,
  setSlotCompetences,
  backfillSlotCompetences,
  // Contents
  createContent,
  getContents,
  getAllContents,
  getUnassignedContents,
  getContentsForSlot,
  linkContentToSlot,
  unlinkContentFromSlot,
  duplicateContentToSlot,
  deleteContent,
  // Pedagogical sheets links
  getUnassignedSheets,
  getSheetsForSlot,
  linkSheetToSlot,
  unlinkSheetFromSlot,
  // Invoices
  getInvoices,
  createInvoice,
  deleteInvoice,
  // Fiches pédago
  deletePedagogicalSheet,
  // Corrections
  deleteCorrection,
  // Email templates
  deleteEmailTemplate,
  // Style
  getStyleProfile,
  updateStyleProfile,
  resetStyleProfile,
};
