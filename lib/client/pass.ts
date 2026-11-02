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

export async function passStatus(check = false): Promise<PassStatus> {
  const p = getPass();
  if (!p) return { active: false };
  return api<PassStatus>("/api/pass", postJson({ action: "status", token: p.token, check }));
}

export async function restore(reference: string) {
  const r = await api<{ token: string; status: PassStatus }>("/api/pass", postJson({ action: "restore", reference }));
  setPass({ token: r.token, reference });
  return r.status;
}

export async function startCheckout(plan: PassId, currency: Currency, email?: string) {
  const r = await api<{ url: string; reference: string; token: string }>("/api/checkout", postJson({ plan, currency, email: email || undefined }));
  setPass({ token: r.token, reference: r.reference });
  window.location.href = r.url;
}

/** Sensible default: naira for visitors in Nigeria, dollars elsewhere. */
export function defaultCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz === "Africa/Lagos" || navigator.language.toLowerCase().endsWith("-ng") ? "NGN" : "USD";
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
