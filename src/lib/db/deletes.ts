import { execute, now } from "./core";

export async function deleteCentre(id: string): Promise<void> {
  await execute("DELETE FROM centres WHERE id = ?", [id]);
}

export async function deleteFormation(id: string): Promise<void> {
  await execute("DELETE FROM formations WHERE id = ?", [id]);
}

export async function deleteGroup(id: string): Promise<void> {
  await execute("DELETE FROM groups WHERE id = ?", [id]);
}

export async function deleteLearner(id: string): Promise<void> {
  await execute("DELETE FROM learners WHERE id = ?", [id]);
}

export async function deleteSlot(id: string): Promise<void> {
  await execute("DELETE FROM slots WHERE id = ?", [id]);
}

export async function deleteContent(id: string): Promise<void> {
  await execute("DELETE FROM generated_contents WHERE id = ?", [id]);
}

export async function deleteCorrection(id: string): Promise<void> {
  await execute("DELETE FROM corrections WHERE id = ?", [id]);
}

export async function deleteInvoice(id: string): Promise<void> {
  await execute("DELETE FROM invoices WHERE id = ?", [id]);
}

export async function deletePedagogicalSheet(id: string): Promise<void> {
  await execute("DELETE FROM pedagogical_sheets WHERE id = ?", [id]);
}

export async function deleteEmailTemplate(id: string): Promise<void> {
  await execute("DELETE FROM email_templates WHERE id = ?", [id]);
}

export async function resetStyleProfile(): Promise<void> {
  await execute(
    "UPDATE style_profile SET self_description = NULL, analyzed_profile = NULL, confirmed = 0, sample_files = NULL, updated_at = ? WHERE id = 'main'",
    [now()],
  );
}
