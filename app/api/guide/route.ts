import { env } from "cloudflare:workers";
import type { AiLike } from "@/lib/analysis/run";
import { StepInputSchema, stepGuide } from "@/lib/analysis/coach";
import { requestLocale } from "@/lib/i18n";
import { dailyLimit, json, rateLimit, readJson } from "@/lib/server/guard";

/** How to do one roadmap step well: steps, checked links, mistakes to avoid and how to show it. */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const read = await readJson(req, 4_000);
  if (read instanceof Response) return read;
  const parsed = StepInputSchema.safeParse(read.body);
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  const ai = (env as unknown as { AI?: AiLike }).AI;
  if (!ai) return json({ error: "AI is not configured on this server." }, 503);
  if (!(await dailyLimit(req, "guide", 30))) return json({ error: "You've opened a lot of guides today. Try again tomorrow." }, 429);
  try {
    return json({ guide: await stepGuide(ai, parsed.data, requestLocale(req)) });
  } catch {
    return json({ error: "Couldn't write the guide right now. Please try again." }, 502);
  }
}
