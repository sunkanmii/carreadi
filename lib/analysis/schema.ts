import { z } from "zod";

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
 * Free preview: only the strengths (what the résumé already shows). Every gap, the summary that
 * names them, and so the whole roadmap are removed here on the server and never reach the browser.
 */
export function toPreview(a: Analysis): Analysis {
  const shown = a.findings.filter((f) => f.status === "demonstrated");
  return { ...a, summary: "", findings: shown, preview: { locked: a.findings.length - shown.length } };
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
