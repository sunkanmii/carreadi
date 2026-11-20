import { z } from "zod";
import { ensureSchema, getDb } from "@/lib/server/db";
import { json, rateLimit, readJson, requireAdmin } from "@/lib/server/guard";

/** Latest feedback plus a small summary, for the review page. */
export async function GET(req: Request) {
  const limited = (await rateLimit(req)) ?? (await requireAdmin(req));
  if (limited) return limited;
  const db = getDb();
  if (!db) return json({ error: "No database." }, 503);
  await ensureSchema(db);
  const { results } = await db.prepare("SELECT * FROM feedback ORDER BY status = 'new' DESC, id DESC LIMIT 200").all();
  const stats = await db
    .prepare("SELECT COUNT(rating) AS rated, AVG(rating) AS average, COUNT(*) AS total FROM feedback WHERE created_at > ?")
    .bind(Date.now() - 30 * 864e5)
    .first<{ rated: number; average: number | null; total: number }>();
  return json({ feedback: results, stats });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("done"), id: z.number().int() }),
  z.object({ action: z.literal("delete"), id: z.number().int() }),
]);

export async function POST(req: Request) {
  const limited = (await rateLimit(req)) ?? (await requireAdmin(req));
  if (limited) return limited;
  const read = await readJson(req, 1_000);
  if (read instanceof Response) return read;
  const parsed = Action.safeParse(read.body);
  if (!parsed.success) return json({ error: "Invalid action." }, 400);
  const db = getDb();
  if (!db) return json({ error: "No database." }, 503);
  await ensureSchema(db);
  const a = parsed.data;
  if (a.action === "done") await db.prepare("UPDATE feedback SET status = 'done' WHERE id = ?").bind(a.id).run();
  else await db.prepare("DELETE FROM feedback WHERE id = ?").bind(a.id).run();
  return json({ ok: true });
}
