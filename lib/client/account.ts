"use client";
import { api, postJson } from "./http";
import { getPass } from "./pass";
import { loadHistory, replaceHistory, type HistoryEntry } from "./store";
import { clientText } from "./locale";

// Paid users can sign in by email link; their checks (results only, never the CV) are then kept
// in their Carreadi account too, so they survive a cleared browser and show up on any device.

const KEY = "carreadi:session";

export function getSession(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function setSession(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event("carreadi:session"));
  window.dispatchEvent(new Event("carreadi:pass"));
}

async function authed<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getSession();
  if (!token) throw new Error("Please sign in.");
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; signedOut?: boolean };
  if (res.status === 401 && data.signedOut) setSession(null);
  if (!res.ok) throw new Error(clientText(data.error || "Something went wrong. Please try again."));
  return data;
}

export async function requestLink(email: string) {
  await api("/api/auth", postJson({ action: "request", email, passToken: getPass()?.token }));
}

export async function verifyLink(token: string) {
  const { session } = await api<{ session: string }>("/api/auth", postJson({ action: "verify", token }));
  setSession(session);
}

export async function signOut() {
  try {
    await authed("/api/auth", { method: "POST", body: JSON.stringify({ action: "signout" }) });
  } catch {}
  setSession(null);
}

const stamp = (e: HistoryEntry) => Math.max(Date.parse(e.savedAt) || 0, Date.parse(e.roadmap?.updatedAt ?? "") || 0);

/**
 * Two-way sync: the newer copy of each check wins, checks only on this device are uploaded, and
 * checks only in the account are added here. Returns the merged history.
 */
export async function syncHistory(): Promise<HistoryEntry[]> {
  const { checks } = await authed<{ checks: HistoryEntry[] }>("/api/saved");
  const local = loadHistory();
  const remote = new Map(checks.filter((c) => c && typeof c.id === "string").map((c) => [c.id, c]));
  const merged = new Map<string, HistoryEntry>(remote);
  const upload: HistoryEntry[] = [];
  for (const e of local) {
    const r = remote.get(e.id);
    if (!r || stamp(e) > stamp(r)) {
      merged.set(e.id, e);
      upload.push(e);
    }
  }
  const list = [...merged.values()].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  replaceHistory(list);
  await Promise.all(upload.map((e) => pushCheck(e).catch(() => {})));
  return list;
}

export async function pushCheck(e: HistoryEntry) {
  await authed("/api/saved", { method: "PUT", body: JSON.stringify({ entry: e }) });
}

// Ticking steps fires many saves in a row: send the last state of each check once things settle.
const pending = new Map<string, ReturnType<typeof setTimeout>>();
export function queuePush(e: HistoryEntry) {
  clearTimeout(pending.get(e.id));
  pending.set(
    e.id,
    setTimeout(() => {
      pending.delete(e.id);
      void pushCheck(e).catch(() => {});
    }, 1500),
  );
}

export async function deleteRemote(id: string) {
  await authed("/api/saved", { method: "DELETE", body: JSON.stringify({ id }) });
}

/** Deletes every check saved in the account and signs out. Checks on this device stay. */
export async function deleteAccount() {
  await authed("/api/saved", { method: "DELETE", body: JSON.stringify({ all: true }) });
  setSession(null);
}
