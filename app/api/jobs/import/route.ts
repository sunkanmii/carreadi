import { importJobLink, JobLinkError } from "@/lib/jobs/link";
import { dailyLimit, json, rateLimit, readJson } from "@/lib/server/guard";

/** Reads one job from a pasted link (company careers pages, applicant-tracking systems, most job sites). */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const read = await readJson(req, 4_000);
  if (read instanceof Response) return read;
  const url = (read.body as { url?: unknown })?.url;
  if (typeof url !== "string" || url.length > 2048) return json({ error: "Paste a job link." }, 400);
  if (!(await dailyLimit(req, "job-link", 60))) return json({ error: "You've read a lot of job links today. Paste the job description instead." }, 429);
  try {
    return json({ job: await importJobLink(url) });
  } catch (e) {
    const message = e instanceof JobLinkError ? e.message : "We couldn't read that link. Copy the job description and paste it instead.";
    return json({ error: message }, 422);
  }
}
