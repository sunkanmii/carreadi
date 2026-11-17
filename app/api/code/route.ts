import { z } from "zod";
import { normalizeCode } from "@/lib/codes";
import { usableCode } from "@/lib/server/payments";
import { dailyLimit, json, rateLimit, readJson } from "@/lib/server/guard";

const Body = z.object({ code: z.string().max(40) });

/**
 * Tells the page what a discount code is worth, so it can show the new price. It takes no use
 * and promises nothing: checkout checks the code again and is the only place a price is set.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const read = await readJson(req, 500);
  if (read instanceof Response) return read;
  const parsed = Body.safeParse(read.body);
  const code = parsed.success ? normalizeCode(parsed.data.code) : null;
  // Counted before looking, so codes can't be guessed in bulk.
  if (!(await dailyLimit(req, "code", 400))) return json({ error: "Too many attempts today. Try again tomorrow." }, 429);
  if (!code) return json({ error: "We don't recognise that code. Check it and try again." }, 400);
  try {
    const c = await usableCode(code);
    return "error" in c ? json({ error: c.error }, 400) : json({ code: c.code, percent: c.percent, plan: c.plan });
  } catch {
    return json({ error: "Couldn't check that code right now. Try again in a moment." }, 503);
  }
}
