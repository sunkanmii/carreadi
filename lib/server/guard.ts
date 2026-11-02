import { env } from "cloudflare:workers";
import { FREE_LIMIT, FREE_WEEKLY_LIMIT } from "../plans";

export const FREE_ANALYSES_PER_DAY = FREE_LIMIT;
export { FREE_WEEKLY_LIMIT };

interface Bindings {
  DB?: D1Database;
  API_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
  QUOTA_SALT?: string;
}
const bindings = env as unknown as Bindings;

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Reads a JSON body with a hard size cap. Doesn't trust Content-Length (it can be omitted):
 * stops reading once the limit is passed. Returns a Response on failure.
 */
export async function readJson(req: Request, maxBytes: number): Promise<{ body: unknown } | Response> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return json({ error: "Request too large." }, 413);
  const reader = req.body?.getReader();
  if (!reader) return json({ error: "Invalid JSON." }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return json({ error: "Request too large." }, 413);
    }
    chunks.push(value);
  }
  try {
    const buf = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) (buf.set(c, o), (o += c.byteLength));
    return { body: JSON.parse(new TextDecoder().decode(buf)) };
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
}

export function clientIp(req: Request) {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

// Fallback for when the binding is unavailable (e.g. some local setups): per-isolate window.
const memory = new Map<string, { at: number; n: number }>();
function memoryLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const e = memory.get(key);
  if (!e || now - e.at > windowMs) {
    memory.set(key, { at: now, n: 1 });
    return true;
  }
  e.n++;
  return e.n <= limit;
}

/** Burst limit for every API route. Returns a 429 response when exceeded. */
export async function rateLimit(req: Request): Promise<Response | null> {
  const key = clientIp(req);
  let ok = true;
  try {
    ok = bindings.API_LIMITER ? (await bindings.API_LIMITER.limit({ key })).success : memoryLimit(key, 30, 60_000);
  } catch {
    ok = memoryLimit(key, 30, 60_000);
  }
  return ok ? null : json({ error: "Too many requests. Please wait a minute." }, 429);
}

