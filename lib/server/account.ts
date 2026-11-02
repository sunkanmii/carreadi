// Sign-in for paid users, by emailed one-time link, so their checks are kept on any device.
// No passwords and no plain email addresses are stored: accounts are keyed by the salted email
// fingerprint already used for pass recovery. Saved checks are results only (never a CV),
// encrypted with DATA_KEY. Accounts unused for 12 months are deleted with their checks.
import { env } from "cloudflare:workers";
import { getDb } from "./db";
import { emailHasPaid, hashEmail, linkEmailToOrder, paidReferenceForToken, publicOrigin } from "./payments";

interface AccountEnv {
  RESEND_API_KEY?: string;
  DATA_KEY?: string;
  /** Sender, e.g. "Carreadi <no-reply@carreadi.naijabukana.com>". */
  EMAIL_FROM?: string;
}
const cfg = () => (env as unknown as AccountEnv | undefined) ?? {};

const SITE = "https://carreadi.naijabukana.com";
const DEFAULT_FROM = "Carreadi <no-reply@carreadi.naijabukana.com>";
const LINK_MINUTES = 15;
const SESSION_DAYS = 90;
const KEEP_DAYS = 365;
const MAX_CHECKS = 100;
const MAX_CHECK_BYTES = 200_000;

export const accountsEnabled = () => !!cfg().RESEND_API_KEY && (cfg().DATA_KEY?.length ?? 0) >= 32;

let ready = false;
async function db() {
  const d = getDb();
  if (!d) throw Error("no_db");
  if (!ready) {
    await d.batch([
      d.prepare("CREATE TABLE IF NOT EXISTS accounts (email_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL)"),
      d.prepare(
        "CREATE TABLE IF NOT EXISTS auth_links (token_hash TEXT PRIMARY KEY, email_hash TEXT NOT NULL, order_ref TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER)",
      ),
      d.prepare("CREATE INDEX IF NOT EXISTS auth_links_email ON auth_links(email_hash, created_at)"),
      d.prepare("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, email_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"),
      d.prepare(
        "CREATE TABLE IF NOT EXISTS saved_checks (email_hash TEXT NOT NULL, id_hash TEXT NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (email_hash, id_hash))",
      ),
    ]);
    ready = true;
  }
  return d;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function randomToken() {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const validAuthToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(t);
export const validEmail = (e: unknown): e is string => typeof e === "string" && e.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(e.trim());

// ---- encryption of saved checks (AES-GCM, key from DATA_KEY, bound to the account and check) ----

let keyPromise: Promise<CryptoKey> | null = null;
function dataKey() {
  keyPromise ??= crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(`carreadi-data:${cfg().DATA_KEY}`))
    .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
  return keyPromise;
}

async function seal(plain: string, aad: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }, await dataKey(), new TextEncoder().encode(plain));
  return `${b64(iv)}.${b64(new Uint8Array(ct))}`;
}

async function open(sealed: string, aad: string) {
  const [iv, ct] = sealed.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv), additionalData: new TextEncoder().encode(aad) }, await dataKey(), unb64(ct));
  return new TextDecoder().decode(pt);
}

// ---- sign-in links ----

/**
 * Emails a one-time sign-in link when the address may have an account: it bought a pass, already
 * has an account, or this browser holds a paid pass (then the email gets linked to that pass).
 * The answer is the same either way, so nobody can test which emails are customers.
 */
