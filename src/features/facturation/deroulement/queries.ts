import { db } from "@/lib/db";
import type {
  CcpRow,
  CompetenceRow,
  ContentOption,
  DetectedCcp,
  DeroulementSheetRow,
  EvaluationCriterionRow,
  SlotLight,
} from "./types";

const DEFAULT_REDACTEUR = "CASTRY JO-ANNE";

function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[\s.]/g, "");
}

/** Extrait les codes compétences présents dans le titre d'un créneau (ex: "C1, CP2.1"). */
function extractCompetenceCodes(title: string | null | undefined): string[] {
  if (!title) return [];
  const matches = title.toUpperCase().match(/C{1,3}P*\s*\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(matches.map(normalizeCode))];
}

/**
 * Détecte tous les CCP touchés par les séances planifiées entre period_start et period_end
 * pour la formation donnée. Retourne 1 structure par CCP avec compétences, critères, exercices disponibles, slots.
 *
 * Le rattachement séance ↔ compétence se fait en parsant les codes compétence
 * dans le titre du créneau (même règle que la page Planning), puis en les
 * faisant correspondre aux compétences de la formation.
 */
export async function detectCcpsForInvoice(params: {
  formationId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
}): Promise<DetectedCcp[]> {
  const { formationId, periodStart, periodEnd } = params;

  // 1. Récupérer tous les slots de la formation sur la période
  const slots = await db.query<SlotLight>(
    `SELECT id, date, duration_hours, title, description, extra_activity_id
     FROM slots
     WHERE formation_id = ?
       AND date >= ?
       AND date <= ?
     ORDER BY date, start_time`,
    [formationId, periodStart, periodEnd],
  );

  if (slots.length === 0) return [];

  // 2. Toutes les compétences de la formation (via les CCPs)
  const allComps = await db.query<CompetenceRow>(
    `SELECT c.id, c.ccp_id, c.code, c.title, c.description, c.sort_order
       FROM competences c
       JOIN ccps cp ON cp.id = c.ccp_id
      WHERE cp.formation_id = ?`,
    [formationId],
  );

  if (allComps.length === 0) return [];

  const compByCode = new Map<string, CompetenceRow>();
  for (const c of allComps) compByCode.set(normalizeCode(c.code), c);

  // 3. Pour chaque slot, extraire les codes du titre et résoudre les compétences
  const competencesById = new Map<string, CompetenceRow>();
  const slotsByCompetence = new Map<string, Set<string>>();
  for (const slot of slots) {
    const codes = extractCompetenceCodes(slot.title);
    for (const code of codes) {
      const comp = compByCode.get(code);
      if (!comp) continue;
      competencesById.set(comp.id, comp);
      if (!slotsByCompetence.has(comp.id)) slotsByCompetence.set(comp.id, new Set());
      slotsByCompetence.get(comp.id)!.add(slot.id);
    }
  }

  if (competencesById.size === 0) return [];

  // 3. Récupérer les CCPs concernés
  const ccpIds = Array.from(new Set(Array.from(competencesById.values()).map((c) => c.ccp_id)));
  const ccpPlaceholders = ccpIds.map(() => "?").join(",");
  const ccps = await db.query<CcpRow>(
    `SELECT id, formation_id, code, title, sort_order
     FROM ccps
     WHERE id IN (${ccpPlaceholders})
     ORDER BY sort_order, code`,
    ccpIds,
  );

  // 4. Récupérer les critères d'évaluation pour toutes les compétences
  const compIds = Array.from(competencesById.keys());
  const compPlaceholders = compIds.map(() => "?").join(",");
  const criteria = await db.query<EvaluationCriterionRow>(
    `SELECT id, competence_id, description, sort_order
     FROM evaluation_criteria
     WHERE competence_id IN (${compPlaceholders})
     ORDER BY sort_order`,
    compIds,
  );
  const criteriaByCompetence = new Map<string, EvaluationCriterionRow[]>();
  for (const c of criteria) {
    if (!criteriaByCompetence.has(c.competence_id))
      criteriaByCompetence.set(c.competence_id, []);
    criteriaByCompetence.get(c.competence_id)!.push(c);
  }

  // 5. Récupérer les contenus générés liés à ces compétences (tous statuts sauf archivés)
  const contentsRaw = await db.query<
    ContentOption & { competence_id: string }
  >(
    `SELECT DISTINCT gc.id, gc.title, gc.content_type,
            SUBSTR(gc.content_markdown, 1, 400) as markdown_preview,
            cc.competence_id as competence_id
     FROM generated_contents gc
     JOIN content_competences cc ON cc.content_id = gc.id
     WHERE cc.competence_id IN (${compPlaceholders})
       AND gc.archived_at IS NULL
     ORDER BY gc.created_at DESC`,
    compIds,
  );
  const contentsByCompetence = new Map<string, ContentOption[]>();
  for (const row of contentsRaw) {
    const opt: ContentOption = {
      id: row.id,
      title: row.title,
      content_type: row.content_type,
      markdown_preview: row.markdown_preview ?? "",
    };
    if (!contentsByCompetence.has(row.competence_id))
      contentsByCompetence.set(row.competence_id, []);
    contentsByCompetence.get(row.competence_id)!.push(opt);
  }

  // 6. Construire les DetectedCcp
  const result: DetectedCcp[] = ccps.map((ccp) => {
    const compsOfCcp = Array.from(competencesById.values())
      .filter((c) => c.ccp_id === ccp.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));

    // Slots uniques liés aux compétences du CCP
    const ccpSlotIds = new Set<string>();
    for (const comp of compsOfCcp) {
      const s = slotsByCompetence.get(comp.id);
      if (s) for (const id of s) ccpSlotIds.add(id);
    }
    const ccpSlots = slots.filter((s) => ccpSlotIds.has(s.id));
    const totalDuration = ccpSlots.reduce((acc, s) => acc + (s.duration_hours ?? 0), 0);

    return {
      ccp,
      competences: compsOfCcp.map((competence) => ({
        competence,
        criteria: criteriaByCompetence.get(competence.id) ?? [],
        availableContents: contentsByCompetence.get(competence.id) ?? [],
      })),
      slots: ccpSlots,
      total_duration_hours: totalDuration,
    };
  });

  return result;
}

