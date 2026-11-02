import { z } from "zod";
import { passStatus, restorePass } from "@/lib/server/payments";
import { dailyLimit, json, rateLimit, readJson } from "@/lib/server/guard";

const Body = z.discriminatedUnion("action", [
  // check: also asks Bachs about a pending order (used right after returning from checkout)
  z.object({ action: z.literal("status"), token: z.string().max(100), check: z.boolean().optional() }),
  z.object({ action: z.literal("restore"), reference: z.string().max(100) }),
]);

export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const read = await readJson(req, 1_000);
  if (read instanceof Response) return read;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  try {
    if (parsed.data.action === "status") return json(await passStatus(parsed.data.token, parsed.data.check));
    if (!(await dailyLimit(req, "restore", 10))) return json({ error: "Too many attempts today. Try again tomorrow." }, 429);
    const r = await restorePass(parsed.data.reference.trim());
    return r ? json(r) : json({ error: "No active pass found for that code. Check it and try again." }, 404);
  } catch {
    return json({ error: "Couldn't check your pass right now. Try again in a moment." }, 503);
  }
}
