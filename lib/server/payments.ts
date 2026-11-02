// Pass purchases via Bachs. No accounts: the browser holds a random pass token; we store
// only its SHA-256 hash. A payment counts only after we confirm it with Bachs ourselves
// (webhook or lookup), never because the browser says so.
import { env } from "cloudflare:workers";
import { PASSES, type Currency, type PassId } from "../plans";
import {
  bachsEnv,
  bachsRequest,
  checkoutURL,
  getCharge,
  getCheckout,
  majorAmount,
  minorAmount,
  paymentMode,
  providerId,
  validSignature,
  type BachsCharge,
  type BachsSession,
} from "./bachs";
import { getDb } from "./db";

export interface Order {
  reference: string;
  plan: PassId;
  currency: Currency;
  amount: number;
  status: "initializing" | "pending" | "paid" | "failed" | "reversed";
  mode: string;
  created_at: number;
  checkout_id: string | null;
  checkout_url: string | null;
  checkout_expires: number | null;
  charge_id: string | null;
  token_hash: string;
  paid_at: number | null;
  expires_at: number | null;
  analyses_used: number;
  analyses_limit: number;
}

// Every public address of the site. Checkout returns the buyer to the address they started on,
// because the pass key is saved per address: returning elsewhere would hide a paid pass.
export const SITE_ORIGINS = ["https://carreadi.naijabukana.com", "https://carreadi.sunkanmifafowora.workers.dev"];

