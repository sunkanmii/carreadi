import { env } from "cloudflare:workers";
import { AnalysisError, runAnalysis, type AiLike } from "@/lib/analysis/run";
import { AnalyzeRequestSchema, toPreview } from "@/lib/analysis/schema";
import { careerById } from "@/lib/careers";
import { getJob } from "@/lib/jobs";
import { consumeQuota, json, rateLimit, readJson } from "@/lib/server/guard";
import { consumePass, refundPassUse } from "@/lib/server/payments";

export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;

  const read = await readJson(req, 200_000);
  if (read instanceof Response) return read;
  const parsed = AnalyzeRequestSchema.safeParse(read.body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, 400);
  const input = parsed.data;

  let jobText = input.jobText ?? "";
  let job = null;
  if (input.jobId) {
    job = await getJob(input.jobId);
    if (!job) return json({ error: "That job is no longer listed." }, 404);
    jobText = `${job.title} at ${job.company}\nLocation: ${job.location} (${job.remote})\n\n${job.description}`;
  }

  const ai = (env as unknown as { AI?: AiLike }).AI;
  if (!ai) return json({ error: "AI is not configured on this server." }, 503);

  // A pass gives full results; without one, the weekly free analysis gives a preview.
  let passLeft: number | null = null;
  if (input.passToken) {
    try {
      passLeft = await consumePass(input.passToken);
    } catch {
      return json({ error: "Couldn't check your pass right now. Try again in a moment." }, 503);
    }
  }
  const paid = passLeft !== null;
  const quota = paid ? null : await consumeQuota(req);
  if (quota && !quota.ok)
    return json(
      {
        error: input.passToken
          ? "Your pass has ended or has no analyses left, and this week's free preview is used. Get a new pass to continue."
          : "You've used this week's free preview. Get a pass for full results and your roadmap.",
        needsPass: true,
      },
      402,
    );

  try {
    const analysis = await runAnalysis(ai, {
      resumeText: input.resumeText,
      jobText,
      careerPath: careerById(input.careerPath)?.label,
      location: input.location,
      remote: input.remote,
    });
    return json({
      // Free previews are trimmed here, on the server: locked gaps never reach the browser.
      analysis: paid ? analysis : toPreview(analysis),
      job: job && { id: job.id, title: job.title, company: job.company, applyUrl: job.applyUrl },
      pass: paid ? { analysesLeft: passLeft } : null,
    });
  } catch (e) {
    if (paid) await refundPassUse(input.passToken!).catch(() => {});
    else await quota?.refund();
    if (e instanceof AnalysisError) return json({ error: e.message }, 502);
    console.error("analyze: unexpected error", e instanceof Error ? e.name : "unknown");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
