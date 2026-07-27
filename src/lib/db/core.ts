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

export type Row = Record<string, unknown>;

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = await getDb();
  return d.select<T[]>(sql, params);
}

let _writeQueue: Promise<void> = Promise.resolve();

export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  const op = _writeQueue.then(() => getDb().then(d => d.execute(sql, params)));
  _writeQueue = op.then(() => {}, () => {});
  await op;
}

export function generateId(): string {
  return uuidv4();
}

export function now(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

/**
 * Les migrations sont appliquées automatiquement par tauri-plugin-sql au chargement.
 * Cette fonction force simplement l'initialisation de la connexion BDD.
 */
export async function runMigrations(): Promise<void> {
  // Déclenche le chargement de la BDD (et donc l'application automatique des migrations)
  await getDb();
}
