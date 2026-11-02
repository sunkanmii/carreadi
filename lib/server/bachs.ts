// Bachs (bachs.io) payments client. Ported from Naija Bukana's tested integration.
// The mode comes from the key itself: sk_sandbox_… can only ever reach the sandbox,
// sk_live_… only live. Missing or mismatched settings switch payments off.
import { env } from "cloudflare:workers";

export interface BachsEnv {
  BACHS_API_KEY?: string;
  BACHS_WEBHOOK_SECRET?: string;
  BACHS_ORGANIZATION_ID?: string;
}

export function bachsEnv(): BachsEnv {
  return (env as unknown as BachsEnv | undefined) ?? {};
}

export type PaymentMode = "test" | "live" | "disabled";

export function paymentMode(e: BachsEnv = bachsEnv()): PaymentMode {
  const key = e.BACHS_API_KEY ?? "";
  if (!e.BACHS_WEBHOOK_SECRET || !/^[a-zA-Z0-9_-]{1,100}$/.test(e.BACHS_ORGANIZATION_ID ?? "")) return "disabled";
  if (key.startsWith("sk_sandbox_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return "disabled";
}

export const providerId = (v: unknown) => (typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v) ? v : null);

/** "2000.00" → 200000 (minor units). Rejects anything that isn't a plain decimal. */
export function minorAmount(v: unknown): number | null {
  if (typeof v !== "string" || !/^\d{1,13}(?:\.\d{1,2})?$/.test(v)) return null;
  const [whole, fraction = ""] = v.split(".");
  const n = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
}

/** 200000 → "2000.00" */
export function majorAmount(v: number) {
  if (!Number.isSafeInteger(v) || v < 0) throw Error("invalid_amount");
  return `${Math.floor(v / 100)}.${String(v % 100).padStart(2, "0")}`;
}

/** Only accept checkout links on Bachs's own checkout host for the current mode. */
export function checkoutURL(v: unknown, sandbox: boolean) {
  try {
    const u = new URL(String(v));
    return u.origin === (sandbox ? "https://sandbox-checkout.bachs.io" : "https://checkout.bachs.io") && !u.username && !u.password && u.pathname.startsWith("/c/")
      ? u.href
      : null;
  } catch {
    return null;
  }
}

/** Authenticated Bachs API call with a hard 10s deadline, no redirects and a 64 KB response cap. */
export async function bachsRequest<T = Record<string, unknown>>(path: string, init: RequestInit = {}, e: BachsEnv = bachsEnv()): Promise<T> {
  const mode = paymentMode(e);
  if (mode === "disabled") throw Error("payments_disabled");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const r = await fetch((mode === "test" ? "https://sandbox-api.bachs.io" : "https://api.bachs.io") + path, {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${e.BACHS_API_KEY}`, "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (r.status >= 300 && r.status < 400) throw Error(`provider_redirect:${r.status}`);
    const text = await r.text();
    if (text.length > 65_536) throw Error("provider_size");
    if (!r.ok) {
      // Keep Bachs's status and error code (never the key or body) so failures can be diagnosed.
      let code = "";
      try {
        code = String((JSON.parse(text) as { error_code?: string }).error_code ?? "").replace(/[^A-Z_]/g, "").slice(0, 40);
      } catch {}
      throw Error(`provider_unavailable:${r.status}${code ? ":" + code : ""}`);
    }
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface BachsCharge {
  charge_id?: string;
  payment_id?: string;
  organization_id?: string;
  checkout_id?: string;
  reference?: string;
  metadata?: { order_id?: string; sku?: string };
  currency?: string;
  amount?: string;
  amount_paid?: string | null;
  status?: string;
}
export interface BachsSession {
  checkout_id?: string;
  checkout_url?: string;
  expires_at?: string;
  reference?: string;
  status?: string;
  currency?: string;
  amount?: string;
  metadata?: { order_id?: string; sku?: string };
  charge?: BachsCharge | null;
}

export const getCheckout = (id: string) => {
  if (!providerId(id)) throw Error("checkout_id");
  return bachsRequest<BachsSession>(`/v1/checkout-sessions/${id}`);
};
export const getCharge = (id: string) => {
  if (!providerId(id)) throw Error("charge_id");
  return bachsRequest<BachsCharge>(`/v1/payments/charges/${id}`);
};

/**
 * Verifies a Bachs webhook: HMAC-SHA256 over `${timestamp}.${rawBody}`, timestamp within 5 minutes.
 * Supports the V2 header (`t=…,v1=…`) and the legacy timestamp/signature pair.
 */
export async function validSignature(headers: Headers, raw: string, secret: string | undefined, now = Date.now()) {
  if (!secret) return false;
  let timestamp: string | null = null;
  let signatures: (string | null)[] = [];
  const v2 = headers.get("X-Bachs-Signature-V2");
  if (v2 !== null) {
    if (v2.length > 1024) return false;
    const parts = v2.split(",").map((p) => p.trim().split("="));
    if (parts.some((p) => p.length !== 2) || parts.filter((p) => p[0] === "t").length !== 1) return false;
    timestamp = parts.find((p) => p[0] === "t")![1];
    signatures = parts.filter((p) => p[0] === "v1").map((p) => p[1]);
  } else {
    timestamp = headers.get("X-Bachs-Timestamp");
    signatures = [headers.get("X-Bachs-Signature")];
  }
  if (!/^\d{10}$/.test(timestamp ?? "") || Math.abs(now / 1000 - Number(timestamp)) > 300 || !signatures.length || signatures.length > 4) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const message = new TextEncoder().encode(`${timestamp}.${raw}`);
  for (const s of signatures) {
    if (!/^[a-fA-F0-9]{64}$/.test(s ?? "")) continue;
    const bytes = Uint8Array.from(s!.match(/../g)!, (h) => parseInt(h, 16));
    if (await crypto.subtle.verify("HMAC", key, bytes, message)) return true;
  }
  return false;
}
