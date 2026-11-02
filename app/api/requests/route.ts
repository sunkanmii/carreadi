import { z } from "zod";
import { allBoards } from "@/lib/jobs";
import { detectBoard } from "@/lib/jobs/detect";
import { fetchBoard } from "@/lib/jobs/providers";
import { ensureSchema, getDb } from "@/lib/server/db";
import { dailyLimit, json, rateLimit, readJson } from "@/lib/server/guard";
import { httpUrl } from "@/lib/url";

const Body = z.object({
  company: z.string().trim().min(2, "Add the company name.").max(100),
  url: z.string().trim().max(500),
  note: z.string().trim().max(500).optional().default(""),
});

/**
 * Someone asks us to list a company's jobs. We detect the job board from the link, check it
 * answers, and store the request for review on /admin. Nothing goes live without approval.
 */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const read = await readJson(req, 4_000);
  if (read instanceof Response) return read;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, 400);
  const url = httpUrl(parsed.data.url);
  if (!url) return json({ error: "Add a link that starts with https://" }, 400);

  const db = getDb();
  if (!db) return json({ error: "Requests aren't available right now." }, 503);
  if (!(await dailyLimit(req, "request", 5))) return json({ error: "You've sent 5 requests today. Try again tomorrow." }, 429);

  const board = detectBoard(url);
  let jobs: number | null = null;
  if (board) {
    if ((await allBoards()).some((b) => b.provider === board.provider && b.token === board.token))
      return json({ status: "listed", message: "Good news: we already list this company's jobs." });
    // Only ever calls our allowlisted job-board APIs (see safeFetchJson), so a link can't make us fetch arbitrary hosts.
    jobs = await fetchBoard({ ...board, company: parsed.data.company }).then((j) => j.length).catch(() => null);
  }

  await ensureSchema(db);
  await db
    .prepare("INSERT INTO job_requests (created_at, company, url, note, provider, token, jobs) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(new Date().toISOString(), parsed.data.company, url, parsed.data.note, board?.provider ?? null, board?.token ?? null, jobs)
    .run();

  return json({
    status: "pending",
    message: board
      ? jobs !== null
        ? `Thanks! We found ${jobs} open role${jobs === 1 ? "" : "s"} on this board. We'll review it shortly.`
        : "Thanks! We recognised the job board but couldn't reach it right now. We'll check it during review."
      : "Thanks! We'll look into this company. Links to their careers page help most.",
  });
}
