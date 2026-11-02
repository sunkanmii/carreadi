import { z } from "zod";
import { FREE_PREVIEW_GAPS, FREE_ROADMAP_STEPS } from "../plans";

export const STATUSES = ["demonstrated", "not_shown", "missing", "uncertain", "eligibility"] as const;
export const IMPORTANCE = ["required", "preferred", "bonus"] as const;

const str = (max: number) => z.string().trim().max(max);

export const FindingSchema = z.object({
  requirement: str(200).min(2),
  status: z.enum(STATUSES),
  evidence: str(400),
  importance: z.enum(IMPORTANCE),
  action: str(300),
  deliverable: str(300),
  resource: z.object({ name: str(120), url: str(300) }),
  priority: z.number().int().min(1).max(3),
  /** Rough hours to finish action + deliverable. 0 for demonstrated/eligibility findings. */
  estimatedHours: z.number().int().min(0).max(300),
});

/** What the model must return. Validated before anything reaches the user. */
export const ModelOutputSchema = z.object({
  roleTitle: str(140).min(1),
  summary: str(600).min(1),
  demonstratedSkills: z.array(str(60)).max(40),
  findings: z.array(FindingSchema).min(1).max(25),
});

export type Finding = z.infer<typeof FindingSchema> & { evidenceVerified: boolean };
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

export interface Analysis {
  roleTitle: string;
  summary: string;
  demonstratedSkills: string[];
  findings: Finding[];
  model: string;
  createdAt: string;
  /** Set on free previews: how many gaps were held back for pass holders. */
  preview?: { locked: number };
}

/**
 * Free preview: strengths (what the résumé already shows), the top gaps with full steps (so the
 * free roadmap has a couple of real tasks to come back for), and a few more gaps by name only.
 * Everything else is removed here on the server, so it never reaches the browser.
 */
export function toPreview(a: Analysis, gaps = FREE_PREVIEW_GAPS, withSteps = FREE_ROADMAP_STEPS): Analysis {
  const shown = a.findings.filter((f) => f.status === "demonstrated");
  // Hard eligibility limits can't become roadmap tasks, so free steps go to gaps the user can actually work on.
  const open = a.findings.filter((f) => f.status !== "demonstrated").sort((x, y) => x.priority - y.priority);
  const workable = open.filter((f) => f.status !== "eligibility");
  const full = new Set(workable.slice(0, withSteps));
  const visible = [...full, ...open.filter((f) => !full.has(f)).slice(0, Math.max(0, gaps - full.size))];
  const teaser = visible.map((f) => (full.has(f) ? f : { ...f, action: "", deliverable: "", resource: { name: "", url: "" }, estimatedHours: 0 }));
  return { ...a, findings: [...teaser, ...shown], preview: { locked: Math.max(0, open.length - visible.length) } };
}

export const AnalyzeRequestSchema = z
  .object({
    consent: z.literal(true, { error: "Consent is required before sending your résumé to AI." }),
    resumeText: str(30000).min(200, "Résumé text is too short (min 200 characters)."),
    jobText: str(30000).optional(),
    jobId: str(200).optional(),
    careerPath: str(40).optional(),
    location: str(100).optional(),
    remote: z.enum(["any", "remote", "hybrid", "onsite"]).optional(),
    passToken: str(100).optional(),
  })
  .refine((r) => r.jobId || (r.jobText && r.jobText.length >= 100), {
    message: "Add a job description (min 100 characters) or pick a job.",
  });

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

// JSON Schema handed to Workers AI JSON mode. Kept in sync with ModelOutputSchema by construction.
export const MODEL_JSON_SCHEMA = z.toJSONSchema(ModelOutputSchema, { target: "draft-7" });
