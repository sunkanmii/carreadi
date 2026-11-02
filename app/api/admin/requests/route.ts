import { z } from "zod";
import { allBoards, invalidateJobs } from "@/lib/jobs";
import { fetchBoard } from "@/lib/jobs/providers";
import { customBoards, ensureSchema, getDb } from "@/lib/server/db";
import { resolveSupport, supportRequests } from "@/lib/server/payments";
import { json, rateLimit, readJson, requireAdmin } from "@/lib/server/guard";
import { EMPLOYER_SOURCES, type Provider } from "@/lib/types";

/** Pending requests and approved boards, for the review page. */
export async function GET(req: Request) {
  const limited = (await rateLimit(req)) ?? (await requireAdmin(req));
  if (limited) return limited;
  const db = getDb();
  if (!db) return json({ error: "No database." }, 503);
  await ensureSchema(db);
  const { results } = await db.prepare("SELECT * FROM job_requests ORDER BY status = 'pending' DESC, id DESC LIMIT 200").all();
  return json({ requests: results, approved: await customBoards(), support: await supportRequests() });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), id: z.number().int(), company: z.string().trim().min(2).max(100) }),
  z.object({ action: z.literal("reject"), id: z.number().int() }),
  z.object({ action: z.literal("remove"), provider: z.enum(EMPLOYER_SOURCES as [Provider, ...Provider[]]), token: z.string().max(64) }),
  z.object({ action: z.literal("resolve_support"), id: z.number().int() }),
]);

export async function POST(req: Request) {
  const limited = (await rateLimit(req)) ?? (await requireAdmin(req));
  if (limited) return limited;
  const read = await readJson(req, 2_000);
  if (read instanceof Response) return read;
  const parsed = Action.safeParse(read.body);
  if (!parsed.success) return json({ error: "Invalid action." }, 400);
  const db = getDb();
  if (!db) return json({ error: "No database." }, 503);
  await ensureSchema(db);
  const a = parsed.data;

  if (a.action === "resolve_support") {
    await resolveSupport(a.id);
    return json({ ok: true });
  }

  if (a.action === "remove") {
    await db.prepare("DELETE FROM custom_boards WHERE provider = ? AND token = ?").bind(a.provider, a.token).run();
    invalidateJobs();
    return json({ ok: true });
  }

  const row = await db.prepare("SELECT provider, token FROM job_requests WHERE id = ?").bind(a.id).first<{ provider: Provider | null; token: string | null }>();
  if (!row) return json({ error: "Request not found." }, 404);

  if (a.action === "reject") {
    await db.prepare("UPDATE job_requests SET status = 'rejected' WHERE id = ?").bind(a.id).run();
    return json({ ok: true });
  }

  if (!row.provider || !row.token || !EMPLOYER_SOURCES.includes(row.provider))
    return json({ error: "This link isn't a supported job board, so it can't be added automatically." }, 400);
  // Verify the board really answers before it goes live.
  const jobs = await fetchBoard({ provider: row.provider, token: row.token, company: a.company }).catch(() => null);
  if (!jobs) return json({ error: "That board didn't respond. Try again later or reject the request." }, 502);
  if (!(await allBoards()).some((b) => b.provider === row.provider && b.token === row.token)) {
    await db
      .prepare("INSERT OR IGNORE INTO custom_boards (provider, token, company, added_at) VALUES (?, ?, ?, ?)")
      .bind(row.provider, row.token, a.company, new Date().toISOString())
      .run();
  }
  await db.prepare("UPDATE job_requests SET status = 'approved', jobs = ? WHERE id = ?").bind(jobs.length, a.id).run();
  invalidateJobs();
  return json({ ok: true, jobs: jobs.length });
}
