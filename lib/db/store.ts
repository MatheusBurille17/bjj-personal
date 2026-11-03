import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Database } from "./schema";
import { emptyDatabase } from "./schema";
import { createDemoDatabase } from "./seed";

/**
 * Armazenamento local do MVP.
 *
 * O ambiente de demonstração roda sem credenciais externas: os dados são
 * persistidos em `.data/db.json` (ou em memória durante os testes). Em
 * produção, o schema equivalente está em `supabase/migrations` e os clientes
 * Supabase ficam em `lib/supabase`.
 */
const MEMORY_MODE =
  process.env.BJJ_STORE === "memory" || process.env.NODE_ENV === "test";

const DB_FILE =
  process.env.BJJ_DB_FILE ?? path.join(process.cwd(), ".data", "db.json");

let cache: Database | null = null;

function readFromDisk(): Database | null {
  try {
    if (!fs.existsSync(DB_FILE)) return null;
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Database>;
    return { ...emptyDatabase(), ...parsed };
  } catch {
    return null;
  }
}

function writeToDisk(db: Database): void {
  if (MEMORY_MODE) return;
  const directory = path.dirname(DB_FILE);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${DB_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(temporary, DB_FILE);
}

/** Retorna a base atual, criando a demonstração no primeiro acesso. */
export function getDb(): Database {
  if (cache) return cache;

  if (MEMORY_MODE) {
    cache = createDemoDatabase();
    return cache;
  }

  const fromDisk = readFromDisk();
  if (fromDisk) {
    cache = fromDisk;
    return cache;
  }

  cache = createDemoDatabase();
  writeToDisk(cache);
  return cache;
}

/** Executa uma mutação e persiste o resultado. */
export function mutate<T>(operation: (db: Database) => T): T {
  const db = getDb();
  const result = operation(db);
  writeToDisk(db);
  return result;
}

/** Substitui toda a base (usado em testes e scripts). */
export function resetDb(next: Database = emptyDatabase()): Database {
  cache = next;
  writeToDisk(cache);
  return cache;
}

/** Restaura a base de demonstração. */
export function resetDemoDb(): Database {
  return resetDb(createDemoDatabase());
}

/** Indica se o armazenamento está em memória. */
export function isMemoryStore(): boolean {
  return MEMORY_MODE;
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
