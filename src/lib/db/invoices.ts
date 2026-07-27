import { query, execute, generateId, now } from "./core";
import type { Row } from "./core";

export async function getInvoices(centreId?: string, status?: string): Promise<Row[]> {
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

export async function createInvoice(data: Record<string, unknown>): Promise<string> {
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
