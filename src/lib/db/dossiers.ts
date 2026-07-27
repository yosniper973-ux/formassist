import { query, execute, generateId, now } from "./core";
import type { Row } from "./core";

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

export async function saveDossierCorrection(data: {
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

export async function getDossierCorrections(formationId?: string, centreId?: string): Promise<Row[]> {
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

export async function getDossierCorrection(id: string): Promise<Row | null> {
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

export async function markDossierSent(id: string): Promise<void> {
  const n = now();
  await execute(
    "UPDATE dossier_corrections SET sent_at = ?, updated_at = ? WHERE id = ?",
    [n, n, id],
  );
}

export async function deleteDossierCorrection(id: string): Promise<void> {
  await execute("DELETE FROM dossier_corrections WHERE id = ?", [id]);
}
