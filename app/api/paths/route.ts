import { env } from "cloudflare:workers";
import type { AiLike } from "@/lib/analysis/run";
import { PathFitError, PathFitRequestSchema, suggestPaths, toPathsPreview } from "@/lib/analysis/paths";
import { requestLocale } from "@/lib/i18n";
import { ownerFor } from "@/lib/server/account";
import { dailyLimit, json, rateLimit, readJson } from "@/lib/server/guard";
import { passStatus } from "@/lib/server/payments";
import { bumpStat } from "@/lib/server/stats";

/** Free visitors get a few suggestions a day; pass holders more. Doesn't use up a CV check. */
const FREE_PER_DAY = 3;
const PASS_PER_DAY = 20;

/** "Which tech path fits me?": 2–4 tech paths the CV already points to, with the quotes behind each. */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const read = await readJson(req, 200_000);
  if (read instanceof Response) return read;
  const parsed = PathFitRequestSchema.safeParse(read.body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, 400);
  const ai = (env as unknown as { AI?: AiLike }).AI;
  if (!ai) return json({ error: "AI is not configured on this server." }, 503);

  const owner = await ownerFor(req);
  const paid =
    !!owner || (parsed.data.passToken ? await passStatus(parsed.data.passToken).then((s) => s.active).catch(() => false) : false);
  if (!owner && !(await dailyLimit(req, paid ? "paths-pass" : "paths", paid ? PASS_PER_DAY : FREE_PER_DAY)))
    return json({ error: "You've asked for a lot of path suggestions today. Try again tomorrow." }, 429);

  try {
    const fits = await suggestPaths(ai, parsed.data.resumeText, requestLocale(req));
    await bumpStat("paths");
    // Free previews are trimmed here, on the server: locked gaps and steps never reach the browser.
    return json({ fits: paid ? fits : toPathsPreview(fits) });
  } catch (e) {
    if (e instanceof PathFitError) return json({ error: e.message }, 502);
    console.error("paths: unexpected error", e instanceof Error ? e.name : "unknown");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
