"use client";
// The pass lives only in this browser: a random token (proof of purchase) and the receipt
// reference (to restore it on another device). The server stores only the token's hash.
import type { Currency, PassId } from "../plans";
import { api, postJson } from "./http";
import { load, save } from "./store";

const KEY = "carreadi:pass";

export interface StoredPass {
  token: string;
  reference: string;
  /** The pass held before a new checkout started; used again if that checkout never completes. */
  previous?: { token: string; reference: string };
}
export interface PassStatus {
  active: boolean;
  plan?: PassId;
  expiresAt?: number;
  analysesLeft?: number;
  status?: string;
  reference?: string;
}

export function getPass(): StoredPass | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as StoredPass | null;
    return p?.token ? p : null;
  } catch {
    return null;
  }
}

export function setPass(p: StoredPass) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  window.dispatchEvent(new Event("carreadi:pass"));
}

export function clearPass() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event("carreadi:pass"));
}

const statusOf = (token: string, check: boolean) => api<PassStatus>("/api/pass", postJson({ action: "status", token, check }));

export async function passStatus(check = false): Promise<PassStatus> {
  const p = getPass();
  if (!p) return { active: false };
  const s = await statusOf(p.token, check);
  // A new purchase that never completed must not hide a pass that is still active.
  if (!s.active && p.previous) {
    const prev = await statusOf(p.previous.token, false).catch(() => null);
    if (prev?.active) {
      setPass(p.previous);
      return prev;
    }
  }
  return s;
}

export async function restore(reference: string) {
  const r = await api<{ token: string; status: PassStatus }>("/api/pass", postJson({ action: "restore", reference }));
  setPass({ token: r.token, reference });
  return r.status;
}

export async function startCheckout(plan: PassId, email?: string) {
  // The server charges in the visitor's local currency; nothing here can change it.
  const current = getPass();
  const r = await api<{ url: string; reference: string; token: string }>(
    "/api/checkout",
    postJson({ plan, email: email || undefined, passToken: current?.token }),
  );
  // Keep the old pass alongside the new one, so nothing is lost if this checkout is abandoned.
  setPass({ token: r.token, reference: r.reference, previous: current ? { token: current.token, reference: current.reference } : undefined });
  window.location.href = r.url;
}

/** The currency the server will charge this visitor in (naira only in Nigeria). */
export async function visitorCurrency(): Promise<Currency> {
  try {
    return (await api<{ currency: Currency }>("/api/pricing")).currency;
  } catch {
    return "USD";
  }
}

export function daysLeft(expiresAt?: number) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 864e5));
}

/** Keeps the last résumé/job so a pass holder can unlock full results without re-entering anything. */
export function canRecheck() {
  const s = load();
  return !!(s.resumeText && (s.jobId || s.jobText));
}

export { load, save };
