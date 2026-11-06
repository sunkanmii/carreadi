import { z } from "zod";
import { ownerFor } from "@/lib/server/account";
import { filterJobs, getAllJobs } from "@/lib/jobs";
import { FREE_MATCHES } from "@/lib/plans";
import { recommend } from "@/lib/recommend";
import { json, rateLimit, readJson } from "@/lib/server/guard";
import { passStatus } from "@/lib/server/payments";
import { parseSources } from "@/lib/types";

const PASS_MATCHES = 12;

const Body = z.object({
  skills: z.array(z.string().trim().max(60)).max(60),
  careerPath: z.string().max(40).optional(),
  location: z.string().trim().max(100).optional(),
  remote: z.enum(["any", "remote", "hybrid", "onsite"]).optional(),
  sources: z.array(z.string().max(20)).max(20).optional(),
  passToken: z.string().max(100).optional(),
});

/** Ranked job matches. Free: the top few; a pass unlocks the full ranked list. */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const read = await readJson(req, 20_000);
  if (read instanceof Response) return read;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  const { jobs, errors } = await getAllJobs();
  const pool = filterJobs(jobs, { sources: parseSources(parsed.data.sources) });
  const all = recommend(pool, parsed.data, PASS_MATCHES);
  const paid = await ownerFor(req) || (parsed.data.passToken ? await passStatus(parsed.data.passToken).then((s) => s.active).catch(() => false) : false);
  const shown = paid ? all : all.slice(0, FREE_MATCHES);
  return json({ recommendations: shown, locked: all.length - shown.length, errors });
}
