import { env } from "cloudflare:workers";

/**
 * Public runtime config for the browser. PostHog project keys are public by design (they can
 * only send events), so it's safe to serve here. Set POSTHOG_KEY (and optionally POSTHOG_HOST)
 * as Worker variables in the Cloudflare dashboard: no rebuild needed.
 */
export function GET() {
  const e = env as unknown as { POSTHOG_KEY?: string; POSTHOG_HOST?: string; TURNSTILE_SITEKEY?: string; TURNSTILE_SECRET?: string };
  return Response.json(
    {
      posthogKey: e.POSTHOG_KEY || null,
      posthogHost: e.POSTHOG_HOST || "https://us.i.posthog.com",
      // The Turnstile site key is public by design. Only offered when the secret is also set, so a half-set-up widget never blocks forms.
      turnstileSiteKey: e.TURNSTILE_SITEKEY && e.TURNSTILE_SECRET ? e.TURNSTILE_SITEKEY : null,
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
