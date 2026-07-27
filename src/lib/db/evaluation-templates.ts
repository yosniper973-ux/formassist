import { query, execute, generateId, now } from "./core";
import type { Row } from "./core";

export async function getEvaluationTemplates(centreId: string): Promise<Row[]> {
  return query(
    "SELECT * FROM evaluation_templates WHERE centre_id = ? ORDER BY created_at DESC",
    [centreId],
  );
}

export async function createEvaluationTemplate(data: {
  centre_id: string;
  name: string;
  original_filename: string;
  file_path: string;
}): Promise<string> {
  const id = generateId();
  await execute(
    `INSERT INTO evaluation_templates (id, centre_id, name, original_filename, file_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.centre_id, data.name, data.original_filename, data.file_path, now()],
  );
  return id;
}

export async function deleteEvaluationTemplate(id: string): Promise<void> {
  await execute("DELETE FROM evaluation_templates WHERE id = ?", [id]);
}
