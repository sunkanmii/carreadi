import { env } from "cloudflare:workers";
import { json } from "./guard";

interface TurnstileEnv {
  TURNSTILE_SECRET?: string;
  /** Comma-separated frontend hostnames the widget may be solved on. Defaults to the request's own host. */
  TURNSTILE_HOSTNAMES?: string;
}
const cfg = () => (env as unknown as TurnstileEnv | undefined) ?? {};

/** Bot protection is on once TURNSTILE_SECRET is set on the Worker. Until then forms work as before. */
export const turnstileEnabled = () => !!cfg().TURNSTILE_SECRET;

/**
 * Checks the Turnstile token a form sends, with Cloudflare's siteverify. Returns a 403 Response
 * to send back when the check fails, or null when the request may continue.
 * Fails closed: a missing token, a network error, a wrong action or a wrong hostname all block.
 * `action` must match the widget's data-action on that form, so a token from one form can't be
 * replayed on another.
 */
export async function requireHuman(req: Request, token: unknown, action: string): Promise<Response | null> {
  const secret = cfg().TURNSTILE_SECRET;
  if (!secret) return null;
  const blocked = () => json({ error: "We couldn't confirm you're human. Refresh the page and try again." }, 403);
  if (typeof token !== "string" || !token || token.length > 2048) return blocked();

  const hostnames = (cfg().TURNSTILE_HOSTNAMES ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!hostnames.length) hostnames.push(new URL(req.url).hostname.toLowerCase());

  try {
    const body = new URLSearchParams({ secret, response: token });
    const ip = req.headers.get("cf-connecting-ip");
    if (ip) body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return blocked();
    const result = (await r.json()) as { success?: boolean; action?: string; hostname?: string };
    if (result.success !== true || result.action !== action || !hostnames.includes((result.hostname ?? "").toLowerCase())) return blocked();
    return null;
  } catch {
    return blocked();
  }
}
