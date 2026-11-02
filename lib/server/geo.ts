import type { Currency } from "../plans";

/** Visitor's country from Cloudflare (two letters, e.g. "NG"), or null when unknown (local dev). */
export function countryOf(req: Request): string | null {
  const cf = (req as Request & { cf?: { country?: string } }).cf;
  const c = cf?.country ?? req.headers.get("cf-ipcountry");
  return c && /^[A-Z]{2}$/.test(c) ? c : null;
}

/** Naira is only offered to visitors in Nigeria; everyone else pays in dollars. */
export function currencyFor(req: Request): Currency {
  return countryOf(req) === "NG" ? "NGN" : "USD";
}
