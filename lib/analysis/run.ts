import { MODEL_JSON_SCHEMA, ModelOutputSchema, type Analysis } from "./schema";
import { verifyOutput } from "./verify";

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const SYSTEM = `You are a strict, honest career-readiness reviewer. Compare a RÉSUMÉ against a JOB.
Rules:
- Use ONLY what the résumé explicitly says. Never invent experience, employers, dates, or qualifications.
- Only list requirements the JOB text actually states. Never add generic ones (e.g. "remote work experience").
- For each requirement, output one finding with status:
  "demonstrated" = résumé explicitly shows it; "evidence" MUST be an exact quote copied from the résumé.
  "not_shown" = résumé shows related experience but not the requirement itself.
  "missing" = no sign of it in the résumé.
  "uncertain" = cannot tell from the résumé.
  "eligibility" = a hard restriction the candidate may not meet (work authorization, clearance, licence, required degree,
    language, or a location/time zone that excludes the candidate). "Remote, global" or "we hire anywhere" is NOT a restriction.
- Include demonstrated requirements too, so the candidate sees their strengths.
- evidence: exact résumé quote, or "" if none.
- action: one concrete step. deliverable: something the candidate can SHOW an employer, specific to this job
  (e.g. "Open a merged pull request to PostgREST", "Public repo: a C extension for Postgres with tests").
  Never "complete a tutorial" or "read the docs". Never targets the candidate can't control (stars, followers, downloads).
- resource: a real, well-known free learning resource (official docs preferred) with its URL.
- priority: 1 = do first (required + missing), 2 = next, 3 = later.
- estimatedHours: realistic hours for someone with this résumé to finish the action AND the deliverable
  (a small doc fix ≈ 3, a portfolio project ≈ 20–40, a new language to working level ≈ 80+). 0 if nothing to do.
- summary: two plain sentences naming the strongest match and the biggest gap. No preamble.
- demonstratedSkills: short skill names that literally appear in the résumé.
- Never estimate hiring chances or percentages.
Return 6–15 findings. Be concise.`;

export interface AiLike {
  run(model: string, input: unknown): Promise<unknown>;
}

function extractJson(res: unknown): unknown {
  const r = (res as { response?: unknown })?.response ?? res;
  if (typeof r !== "string") return r;
  const start = r.indexOf("{");
  const end = r.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model did not return JSON");
  return JSON.parse(r.slice(start, end + 1));
}

export class AnalysisError extends Error {}

export async function runAnalysis(
  ai: AiLike,
  input: { resumeText: string; jobText: string; careerPath?: string; location?: string; remote?: string },
): Promise<Analysis> {
  const user = [
    input.careerPath && `Target career path: ${input.careerPath}`,
    input.location && `Candidate's preferred location: ${input.location}`,
    input.remote && input.remote !== "any" && `Candidate's work preference: ${input.remote}`,
    `JOB:\n"""\n${input.jobText.slice(0, 12000)}\n"""`,
    // The whole résumé (max 30k chars ≈ 7.5k tokens) fits in the model's 24k context
    // next to the job (12k chars ≈ 3k tokens) and 4k output tokens, so it's never cut.
    `RÉSUMÉ:\n"""\n${input.resumeText}\n"""`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.run(MODEL, {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: attempt ? `${user}\n\nYour previous answer was invalid (${lastError}). Follow the schema exactly.` : user },
        ],
        response_format: { type: "json_schema", json_schema: MODEL_JSON_SCHEMA },
        max_tokens: 4096,
        temperature: 0.2,
      });
      const parsed = ModelOutputSchema.safeParse(extractJson(res));
      if (parsed.success) return verifyOutput(parsed.data, input.resumeText, MODEL);
      lastError = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } catch (e) {
      // JSON.parse errors can echo model text (which may quote the résumé), so never keep them.
      lastError = e instanceof SyntaxError ? "invalid JSON" : e instanceof Error ? e.message.slice(0, 120) : "model error";
    }
  }
  // Message is safe to log: it never contains résumé text.
  console.warn("analysis failed:", lastError);
  throw new AnalysisError("The AI couldn't produce a reliable analysis. Please try again.");
}
