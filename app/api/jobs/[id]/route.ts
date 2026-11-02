import { getJob } from "@/lib/jobs";
import { json, rateLimit } from "@/lib/server/guard";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const { id } = await params;
  const job = await getJob(decodeURIComponent(id).slice(0, 200));
  return job ? json({ job }) : json({ error: "Job not found or no longer listed." }, 404);
}
