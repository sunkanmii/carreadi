import { getDb } from "./db";

// Site-wide counters only (no personal data): e.g. how many CVs have been checked.
let ready = false;
async function db() {
  const d = getDb();
  if (!d) return null;
  if (!ready) {
    await d.prepare("CREATE TABLE IF NOT EXISTS site_stats (key TEXT PRIMARY KEY, n INTEGER NOT NULL)").run();
    ready = true;
  }
  return d;
}

export async function bumpStat(key: string) {
  try {
    await (await db())?.prepare("INSERT INTO site_stats (key, n) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1").bind(key).run();
  } catch {
    // A counter must never break an analysis.
  }
}

export async function getStat(key: string) {
  try {
    return (await (await db())?.prepare("SELECT n FROM site_stats WHERE key = ?").bind(key).first<{ n: number }>())?.n ?? 0;
  } catch {
    return 0;
  }
}
