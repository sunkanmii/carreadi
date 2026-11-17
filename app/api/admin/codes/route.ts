import { z } from "zod";
import { normalizeCode } from "@/lib/codes";
import { createCodes, listCodes, setCodeActive } from "@/lib/server/codes";
import { paymentDb } from "@/lib/server/payments";
import { json, rateLimit, readJson, requireAdmin } from "@/lib/server/guard";

/** Every discount code, newest first. Admin only. */
export async function GET(req: Request) {
  const limited = (await rateLimit(req)) ?? (await requireAdmin(req));
  if (limited) return limited;
  try {
    return json({ codes: await listCodes(await paymentDb()) });
  } catch {
    return json({ error: "No database." }, 503);
  }
}

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    percent: z.number().int().min(1).max(100),
    count: z.number().int().min(1).max(200),
    code: z.string().max(40).optional(),
    prefix: z.string().regex(/^[A-Za-z0-9]{2,10}$/).optional().or(z.literal("")),
    plan: z.enum(["day", "week"]).nullable(),
    maxUses: z.number().int().min(1).max(100_000).nullable(),
    // Days from now until the codes stop working.
    validDays: z.number().int().min(1).max(366).nullable(),
    note: z.string().trim().max(100),
  }),
  z.object({ action: z.literal("set_active"), code: z.string().max(40), active: z.boolean() }),
]);

export async function POST(req: Request) {
  const limited = (await rateLimit(req)) ?? (await requireAdmin(req));
  if (limited) return limited;
  const read = await readJson(req, 2_000);
  if (read instanceof Response) return read;
  const parsed = Action.safeParse(read.body);
  if (!parsed.success) return json({ error: "Check the discount, uses and dates, then try again." }, 400);
  const a = parsed.data;
  try {
    const d = await paymentDb();
    if (a.action === "set_active") {
      await setCodeActive(d, normalizeCode(a.code) ?? "", a.active);
      return json({ ok: true });
    }
    const chosen = a.code?.trim();
    if (chosen && (a.count !== 1 || !normalizeCode(chosen))) return json({ error: "A code you choose needs 4 to 24 letters, numbers or dashes, and is made one at a time." }, 400);
    const codes = await createCodes(d, {
      percent: a.percent,
      count: a.count,
      code: chosen || undefined,
      prefix: a.prefix || undefined,
      plan: a.plan,
      maxUses: a.maxUses,
      expiresAt: a.validDays ? Date.now() + a.validDays * 864e5 : null,
      note: a.note,
    });
    return codes ? json({ codes }) : json({ error: "That code already exists. Choose another." }, 409);
  } catch {
    return json({ error: "No database." }, 503);
  }
}
