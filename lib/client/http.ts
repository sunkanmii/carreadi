import { getSession } from "./session";
import { clientLocale, clientText } from "./locale";

/** Fetches JSON from our API; throws an Error carrying the server's message on failure. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const session = getSession();
  if (url.startsWith("/api/")) headers.set("x-carreadi-locale", clientLocale());
  if (session && url.startsWith("/api/") && !headers.has("authorization")) headers.set("authorization", `Bearer ${session}`);
  const res = await fetch(url, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(clientText(data.error || "Something went wrong. Please try again."));
  return data;
}

export const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