export async function requestLink(req: Request, email: string, passToken?: string): Promise<"sent" | "busy"> {
  const d = await db();
  const emailHash = await hashEmail(email);
  const now = Date.now();
  const recent = await d.prepare("SELECT COUNT(*) AS n FROM auth_links WHERE email_hash = ? AND created_at > ?").bind(emailHash, now - 3600_000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= 3) return "busy";

  const orderRef = passToken ? await paidReferenceForToken(passToken) : null;
  const known = orderRef || (await emailHasPaid(emailHash)) || (await d.prepare("SELECT 1 FROM accounts WHERE email_hash = ?").bind(emailHash).first());
  if (!known) return "sent";

  const token = randomToken();
  await d
    .prepare("INSERT INTO auth_links (token_hash, email_hash, order_ref, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha(`link:${token}`), emailHash, orderRef, now, now + LINK_MINUTES * 60_000)
    .run();
  const link = `${publicOrigin(req) ?? SITE}/signin?token=${token}`;
  await sendLinkEmail(email.trim(), link);
  return "sent";
}

async function sendLinkEmail(to: string, link: string) {
  const text = `Sign in to Carreadi\n\nTap this link to sign in and see your saved checks on this device:\n${link}\n\nThe link works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for it, ignore this email.\n\nCarreadi · carreadi.naijabukana.com`;
  const html = `<!doctype html><html><body style="margin:0;background:#fbfaf8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#16181d">
<div style="max-width:480px;margin:0 auto;padding:32px 24px">
<p style="font-size:15px;font-weight:700;margin:0 0 24px">carreadi</p>
<h1 style="font-size:22px;margin:0 0 8px">Sign in to Carreadi</h1>
<p style="font-size:15px;line-height:1.5;color:#444;margin:0 0 24px">Tap the button to sign in and see your saved checks on this device.</p>
<a href="${link}" style="display:inline-block;background:#1f5f4a;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:999px">Sign in</a>
<p style="font-size:13px;line-height:1.5;color:#6b6f78;margin:24px 0 0">The link works once and expires in ${LINK_MINUTES} minutes. If you didn&rsquo;t ask for it, ignore this email.</p>
<p style="font-size:12px;color:#6b6f78;margin:32px 0 0">Carreadi · carreadi.naijabukana.com</p>
</div></body></html>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${cfg().RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: cfg().EMAIL_FROM || DEFAULT_FROM, to: [to], subject: "Your Carreadi sign-in link", text, html }),
  });
  if (!res.ok) {
    console.error("resend_failed", res.status);
    throw Error("email_failed");
  }
}

/** Uses a sign-in link once and starts a session. Returns the session token. */
export async function verifyLink(token: string): Promise<string | null> {
  const d = await db();
  const now = Date.now();
  const row = await d
    .prepare("UPDATE auth_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email_hash, order_ref")
    .bind(now, await sha(`link:${token}`), now)
    .first<{ email_hash: string; order_ref: string | null }>();
  if (!row) return null;
  if (row.order_ref) await linkEmailToOrder(row.order_ref, row.email_hash);
  const session = randomToken();
  await d.batch([
    d.prepare("INSERT INTO accounts (email_hash, created_at, last_seen) VALUES (?, ?, ?) ON CONFLICT(email_hash) DO UPDATE SET last_seen = excluded.last_seen").bind(row.email_hash, now, now),
    d.prepare("INSERT INTO sessions (token_hash, email_hash, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(await sha(`session:${session}`), row.email_hash, now, now + SESSION_DAYS * 864e5),
    // Housekeeping: old links and sessions, and accounts (with their checks) unused for a year.
    d.prepare("DELETE FROM auth_links WHERE expires_at < ?").bind(now - 864e5),
    d.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    d.prepare("DELETE FROM saved_checks WHERE email_hash IN (SELECT email_hash FROM accounts WHERE last_seen < ?)").bind(now - KEEP_DAYS * 864e5),
    d.prepare("DELETE FROM accounts WHERE last_seen < ?").bind(now - KEEP_DAYS * 864e5),
  ]);
  return session;
}

/** The account behind a session token (from `Authorization: Bearer …`), or null. */
export async function accountFor(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!validAuthToken(token)) return null;
  const d = await db();
  const row = await d.prepare("SELECT email_hash FROM sessions WHERE token_hash = ? AND expires_at > ?").bind(await sha(`session:${token}`), Date.now()).first<{ email_hash: string }>();
  if (row) await d.prepare("UPDATE accounts SET last_seen = ? WHERE email_hash = ?").bind(Date.now(), row.email_hash).run();
  return row?.email_hash ?? null;
}

export async function signOut(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (validAuthToken(token)) await (await db()).prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha(`session:${token}`)).run();
}

// ---- saved checks ----

export async function listChecks(account: string): Promise<unknown[]> {
  const { results } = await (await db()).prepare("SELECT id_hash, data FROM saved_checks WHERE email_hash = ? ORDER BY updated_at DESC").bind(account).all<{ id_hash: string; data: string }>();
  const out: unknown[] = [];
  for (const r of results) {
    try {
      out.push(JSON.parse(await open(r.data, `${account}:${r.id_hash}`)));
    } catch {}
  }
  return out;
}

export async function saveCheck(account: string, entry: { id: string }): Promise<"ok" | "too_large" | "full"> {
  const plain = JSON.stringify(entry);
  if (plain.length > MAX_CHECK_BYTES) return "too_large";
  const d = await db();
  const idHash = await sha(`check:${entry.id}`);
  const exists = await d.prepare("SELECT 1 FROM saved_checks WHERE email_hash = ? AND id_hash = ?").bind(account, idHash).first();
  if (!exists) {
    const n = await d.prepare("SELECT COUNT(*) AS n FROM saved_checks WHERE email_hash = ?").bind(account).first<{ n: number }>();
    if ((n?.n ?? 0) >= MAX_CHECKS) return "full";
  }
  await d
    .prepare("INSERT INTO saved_checks (email_hash, id_hash, updated_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(email_hash, id_hash) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data")
    .bind(account, idHash, Date.now(), await seal(plain, `${account}:${idHash}`))
    .run();
  return "ok";
}

export async function deleteCheck(account: string, id: string) {
  await (await db()).prepare("DELETE FROM saved_checks WHERE email_hash = ? AND id_hash = ?").bind(account, await sha(`check:${id}`)).run();
}

/** Deletes the account: every saved check and every session. Passes are untouched. */
export async function deleteAccount(account: string) {
  const d = await db();
  await d.batch([
    d.prepare("DELETE FROM saved_checks WHERE email_hash = ?").bind(account),
    d.prepare("DELETE FROM sessions WHERE email_hash = ?").bind(account),
    d.prepare("DELETE FROM accounts WHERE email_hash = ?").bind(account),
  ]);
}
