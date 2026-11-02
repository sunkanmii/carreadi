import { env } from "cloudflare:workers";
import { careerById } from "../careers";
import type { Board, Job, JobSummary, Provider, RemoteStatus } from "../types";
import { BOARDS } from "./boards";
import { customBoards } from "../server/db";
import { fetchBoard } from "./providers";

const TTL_MS = 30 * 60 * 1000;
// Shared across all Worker instances, so boards are fetched and parsed about once an hour
// instead of once per cold isolate.
const KV_TTL_S = 60 * 60;
let cache: { at: number; jobs: Job[]; errors: string[] } | null = null;
let inflight: Promise<{ jobs: Job[]; errors: string[] }> | null = null;

async function loadBoard(b: Board): Promise<Job[]> {
  const kv = (env as unknown as { JOBS_KV?: KVNamespace } | undefined)?.JOBS_KV;
  // v2: entries written before link validation existed are never read.
  const key = `board:v2:${b.provider}:${b.token}`;
  try {
    const hit = kv && (await kv.get<Job[]>(key, "json"));
    if (hit) return hit;
  } catch {}
  const jobs = await fetchBoard(b);
  try {
    if (kv && jobs.length) await kv.put(key, JSON.stringify(jobs), { expirationTtl: KV_TTL_S });
  } catch {}
  return jobs;
}

/** Seeded boards plus boards approved from user requests (D1), without duplicates. */
export async function allBoards(): Promise<Board[]> {
  const seen = new Set(BOARDS.map((b) => `${b.provider}:${b.token}`));
  const extra = (await customBoards()).filter((b) => !seen.has(`${b.provider}:${b.token}`));
  return [...BOARDS, ...extra];
}

/** Drops this instance's cached jobs, e.g. right after a board is approved. */
export function invalidateJobs() {
  cache = null;
}

/** All active jobs from the configured boards: per-isolate memory (30 min) → KV (1 h) → board APIs. */
export async function getAllJobs(): Promise<{ jobs: Job[]; errors: string[] }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  inflight ??= (async () => {
    const boards = await allBoards();
    const results = await Promise.allSettled(boards.map(loadBoard));
    const jobs: Job[] = [];
    const errors: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") jobs.push(...r.value);
      else errors.push(`${boards[i].company} (${boards[i].provider}) unavailable`);
    });
    // Only cache if at least one board answered; otherwise retry next request.
    if (jobs.length) cache = { at: Date.now(), jobs, errors };
    return { jobs, errors };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function getJob(id: string): Promise<Job | null> {
  const { jobs } = await getAllJobs();
  return jobs.find((j) => j.id === id) ?? null;
}

export interface JobFilters {
  q?: string;
  path?: string;
  location?: string;
  remote?: RemoteStatus | "any";
  type?: string;
  /** Which providers to include; omitted = all. */
  sources?: Provider[];
}

export function filterJobs(jobs: Job[], f: JobFilters): Job[] {
  const q = f.q?.trim().toLowerCase();
  const loc = f.location?.trim().toLowerCase();
  const career = careerById(f.path);
  const type = f.type?.trim().toLowerCase();
  const sources = f.sources && new Set(f.sources);
  return jobs.filter((j) => {
    if (sources && !sources.has(j.provider)) return false;
    if (q && !`${j.title} ${j.company}`.toLowerCase().includes(q)) return false;
    if (career && !career.titles.test(j.title)) return false;
    if (f.remote && f.remote !== "any" && j.remote !== f.remote) return false;
    // Location is explicit: a remote job only matches a location if its own text mentions
    // that place or says worldwide. "Remote - US" never matches "Germany".
    if (loc && !j.location.toLowerCase().includes(loc) && !j.remoteWorldwide) return false;
    if (type && !(j.employmentType ?? "").toLowerCase().includes(type)) return false;
    return true;
  });
}

export function summarize(j: Job): JobSummary {
  const { description, ...rest } = j;
  return { ...rest, snippet: description.slice(0, 220).replace(/\s+/g, " ") };
}
