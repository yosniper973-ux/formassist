import { query, execute, generateId, now } from "./core";
import type { Row } from "./core";

export async function getGroups(formationId: string): Promise<Row[]> {
  return query(
    "SELECT * FROM groups WHERE formation_id = ? AND archived_at IS NULL ORDER BY name",
    [formationId],
  );
}

export async function createGroup(formationId: string, name: string, description?: string): Promise<string> {
  const id = generateId();
  await execute(
    "INSERT INTO groups (id, formation_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, formationId, name, description ?? null, now(), now()],
  );
  return id;
}

export async function updateGroup(id: string, name: string, description?: string): Promise<void> {
  await execute(
    "UPDATE groups SET name = ?, description = ?, updated_at = ? WHERE id = ?",
    [name, description ?? null, now(), id],
  );
}

export async function getLearners(groupId: string): Promise<Row[]> {
  return query(
    "SELECT * FROM learners WHERE group_id = ? AND archived_at IS NULL ORDER BY last_name, first_name",
    [groupId],
  );
}

export async function createLearner(data: Record<string, unknown>): Promise<string> {
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
