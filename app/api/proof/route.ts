import { env } from "cloudflare:workers";
import { z } from "zod";
import type { AiLike } from "@/lib/analysis/run";
import { StepInputSchema, checkProof } from "@/lib/analysis/coach";
import { requestLocale } from "@/lib/i18n";
import { proofText } from "@/lib/proof";
import { ownerFor } from "@/lib/server/account";
import { dailyLimit, json, rateLimit, readJson } from "@/lib/server/guard";
import { passStatus } from "@/lib/server/payments";

const Body = StepInputSchema.extend({
  links: z.array(z.string().trim().max(500)).min(1).max(3),
  notes: z.string().trim().max(1500).default(""),
  passToken: z.string().max(100).optional(),
});

/** Checks finished work for one step against its requirement, and writes honest CV text for it. Pass holders only. */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const read = await readJson(req, 10_000);
  if (read instanceof Response) return read;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return json({ error: "Add at least one link to your work." }, 400);
  const { links, notes, passToken, ...step } = parsed.data;

  const paid = (await ownerFor(req)) || (passToken ? await passStatus(passToken).then((s) => s.active).catch(() => false) : false);
  if (!paid) return json({ error: "Checking your work comes with a pass.", needsPass: true }, 402);
  const ai = (env as unknown as { AI?: AiLike }).AI;
  if (!ai) return json({ error: "AI is not configured on this server." }, 503);
  if (!(await dailyLimit(req, "proof", 20))) return json({ error: "You've checked a lot of work today. Try again tomorrow." }, 429);

  const proof = (await Promise.all([...new Set(links)].map(proofText))).join("\n\n");
  try {
    return json({ proof: await checkProof(ai, step, proof, notes, requestLocale(req)) });
  } catch {
    return json({ error: "Couldn't check your work right now. Please try again." }, 502);
  }
}
