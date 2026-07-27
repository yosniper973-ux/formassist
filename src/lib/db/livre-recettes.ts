import { query, execute, generateId, now } from "./core";

export interface LivreRecetteRow {
  id: string;
  year: number;
  numero: number;
  date_encaissement: string;
  numero_facture: string;
  client: string;
  designation: string;
  montant_ttc: number;
  mode_reglement: string;
  invoice_id: string | null;
  created_at: string;
}

export async function addLivreRecette(entry: {
  year: number;
  date_encaissement: string;
  numero_facture: string;
  client: string;
  designation: string;
  montant_ttc: number;
  mode_reglement: string;
  invoice_id?: string;
}): Promise<void> {
  const rows = await query<{ max_num: number }>(
    "SELECT COALESCE(MAX(numero), 0) as max_num FROM livre_recettes WHERE year = ?",
    [entry.year],
  );
  const nextNum = (rows[0]?.max_num ?? 0) + 1;
  await execute(
    `INSERT INTO livre_recettes (id, year, numero, date_encaissement, numero_facture, client, designation, montant_ttc, mode_reglement, invoice_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [generateId(), entry.year, nextNum, entry.date_encaissement, entry.numero_facture, entry.client, entry.designation, entry.montant_ttc, entry.mode_reglement, entry.invoice_id ?? null, now()],
  );
}

export async function getLivreRecettes(year: number): Promise<LivreRecetteRow[]> {
  return query<LivreRecetteRow>(
    "SELECT * FROM livre_recettes WHERE year = ? ORDER BY numero ASC",
    [year],
  );
}

export async function getLivreRecettesYears(): Promise<number[]> {
  const rows = await query<{ year: number }>(
    "SELECT DISTINCT year FROM livre_recettes ORDER BY year DESC",
  );
  return rows.map((r) => r.year);
}

export async function deleteLivreRecette(id: string): Promise<void> {
  await execute("DELETE FROM livre_recettes WHERE id = ?", [id]);
}
