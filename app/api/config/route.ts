import { env } from "cloudflare:workers";

/**
 * Public runtime config for the browser. PostHog project keys are public by design (they can
 * only send events), so it's safe to serve here. Set POSTHOG_KEY (and optionally POSTHOG_HOST)
 * as Worker variables in the Cloudflare dashboard: no rebuild needed.
 */
export function GET() {
  const e = env as unknown as { POSTHOG_KEY?: string; POSTHOG_HOST?: string };
  return Response.json(
    { posthogKey: e.POSTHOG_KEY || null, posthogHost: e.POSTHOG_HOST || "https://us.i.posthog.com" },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
