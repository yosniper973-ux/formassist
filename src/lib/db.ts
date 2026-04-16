import Database from "@tauri-apps/plugin-sql";
import { v4 as uuidv4 } from "uuid";

let dbInstance: Database | null = null;

async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:formassist.db");
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

async function execute(sql: string, params: unknown[] = []): Promise<void> {
  const d = await getDb();
  await d.execute(sql, params);
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
    }>;
  }>,
): Promise<void> {
  // Clear existing REAC data for this formation
  const existingCcps = await query<{ id: string }>(
    "SELECT id FROM ccps WHERE formation_id = ?",
    [formationId],
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
  await execute("DELETE FROM ccps WHERE formation_id = ?", [formationId]);

  // Insert new data
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
    }
  }

  await execute("UPDATE formations SET reac_parsed = 1, updated_at = ? WHERE id = ?", [
    now(),
    formationId,
  ]);
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
  // Formations
  getFormations,
  createFormation,
  // REAC
  saveParsedReac,
  // Groups & Learners
  getGroups,
  createGroup,
  getLearners,
  createLearner,
  // Slots
  getSlots,
  getAllSlots,
  createSlot,
  // Contents
  createContent,
  getContents,
  // Invoices
  getInvoices,
  createInvoice,
  // Style
  getStyleProfile,
  updateStyleProfile,
};
