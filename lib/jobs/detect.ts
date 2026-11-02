import type { Provider } from "../types";

const TOKEN_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/**
 * Recognises a company's job board from a careers-page or job link, so a request can be
 * approved without anyone looking up the board name by hand.
 * e.g. https://jobs.lever.co/acme/123 → { provider: "lever", token: "acme" }
 */
export function detectBoard(raw: string): { provider: Provider; token: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  const first = u.pathname.split("/").filter(Boolean)[0] ?? "";
  const ok = (provider: Provider, token: string | null | undefined) =>
    token && TOKEN_RE.test(token) ? { provider, token: token.toLowerCase() } : null;

  if (/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(host)) {
    return ok("greenhouse", first === "embed" ? u.searchParams.get("for") : first);
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") return ok("lever", first);
  if (host === "jobs.ashbyhq.com") return ok("ashby", first);
  if (host === "apply.workable.com") return ok("workable", first === "j" ? null : first);
  const rc = host.match(/^([a-z0-9-]{1,63})\.recruitee\.com$/);
  if (rc) return ok("recruitee", rc[1]);
  return null;
}
