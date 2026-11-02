"use client";
import type { Analysis } from "../analysis/schema";
import { buildRoadmap } from "../roadmap";
import { track } from "./analytics";
import { api, postJson } from "./http";
import { getPass } from "./pass";
import { load, save, type Saved } from "./store";

/**
 * Re-runs the last analysis (same résumé and job the user already consented to send) with
 * their pass, so a free preview becomes full results. Keeps roadmap progress for the same job.
 */
export async function recheckWithPass() {
  const s = load();
  const pass = getPass();
  if (!s.resumeText || !(s.jobId || s.jobText)) throw new Error("Run an analysis first.");
  const data = await api<{ analysis: Analysis; job: Saved["job"] }>(
    "/api/analyze",
    postJson({
      consent: true,
      resumeText: s.resumeText,
      jobId: s.jobId,
      jobText: s.jobId ? undefined : s.jobText,
      careerPath: s.prefs?.careerPath || undefined,
      location: s.prefs?.location || undefined,
      remote: s.prefs?.remote,
      passToken: pass?.token,
    }),
  );
  track("analysis_unlocked", { full: !data.analysis.preview });
  save({ analysis: data.analysis, job: data.job ?? s.job, roadmap: buildRoadmap(data.analysis, s.roadmap) });
  return data.analysis;
}
