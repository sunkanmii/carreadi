import { careerById, skillsIn } from "./careers";
import type { Job, JobSummary } from "./types";
import { summarize } from "./jobs";

export type Tier = "apply" | "review" | "future";

export interface Recommendation {
  job: JobSummary;
  tier: Tier;
  matched: string[];
  missing: string[];
  /** How many tracked skills the posting lists in total (matched + missing, before trimming). */
  listed: number;
  reasons: string[];
}

export interface Profile {
  skills: string[];
  careerPath?: string;
  location?: string;
  remote?: "any" | "remote" | "hybrid" | "onsite";
}

const HARD_REQUIREMENTS: [RegExp, string][] = [
  [/\([A-Z][a-z]+[- ][Ss]peaking\)|\b[Ff]luen(t|cy) in [A-Z][a-z]+/, "a specific language"],
  [/\bsecurity clearance\b|\b(TS\/SCI|top secret)\b/i, "a security clearance"],
  [/\b(must|required to) (be )?(legally )?authori[sz]ed to work\b|\bno (visa )?sponsorship\b|\bunable to sponsor\b/i, "existing work authorization"],
  [/\bmust (reside|live|be based) in\b/i, "living in a specific place"],
];

/** Hard eligibility conditions we can detect verbatim. These are never auto-cleared. */
export function hardRequirements(text: string): string[] {
  return HARD_REQUIREMENTS.filter(([re]) => re.test(text)).map(([, label]) => label);
}

/**
 * Transparent, rule-based ranking. Inputs are the skills the AI verified in the résumé;
 * every classification lists the exact criteria that produced it. No hiring probabilities.
 */
export function recommend(jobs: Job[], p: Profile, limit = 12): Recommendation[] {
  const career = careerById(p.careerPath);
  const userSkills = new Set(p.skills.map((s) => s.toLowerCase()));
  const loc = p.location?.trim().toLowerCase();
  const out: (Recommendation & { score: number })[] = [];

  for (const job of jobs) {
    if (career && !career.titles.test(job.title)) continue;

    const wanted = skillsIn(`${job.title}\n${job.description}`);
    const matched = wanted.filter((s) => userSkills.has(s.toLowerCase()));
    const missing = wanted.filter((s) => !userSkills.has(s.toLowerCase()));
    const coverage = wanted.length ? matched.length / wanted.length : 0;

    const locOk = !loc || job.location.toLowerCase().includes(loc) || job.remoteWorldwide;
    const remoteOk = !p.remote || p.remote === "any" || job.remote === p.remote;
    const reasons: string[] = [];

    if (wanted.length === 1) reasons.push(matched.length ? "You have the 1 skill it lists" : "You don't have the 1 skill it lists");
    else if (wanted.length) reasons.push(`You have ${matched.length} of the ${wanted.length} skills it lists`);
    else reasons.push("Posting lists few skills we can check — read it directly");
    if (loc) reasons.push(locOk ? `Location fits (${job.location})` : `Location may not fit: ${job.location}`);
    if (job.remote === "remote" && !job.remoteWorldwide) reasons.push(`Remote, limited to: ${job.location}`);
    if (!remoteOk)
      reasons.push(job.remote === "unknown" ? "Work style not stated in the posting" : `Work style is ${job.remote}, you prefer ${p.remote}`);

    const hard = hardRequirements(`${job.title}\n${job.description}`);
    if (hard.length) reasons.push(`Requires ${hard.join(" and ")} — check you qualify`);

    let tier: Tier;
    if (locOk && remoteOk && !hard.length && coverage >= 0.5 && matched.length >= 3) tier = "apply";
    else if (locOk && coverage >= 0.25) tier = "review";
    else tier = "future";

    if (!matched.length && !career) continue;
    // Matched count outweighs coverage: a posting that lists 1 skill you have (100%) shouldn't beat one listing 4 of 10.
    out.push({ job: summarize(job), tier, matched, missing: missing.slice(0, 6), listed: wanted.length, reasons, score: matched.length * 2 + coverage * 5 + (locOk ? 3 : 0) + (remoteOk ? 1 : 0) });
  }

  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _s, ...r }) => r);
}
