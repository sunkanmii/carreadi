"use client";
import type { Analysis } from "../analysis/schema";
import type { Roadmap } from "../roadmap";
import type { Provider } from "../types";

export interface Prefs {
  careerPath: string;
  location: string;
  remote: "any" | "remote" | "hybrid" | "onsite";
}

export interface Saved {
  resumeText?: string;
  jobText?: string;
  jobId?: string;
  job?: { id: string; title: string; company: string; applyUrl: string } | null;
  prefs?: Prefs;
  analysis?: Analysis;
  roadmap?: Roadmap;
  /** Job sources the user chose to see. Unset = employer career pages only. */
  sources?: Provider[];
}

const KEY = "carreadi:v1";
const HISTORY_KEY = "carreadi:history";
const HISTORY_MAX = 30;

/** One past check: the results and roadmap only, never the résumé. */
export interface HistoryEntry {
  /** The job checked against; one entry per job, re-checks update it. */
  id: string;
  savedAt: string;
  job?: Saved["job"];
  jobId?: string;
  jobText?: string;
  analysis: Analysis;
  roadmap: Roadmap;
  /** The score from the check before this one for the same job, to show progress. */
  previous?: Score & { at: string };
}

export interface Score {
  shown: number;
  total: number;
}

export function scoreOf(a: Analysis): Score {
  return { shown: a.findings.filter((f) => f.status === "demonstrated").length, total: a.findings.length + (a.preview?.locked ?? 0) };
}

const targetOf = (s: Saved) => (s.jobId ? `job:${s.jobId}` : s.jobText ? `text:${s.jobText.slice(0, 400)}` : "");

export function loadHistory(): HistoryEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "null") as HistoryEntry[] | null;
    if (list) return list;
  } catch {}
  // First visit since history existed: start it from the check already saved here.
  const s = load();
  return s.analysis && s.roadmap && targetOf(s) ? recordHistory(s) : [];
}

function writeHistory(list: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {}
  return list;
}

/** Adds or updates the entry for the current job. A new analysis moves it to the top. */
function recordHistory(s: Saved): HistoryEntry[] {
  const id = targetOf(s);
  if (!id || !s.analysis || !s.roadmap) return [];
  let list: HistoryEntry[] = [];
  try {
    list = (JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryEntry[]) ?? [];
  } catch {}
  const old = list.find((e) => e.id === id);
  const fresh = !old || old.analysis.createdAt !== s.analysis.createdAt;
  // Compare like with like: unlocking a free preview isn't progress, a new check of the same kind is.
  const previous =
    old && fresh && !!old.analysis.preview === !!s.analysis.preview ? { ...scoreOf(old.analysis), at: old.savedAt } : old?.previous;
  const entry: HistoryEntry = {
    id,
    savedAt: fresh ? new Date().toISOString() : old!.savedAt,
    job: s.job,
    jobId: s.jobId,
    jobText: s.jobId ? undefined : s.jobText,
    analysis: s.analysis,
    roadmap: s.roadmap,
    previous,
  };
  const rest = list.filter((e) => e.id !== id);
  return writeHistory(fresh ? [entry, ...rest] : list.map((e) => (e.id === id ? entry : e)));
}

export function removeHistory(id: string) {
  return writeHistory(loadHistory().filter((e) => e.id !== id));
}

/** The history entry for what's open now, if any. */
export function currentEntry(): HistoryEntry | undefined {
  const id = targetOf(load());
  return id ? loadHistory().find((e) => e.id === id) : undefined;
}

/** Makes a past check the open one (its roadmap and results), keeping the saved résumé. */
export function openHistory(e: HistoryEntry) {
  return save({ job: e.job, jobId: e.jobId, jobText: e.jobText, analysis: e.analysis, roadmap: e.roadmap });
}

// Everything lives in this browser only.
export function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
}

export function save(patch: Partial<Saved>): Saved {
  const next = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  // Every new check, unlock and ticked step is kept in the history too.
  if (patch.analysis || patch.roadmap) recordHistory(next);
  return next;
}

export function clearAll() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}