let ready = false;
export async function ensurePaymentSchema(db: D1Database) {
  if (ready) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS orders (
        reference TEXT PRIMARY KEY,
        plan TEXT NOT NULL,
        currency TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        checkout_id TEXT,
        checkout_url TEXT,
        checkout_expires INTEGER,
        charge_id TEXT,
        token_hash TEXT NOT NULL,
        paid_at INTEGER,
        expires_at INTEGER,
        analyses_used INTEGER NOT NULL DEFAULT 0,
        analyses_limit INTEGER NOT NULL
      )`,
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS orders_token ON orders(token_hash)"),
    db.prepare("CREATE TABLE IF NOT EXISTS payment_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at INTEGER NOT NULL)"),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS support_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, email TEXT NOT NULL, email_hash TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open')",
    ),
  ]);
  // Added after launch: older databases get the column here. "duplicate column" means it exists.
  try {
    await db.prepare("ALTER TABLE orders ADD COLUMN email_hash TEXT").run();
  } catch {}
  await db.prepare("CREATE INDEX IF NOT EXISTS orders_email ON orders(email_hash)").run();
  ready = true;
}

/**
 * Salted fingerprint of an email, so a lost pass can be found from the address the buyer
 * gave us without storing the address on the order.
 */
export async function hashEmail(email: string) {
  const salt = (env as unknown as { QUOTA_SALT?: string } | undefined)?.QUOTA_SALT ?? "carreadi";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`carreadi-email:${salt}:${email.trim().toLowerCase()}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`carreadi-pass:${token}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const validToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(t);
const validReference = (r: unknown): r is string => typeof r === "string" && /^carreadi-[0-9a-f-]{36}$/.test(r);

async function db() {
  const d = getDb();
  if (!d) throw Error("no_db");
  await ensurePaymentSchema(d);
  return d;
}

const byReference = async (reference: string) => (await db()).prepare("SELECT * FROM orders WHERE reference = ?").bind(reference).first<Order>();

/**
 * The address to send the buyer back to after paying: the one they started on, and only if it
 * is one of ours (never trust the Host header blindly). Bachs also refuses local addresses.
 */
export function publicOrigin(req: Request) {
  const here = new URL(req.url).origin;
  return SITE_ORIGINS.includes(here) ? here : null;
}

export type CheckoutResult = { url: string; reference: string; token: string } | { error: string; status: number };

export async function createCheckout(req: Request, plan: PassId, currency: Currency, email?: string): Promise<CheckoutResult> {
  const mode = paymentMode();
  if (mode === "disabled") return { error: "Payments open very soon. Nothing was charged.", status: 503 };
  const origin = publicOrigin(req);
  if (!origin) return { error: "Checkout only works on the live site. Nothing was charged.", status: 503 };
  const pass = PASSES[plan];
  const amount = pass.price[currency];
  const reference = `carreadi-${crypto.randomUUID()}`;
  const token = newToken();
  const d = await db();
  await d
    .prepare(
      "INSERT INTO orders (reference, plan, currency, amount, status, mode, created_at, token_hash, analyses_limit, email_hash) VALUES (?, ?, ?, ?, 'initializing', ?, ?, ?, ?, ?)",
    )
    .bind(reference, plan, currency, amount, mode, Date.now(), await hashToken(token), pass.analyses, email ? await hashEmail(email) : null)
    .run();

  try {
    const session = await bachsRequest<BachsSession>("/v1/checkout-sessions", {
      method: "POST",
      headers: { "Idempotency-Key": reference },
      body: JSON.stringify({
        pricing: { currency, amount: majorAmount(amount), price_type: "fixed" },
        billing_currency: currency,
        // No `customer` on purpose: then Bachs's own page asks for the buyer's email and name
        // (sending one makes Bachs skip that step). `always` saves them to your Bachs customer list.
        customer_creation: "always",
        reference,
        metadata: { order_id: reference, sku: plan },
        success_url: `${origin}/pass?reference=${reference}`,
        cancel_url: `${origin}/plans?cancelled=1`,
        expires_in_minutes: 60,
      }),
    });
    const url = checkoutURL(session.checkout_url, mode === "test");
    const expires = Date.parse(session.expires_at ?? "");
    if (!providerId(session.checkout_id) || !url || !Number.isFinite(expires) || (session.reference != null && session.reference !== reference))
      throw Error("checkout_response");
    await d
      .prepare("UPDATE orders SET status = 'pending', checkout_id = ?, checkout_url = ?, checkout_expires = ? WHERE reference = ? AND status = 'initializing'")
      .bind(session.checkout_id, url, expires, reference)
      .run();
    return { url, reference, token };
  } catch (e) {
    console.error("bachs_checkout_failed", reference, String((e as Error)?.message ?? e).slice(0, 120));
    await d.prepare("UPDATE orders SET status = 'failed' WHERE reference = ? AND status = 'initializing'").bind(reference).run();
    return { error: "We couldn't open the payment page. Nothing was charged. Please try again.", status: 502 };
  }
}

/** Marks an order paid only if Bachs's own data matches what we sold (amount, currency, order). */
async function settle(o: Order, c: { status?: string; currency?: string; amount?: string; checkout_id?: string | null; charge_id?: string | null }) {
  if (o.status === "reversed" || o.mode !== paymentMode()) return false;
  if (!["succeeded", "partially_refunded"].includes(c.status ?? "")) return false;
  if (c.currency !== o.currency || minorAmount(c.amount) !== o.amount) return false;
  if (o.checkout_id && c.checkout_id && c.checkout_id !== o.checkout_id) return false;
  if (o.charge_id && c.charge_id && c.charge_id !== o.charge_id) return false;
  const now = Date.now();
  await (await db())
    .prepare(
      `UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, ?), expires_at = COALESCE(expires_at, ?),
         charge_id = COALESCE(charge_id, ?) WHERE reference = ? AND status != 'reversed'`,
    )
    .bind(now, now + PASSES[o.plan].days * 864e5, c.charge_id ?? null, o.reference)
    .run();
  return (await byReference(o.reference))?.status === "paid";
}

async function reverse(o: Order) {
  await (await db()).prepare("UPDATE orders SET status = 'reversed' WHERE reference = ?").bind(o.reference).run();
}

const fullRefund = (s?: string) => s === "refunded" || s === "auto_refunded";

/** Asks Bachs for the truth about an order and records it. */
export async function reconcile(o: Order): Promise<Order["status"]> {
  if (o.status === "paid" || o.status === "reversed" || !o.checkout_id || o.mode !== paymentMode()) return o.status;
  const s = await getCheckout(o.checkout_id);
  if (s.checkout_id !== o.checkout_id || s.reference !== o.reference || s.metadata?.order_id !== o.reference || s.currency !== o.currency || minorAmount(s.amount) !== o.amount)
    return o.status;
  const c = s.charge;
  if (c && (!c.checkout_id || c.checkout_id === o.checkout_id) && (!c.reference || c.reference === o.reference)) {
    if (fullRefund(c.status)) {
      await reverse(o);
      return "reversed";
    }
    // amount is what was asked; amount_paid is what arrived, when given.
    if ((c.amount_paid == null || minorAmount(c.amount_paid) === o.amount) && (await settle(o, { ...c, checkout_id: s.checkout_id, charge_id: c.charge_id ?? null })))
      return "paid";
  }
  if ((s.status === "expired" || s.status === "cancelled") && !["succeeded", "accepted", "partially_refunded"].includes(c?.status ?? "")) {
    await (await db()).prepare("UPDATE orders SET status = 'failed' WHERE reference = ? AND status = 'pending'").bind(o.reference).run();
    return "failed";
  }
  return o.status;
}

async function orderForCharge(c: BachsCharge) {
  if (!providerId(c.charge_id) || c.organization_id !== bachsEnv().BACHS_ORGANIZATION_ID) return null;
  const o = validReference(c.metadata?.order_id) ? await byReference(c.metadata!.order_id!) : null;
  if (!o || c.metadata?.sku !== o.plan || c.currency !== o.currency || minorAmount(c.amount) !== o.amount) return null;
  if (o.charge_id && o.charge_id !== c.charge_id) return null;
  return o;
}

/** Bachs webhook: signature, organisation and replay checks, then re-fetch the charge from Bachs. */
export async function handleWebhook(req: Request): Promise<Response> {
  const e = bachsEnv();
  if (paymentMode(e) === "disabled") return Response.json({ error: "not_configured" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 65_536) return Response.json({ error: "too_large" }, { status: 413 });
  if (!(await validSignature(req.headers, raw, e.BACHS_WEBHOOK_SECRET))) return Response.json({ error: "signature" }, { status: 401 });
  let event: { id?: string; type?: string; organization_id?: string; data?: { charge_id?: string; checkout_id?: string; reference?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!providerId(event.id) || typeof event.type !== "string" || event.type.length > 100) return Response.json({ error: "invalid_event" }, { status: 400 });
  if (event.organization_id !== e.BACHS_ORGANIZATION_ID) return Response.json({ error: "organization" }, { status: 403 });
  const d = await db();
  const id = `bachs:${paymentMode(e)}:${event.id}`;
  if (await d.prepare("SELECT id FROM payment_events WHERE id = ?").bind(id).first()) return Response.json({ ok: true });

  if ((event.type === "collection.succeeded" || event.type === "refund.paid") && providerId(event.data?.charge_id)) {
    // Never trust the event body for money: fetch the charge from Bachs.
    const charge = await getCharge(event.data!.charge_id!);
    const o = await orderForCharge(charge);
    if (o) {
      if (fullRefund(charge.status)) await reverse(o);
      else if (event.type === "collection.succeeded") await settle(o, { ...charge, charge_id: charge.charge_id });
    }
  }
  // Checkout finished or expired: look the session up with Bachs and record its real outcome.
  // An expired checkout becomes "failed", so an abandoned order never stays pending forever.
  if (event.type === "checkout.completed" || event.type === "checkout.expired") {
    const ref = validReference(event.data?.reference) ? event.data!.reference! : null;
    const byCheckout = providerId(event.data?.checkout_id)
      ? await d.prepare("SELECT * FROM orders WHERE checkout_id = ?").bind(event.data!.checkout_id).first<Order>()
      : null;
    const o = byCheckout ?? (ref ? await byReference(ref) : null);
    if (o) await reconcile(o);
  }
  // Effects are idempotent, so recording the event last is safe if we crash before this line.
  await d.prepare("INSERT OR IGNORE INTO payment_events (id, type, created_at) VALUES (?, ?, ?)").bind(id, event.type, Date.now()).run();
  return Response.json({ ok: true });
}

export interface PassStatus {
  active: boolean;
  plan?: PassId;
  expiresAt?: number;
  analysesLeft?: number;
  status?: Order["status"];
  reference?: string;
}

/** Active = paid, not expired, and analyses left. A used-up pass must not block buying a new one. */
export function passIsActive(o: Pick<Order, "status" | "expires_at" | "analyses_used" | "analyses_limit">, now = Date.now()) {
  return o.status === "paid" && (o.expires_at ?? 0) > now && o.analyses_used < o.analyses_limit;
}

function statusOf(o: Order | null): PassStatus {
  if (!o) return { active: false };
  const active = passIsActive(o);
  return {
    active,
    plan: o.plan,
    status: o.status,
    reference: o.reference,
    expiresAt: o.expires_at ?? undefined,
    analysesLeft: active ? Math.max(0, o.analyses_limit - o.analyses_used) : undefined,
  };
}

/** Pass state for a browser's token. Checks pending orders with Bachs first (after checkout). */
export async function passStatus(token: unknown, check = false): Promise<PassStatus> {
  if (!validToken(token)) return { active: false };
  const d = await db();
  let o = await d.prepare("SELECT * FROM orders WHERE token_hash = ? ORDER BY created_at DESC LIMIT 1").bind(await hashToken(token)).first<Order>();
  // Pending orders are always checked with Bachs (not only on the return page): a buyer who paid
  // and closed the tab must still get their pass even if the webhook is slow. `check` is kept for callers.
  void check;
  if (o && o.status === "pending" && Date.now() - o.created_at > 5_000) {
    try {
      await reconcile(o);
      o = await byReference(o.reference);
    } catch {}
  }
  return statusOf(o);
}

/** Uses one analysis from an active pass. Returns analyses left, or null if none. */
export async function consumePass(token: unknown): Promise<number | null> {
  if (!validToken(token)) return null;
  const row = await (await db())
    .prepare(
      `UPDATE orders SET analyses_used = analyses_used + 1
       WHERE token_hash = ? AND status = 'paid' AND expires_at > ? AND analyses_used < analyses_limit
       RETURNING analyses_limit - analyses_used AS left`,
    )
    .bind(await hashToken(token), Date.now())
    .first<{ left: number }>();
  return row ? row.left : null;
}

export async function refundPassUse(token: string) {
  await (await db()).prepare("UPDATE orders SET analyses_used = analyses_used - 1 WHERE token_hash = ? AND analyses_used > 0").bind(await hashToken(token)).run();
}

/** Paid passes bought with this email (admin recovery only). */
export async function passesForEmail(email: string) {
  const { results } = await (await db())
    .prepare("SELECT reference, plan, status, expires_at, analyses_used, analyses_limit FROM orders WHERE email_hash = ? AND status IN ('paid', 'pending') ORDER BY created_at DESC LIMIT 5")
    .bind(await hashEmail(email))
    .all<Pick<Order, "reference" | "plan" | "status" | "expires_at" | "analyses_used" | "analyses_limit">>();
  return results;
}

/** Someone lost their pass: store their contact details for the admin to follow up. */
export async function createSupportRequest(email: string, note: string) {
  const d = await db();
  await d.prepare("DELETE FROM support_requests WHERE created_at < ?").bind(Date.now() - 60 * 864e5).run();
  await d.prepare("INSERT INTO support_requests (created_at, email, email_hash, note) VALUES (?, ?, ?, ?)").bind(Date.now(), email, await hashEmail(email), note).run();
}

export async function supportRequests() {
  const { results } = await (await db())
    .prepare("SELECT id, created_at, email, note, status FROM support_requests ORDER BY status = 'open' DESC, id DESC LIMIT 100")
    .all<{ id: number; created_at: number; email: string; note: string; status: string }>();
  return Promise.all(results.map(async (r) => ({ ...r, passes: await passesForEmail(r.email) })));
}

export async function resolveSupport(id: number) {
  await (await db()).prepare("UPDATE support_requests SET status = 'resolved' WHERE id = ?").bind(id).run();
}

/**
 * Moves a paid pass to this browser using its receipt reference. Issues a new token, which
 * signs out the old device, so a pass can't be shared around.
 */
export async function restorePass(reference: unknown): Promise<{ token: string; status: PassStatus } | null> {
  if (!validReference(reference)) return null;
  let o = await byReference(reference);
  if (!o) return null;
  if (o.status === "pending") {
    try {
      await reconcile(o);
      o = await byReference(reference);
    } catch {}
  }
  if (!o || o.status !== "paid" || (o.expires_at ?? 0) <= Date.now()) return null;
  const token = newToken();
  await (await db()).prepare("UPDATE orders SET token_hash = ? WHERE reference = ?").bind(await hashToken(token), reference).run();
  return { token, status: statusOf({ ...o, token_hash: "" }) };
}

/** The reference of a pass this browser's token paid for (active or ended), for linking an email. */
export async function paidReferenceForToken(token: unknown): Promise<string | null> {
  if (!validToken(token)) return null;
  const row = await (await db())
    .prepare("SELECT reference FROM orders WHERE token_hash = ? AND status = 'paid' ORDER BY created_at DESC LIMIT 1")
    .bind(await hashToken(token))
    .first<{ reference: string }>();
  return row?.reference ?? null;
}

/** Whether any paid pass was bought with this email (by its fingerprint). */
export async function emailHasPaid(emailHash: string) {
  return !!(await (await db()).prepare("SELECT 1 FROM orders WHERE email_hash = ? AND status = 'paid' LIMIT 1").bind(emailHash).first());
}

/** Links an email fingerprint to a paid pass that has none yet, so the email can sign in later. */
export async function linkEmailToOrder(reference: string, emailHash: string) {
  await (await db()).prepare("UPDATE orders SET email_hash = ? WHERE reference = ? AND email_hash IS NULL").bind(emailHash, reference).run();
}
