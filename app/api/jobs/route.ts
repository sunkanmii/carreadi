import { filterJobs, getAllJobs, summarize } from "@/lib/jobs";
import { json, rateLimit } from "@/lib/server/guard";
import { parseSources } from "@/lib/types";

const REMOTE = new Set(["any", "remote", "hybrid", "onsite", "unknown"]);
const clip = (v: string | null) => (v ?? "").slice(0, 100) || undefined;

export async function GET(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const p = new URL(req.url).searchParams;
  const remote = p.get("remote") ?? "any";
  if (!REMOTE.has(remote)) return json({ error: "Invalid remote filter." }, 400);
  const page = Math.max(0, Math.min(100, Number(p.get("page")) || 0));

  const { jobs, errors } = await getAllJobs();
  const filtered = filterJobs(jobs, {
    q: clip(p.get("q")),
    path: clip(p.get("path")),
    location: clip(p.get("location")),
    remote: remote as "any",
    type: clip(p.get("type")),
    sources: parseSources(p.get("sources")),
  }).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  const size = 20;
  return json({
    total: filtered.length,
    page,
    jobs: filtered.slice(page * size, page * size + size).map(summarize),
    errors,
  });
}
