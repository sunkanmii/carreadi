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

// Everything lives in this browser only. The free tier keeps a single active roadmap.
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
  return next;
}

export function clearAll() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
