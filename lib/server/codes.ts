// Discount codes in D1. Every function takes the database, so payments.ts owns the schema.
import { normalizeCode, randomCode, type DiscountCode } from "../codes";
import type { PassId } from "../plans";

export const CODE_SCHEMA = `CREATE TABLE IF NOT EXISTS discount_codes (
  code TEXT PRIMARY KEY,
  percent INTEGER NOT NULL,
  plan TEXT,
  max_uses INTEGER,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
)`;

export const findCode = (d: D1Database, code: string) => d.prepare("SELECT * FROM discount_codes WHERE code = ?").bind(code).first<DiscountCode>();

/**
 * Takes one use of a code, in a single statement so two buyers can't share the last use.
 * False when the code ended or ran out in the meantime.
 */
export async function reserveCode(d: D1Database, code: string, now = Date.now()) {
  const row = await d
    .prepare(
      `UPDATE discount_codes SET used = used + 1
       WHERE code = ? AND active = 1 AND (expires_at IS NULL OR expires_at > ?) AND (max_uses IS NULL OR used < max_uses)
       RETURNING used`,
    )
    .bind(code, now)
    .first<{ used: number }>();
  return !!row;
}

/** Gives a use back when the checkout it was taken for never got paid. */
export async function releaseCode(d: D1Database, code: string) {
  await d.prepare("UPDATE discount_codes SET used = used - 1 WHERE code = ? AND used > 0").bind(code).run();
}

export interface NewCodes {
  percent: number;
  /** How many separate codes to make. */
  count: number;
  /** A code you choose (only when making one); otherwise codes are random. */
  code?: string;
  prefix?: string;
  plan: PassId | null;
  maxUses: number | null;
  expiresAt: number | null;
  note: string;
}

/** Creates codes and returns them. Null when a chosen code already exists. */
export async function createCodes(d: D1Database, n: NewCodes): Promise<string[] | null> {
  const now = Date.now();
  const insert = (code: string) =>
    d
      .prepare("INSERT OR IGNORE INTO discount_codes (code, percent, plan, max_uses, expires_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING code")
      .bind(code, n.percent, n.plan, n.maxUses, n.expiresAt, n.note, now);
  const chosen = normalizeCode(n.code);
  if (chosen) return (await insert(chosen).first()) ? [chosen] : null;
  const prefix = /^[A-Za-z0-9]{2,10}$/.test(n.prefix ?? "") ? n.prefix!.toUpperCase() : "";
  const codes = Array.from({ length: n.count }, () => randomCode(prefix));
  const done = await d.batch<{ code: string }>(codes.map(insert));
  // A random code that already existed (practically never) is simply left out.
  return done.flatMap((r) => r.results.map((x) => x.code));
}

export async function listCodes(d: D1Database) {
  const { results } = await d.prepare("SELECT * FROM discount_codes ORDER BY created_at DESC, code LIMIT 500").all<DiscountCode>();
  return results;
}

export async function setCodeActive(d: D1Database, code: string, active: boolean) {
  await d.prepare("UPDATE discount_codes SET active = ? WHERE code = ?").bind(active ? 1 : 0, code).run();
}