async function hashKey(ip: string, day: string) {
  const salt = bindings.QUOTA_SALT ?? "carreadi";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${day}:${ip}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let tableReady = false;

/**
 * Simple per-visitor daily cap for cheap actions (e.g. job requests). Same salted-hash
 * counter table as the analysis quota. Returns true if the action is allowed.
 */
export async function dailyLimit(req: Request, scope: string, max: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const k = await hashKey(clientIp(req), `${scope}:${day}`);
  const db = bindings.DB;
  try {
    if (!db) throw new Error("no DB");
    await db.exec("CREATE TABLE IF NOT EXISTS usage (k TEXT PRIMARY KEY, day TEXT NOT NULL, n INTEGER NOT NULL)");
    const row = await db
      .prepare("INSERT INTO usage (k, day, n) VALUES (?, ?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n")
      .bind(k, day)
      .first<{ n: number }>();
    return (row?.n ?? 1) <= max;
  } catch {
    return memoryLimit(`d:${k}`, max, 864e5);
  }
}

/**
 * Admin check for the request-review API: `Authorization: Bearer <ADMIN_TOKEN>`.
 * Compares SHA-256 digests in constant time. With no ADMIN_TOKEN set, admin is switched off.
 */
export async function requireAdmin(req: Request): Promise<Response | null> {
  const expected = (bindings as Bindings & { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  if (!expected || expected.length < 16) return json({ error: "Admin is not set up. Add an ADMIN_TOKEN secret (16+ characters)." }, 503);
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 ? null : json({ error: "Not authorized." }, 401);
}

/** Monday (UTC) of the current week, as YYYY-MM-DD. */
export function weekStart(d = new Date()) {
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return monday.toISOString().slice(0, 10);
}

export interface Quota {
  ok: boolean;
  /** Which limit blocked the request, when ok is false. */
  limit: "day" | "week" | null;
  remaining: number;
  refund: () => Promise<void>;
}

/** Re-runs of the same résumé against the same job, per week, that don't count again. */
export const FREE_RERUNS = 5;

/**
 * Counts one AI analysis against the free daily and weekly quotas. Stores only salted hashes
 * of the IP + period and counters — never résumé content. Rows older than 8 days are pruned.
 *
 * `same` identifies what is being analysed (résumé + job). Running the same thing again in the
 * same week is free: a phone that drops the request when the user switches apps mid-analysis
 * would otherwise lose the result and the free check. Only its hash is stored.
 */
export async function consumeQuota(req: Request, same = ""): Promise<Quota> {
  const ip = clientIp(req);
  const day = new Date().toISOString().slice(0, 10);
  const week = weekStart();
  const kDay = await hashKey(ip, day);
  const kWeek = await hashKey(ip, `week:${week}`);
  const kRun = await hashKey(ip, `run:${week}:${same}`);
  const db = bindings.DB;
  // Gives the analysis back when the AI fails or a limit blocks it, so users aren't charged for nothing.
  const refund = async () => {
    try {
      if (db) await db.prepare("UPDATE usage SET n = n - 1 WHERE k IN (?, ?, ?) AND n > 0").bind(kDay, kWeek, kRun).run();
      for (const k of [kDay, kWeek, kRun]) {
        const m = memory.get(`q:${k}`);
        if (m && m.n > 0) m.n--;
      }
    } catch {}
  };
  const result = (nDay: number, nWeek: number): Quota => {
    const limit = nDay > FREE_ANALYSES_PER_DAY ? "day" : nWeek > FREE_WEEKLY_LIMIT ? "week" : null;
    return {
      ok: !limit,
      limit,
      remaining: Math.max(0, Math.min(FREE_ANALYSES_PER_DAY - nDay, FREE_WEEKLY_LIMIT - nWeek)),
      refund,
    };
  };
  try {
    if (!db) throw new Error("no DB");
    if (!tableReady) {
      await db.exec("CREATE TABLE IF NOT EXISTS usage (k TEXT PRIMARY KEY, day TEXT NOT NULL, n INTEGER NOT NULL)");
      await db.prepare("DELETE FROM usage WHERE day < ?").bind(new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10)).run();
      tableReady = true;
    }
    const upsert = "INSERT INTO usage (k, day, n) VALUES (?, ?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1 RETURNING n";
    // Already counted this week for the same résumé and job: run it again without charging.
    const run = await db.prepare("SELECT n FROM usage WHERE k = ?").bind(kRun).first<{ n: number }>();
    if (same && run && run.n > 0 && run.n <= FREE_RERUNS) {
      await db.prepare(upsert).bind(kRun, day).run();
      const rerunRefund = async () => {
        try {
          await db.prepare("UPDATE usage SET n = n - 1 WHERE k = ? AND n > 0").bind(kRun).run();
        } catch {}
      };
      return { ok: true, limit: null, remaining: 0, refund: rerunRefund };
    }
    const [d, w] = await db.batch<{ n: number }>([db.prepare(upsert).bind(kDay, day), db.prepare(upsert).bind(kWeek, week), db.prepare(upsert).bind(kRun, day)]);
    const q = result(d.results[0]?.n ?? 1, w.results[0]?.n ?? 1);
    if (!q.ok) await refund(); // a blocked attempt shouldn't eat into the other limit
    return q;
  } catch {
    const run = memory.get(`q:${kRun}`);
    if (same && run && run.n > 0 && run.n <= FREE_RERUNS && Date.now() - run.at < 7 * 864e5) {
      run.n++;
      return { ok: true, limit: null, remaining: 0, refund: async () => void (run.n > 0 && run.n--) };
    }
    memoryLimit(`q:${kDay}`, FREE_ANALYSES_PER_DAY, 864e5);
    memoryLimit(`q:${kWeek}`, FREE_WEEKLY_LIMIT, 7 * 864e5);
    memoryLimit(`q:${kRun}`, Infinity, 7 * 864e5);
    const q = result(memory.get(`q:${kDay}`)?.n ?? 1, memory.get(`q:${kWeek}`)?.n ?? 1);
    if (!q.ok) await refund();
    return q;
  }
}