/** Liste les fiches de déroulement existantes pour une facture */
export async function listDeroulementSheetsForInvoice(
  invoiceId: string,
): Promise<DeroulementSheetRow[]> {
  return db.query<DeroulementSheetRow>(
    `SELECT * FROM pedagogical_sheets
     WHERE kind = 'deroulement' AND linked_invoice_id = ?
     ORDER BY created_at ASC`,
    [invoiceId],
  );
}

export async function getDeroulementSheet(
  sheetId: string,
): Promise<DeroulementSheetRow | null> {
  const rows = await db.query<DeroulementSheetRow>(
    `SELECT * FROM pedagogical_sheets WHERE id = ? AND kind = 'deroulement'`,
    [sheetId],
  );
  return rows[0] ?? null;
}

export async function upsertDeroulementSheet(row: {
  id?: string;
  invoice_id: string;
  centre_id: string;
  formation_id: string;
  ccp_id: string;
  title: string;
  redacteur: string;
  dates_label: string;
  total_duration_hours: number;
  general_objective: string;
  phases_json: string;
  selected_exercise_ids_json: string;
  file_path_docx: string | null;
}): Promise<string> {
  const now = new Date().toISOString().replace("T", " ").substring(0, 19);
  if (row.id) {
    await db.execute(
      `UPDATE pedagogical_sheets
       SET title = ?, general_objective = ?, phases = ?,
           centre_id = ?, ccp_id = ?, redacteur = ?, dates_label = ?,
           total_duration_hours = ?, selected_exercise_ids = ?, file_path_docx = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        row.title,
        row.general_objective,
        row.phases_json,
        row.centre_id,
        row.ccp_id,
        row.redacteur,
        row.dates_label,
        row.total_duration_hours,
        row.selected_exercise_ids_json,
        row.file_path_docx,
        now,
        row.id,
      ],
    );
    return row.id;
  }

  const id = db.generateId();
  await db.execute(
    `INSERT INTO pedagogical_sheets
     (id, formation_id, title, general_objective, phases, kind,
      ccp_id, centre_id, linked_invoice_id, redacteur, dates_label,
      total_duration_hours, selected_exercise_ids, file_path_docx,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'deroulement', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      row.formation_id,
      row.title,
      row.general_objective,
      row.phases_json,
      row.ccp_id,
      row.centre_id,
      row.invoice_id,
      row.redacteur,
      row.dates_label,
      row.total_duration_hours,
      row.selected_exercise_ids_json,
      row.file_path_docx,
      now,
      now,
    ],
  );

  // Lier dans invoice_sheets
  await db.execute(
    `INSERT OR IGNORE INTO invoice_sheets (invoice_id, sheet_id) VALUES (?, ?)`,
    [row.invoice_id, id],
  );

  return id;
}

export async function deleteDeroulementSheet(sheetId: string): Promise<void> {
  await db.execute(`DELETE FROM invoice_sheets WHERE sheet_id = ?`, [sheetId]);
  await db.execute(`DELETE FROM pedagogical_sheets WHERE id = ?`, [sheetId]);
}

/** Récupère le contenu markdown complet d'un exercice (pour le prompt IA) */
export async function getContentFullMarkdown(contentId: string): Promise<{
  id: string;
  title: string;
  content_type: string;
  content_markdown: string;
} | null> {
  const rows = await db.query<{
    id: string;
    title: string;
    content_type: string;
    content_markdown: string;
  }>(
    `SELECT id, title, content_type, content_markdown FROM generated_contents WHERE id = ?`,
    [contentId],
  );
  return rows[0] ?? null;
}

export { DEFAULT_REDACTEUR };
