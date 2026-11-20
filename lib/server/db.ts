import { env } from "cloudflare:workers";
import type { Board, Provider } from "../types";

export function getDb(): D1Database | null {
  return (env as unknown as { DB?: D1Database } | undefined)?.DB ?? null;
}

let ready = false;

/** Creates the request tables on first use (no migration step needed). */
export async function ensureSchema(db: D1Database) {
  if (ready) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS job_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        company TEXT NOT NULL,
        url TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        provider TEXT,
        token TEXT,
        jobs INTEGER,
        status TEXT NOT NULL DEFAULT 'pending'
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS custom_boards (
        provider TEXT NOT NULL,
        token TEXT NOT NULL,
        company TEXT NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY (provider, token)
      )`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        rating INTEGER,
        message TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        page TEXT NOT NULL DEFAULT '',
        locale TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'new'
      )`,
    ),
  ]);
  ready = true;
}

/** Boards approved from user requests. Empty if the DB is unavailable. */
export async function customBoards(): Promise<Board[]> {
  const db = getDb();
  if (!db) return [];
  try {
    await ensureSchema(db);
    const { results } = await db.prepare("SELECT provider, token, company FROM custom_boards").all<{ provider: Provider; token: string; company: string }>();
    return results;
  } catch {
    return [];
  }
}
