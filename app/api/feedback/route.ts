import { z } from "zod";
import { ensureSchema, getDb } from "@/lib/server/db";
import { dailyLimit, json, rateLimit, readJson } from "@/lib/server/guard";
import { requireHuman } from "@/lib/server/turnstile";

const Body = z
  .object({
    kind: z.enum(["idea", "bug", "praise", "other"]),
    rating: z.number().int().min(1).max(5).optional(),
    message: z.string().trim().max(1000).optional().default(""),
    email: z.union([z.literal(""), z.string().trim().max(254).email("That email doesn't look right.")]).optional().default(""),
    page: z.string().trim().max(120).optional().default(""),
    locale: z.string().trim().max(8).optional().default(""),
    turnstile: z.string().max(2048).optional(),
  })
  .refine((b) => b.message.length >= 3 || b.rating !== undefined, { message: "Add a rating or a few words." });

/**
 * Feedback from anyone using the site, signed in or not. Stored for review on /admin.
 * Never accepts résumé or job text from the app itself: only what the person types here.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const read = await readJson(req, 4_000);
  if (read instanceof Response) return read;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, 400);
  const notHuman = await requireHuman(req, parsed.data.turnstile, "feedback");
  if (notHuman) return notHuman;
  const db = getDb();
  if (!db) return json({ error: "Feedback isn't available right now." }, 503);
  if (!(await dailyLimit(req, "feedback", 10))) return json({ error: "You've sent a lot of feedback today. Thank you! Try again tomorrow." }, 429);

  const b = parsed.data;
  try {
    await ensureSchema(db);
    await db
      .prepare("INSERT INTO feedback (created_at, kind, rating, message, email, page, locale) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(Date.now(), b.kind, b.rating ?? null, b.message, b.email, b.page.startsWith("/") ? b.page : "", b.locale)
      .run();
  } catch {
    return json({ error: "Couldn't send that right now. Try again shortly." }, 503);
  }
  return json({ message: "Thank you! We read every message." });
}
