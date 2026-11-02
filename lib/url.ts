/**
 * Returns the URL only if it is an absolute http(s) link. Job feeds and AI output are untrusted:
 * a `javascript:` or `data:` URL in an href would run code when clicked.
 */
export function httpUrl(u: unknown): string | null {
  if (typeof u !== "string" || u.length > 2048) return null;
  try {
    const p = new URL(u.trim());
    return p.protocol === "https:" || p.protocol === "http:" ? p.href : null;
  } catch {
    return null;
  }
}

/** For rendering: a safe href, or "#" if the URL isn't http(s). */
export const safeHref = (u: unknown) => httpUrl(u) ?? "#";
