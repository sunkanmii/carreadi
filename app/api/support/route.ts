import { z } from "zod";
import { createSupportRequest } from "@/lib/server/payments";
import { dailyLimit, json, rateLimit, readJson } from "@/lib/server/guard";

const Body = z.object({
  email: z.string().trim().max(254).email("Add the email you can be reached at."),
  note: z.string().trim().max(500).optional().default(""),
});

/** "I lost my pass": stores the contact email for the admin, who looks up the pass and replies. */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const read = await readJson(req, 2_000);
  if (read instanceof Response) return read;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, 400);
  if (!(await dailyLimit(req, "support", 3))) return json({ error: "You've already sent a few requests today. We'll be in touch." }, 429);
  try {
    await createSupportRequest(parsed.data.email, parsed.data.note);
  } catch {
    return json({ error: "Couldn't send that right now. Try again shortly." }, 503);
  }
  // Same answer whether or not a pass exists, so this can't be used to check someone's email.
  return json({ message: "Got it. If there's a pass for this email, we'll send your restore code there." });
}
