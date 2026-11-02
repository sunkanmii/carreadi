import type { Analysis } from "./analysis/schema";

export interface Task {
  id: string;
  title: string;
  requirement: string;
  deliverable: string;
  resource: { name: string; url: string };
  priority: number;
  done: boolean;
  /** AI estimate in hours, editable by the user. Missing on roadmaps made before estimates existed. */
  hours?: number;
}

/** Remaining hours on open tasks that have an estimate. */
export function remainingHours(r: Roadmap) {
  return r.tasks.reduce((sum, t) => sum + (t.done ? 0 : (t.hours ?? 0)), 0);
}

export interface Roadmap {
  roleTitle: string;
  tasks: Task[];
  updatedAt: string;
  /** Hours per week the user plans to spend, for the time-to-finish estimate. */
  pace?: number;
}

const IMPORTANCE_RANK = { required: 0, preferred: 1, bonus: 2 } as const;

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Builds the roadmap from gaps. When refreshing, completed/edited tasks for the same
 * requirement are kept so progress survives a re-analysis.
 */
export function buildRoadmap(a: Analysis, previous?: Roadmap | null): Roadmap {
  const prev = new Map((previous?.tasks ?? []).map((t) => [key(t.requirement), t]));
  const gaps = a.findings
    .filter((f) => f.status !== "demonstrated" && f.status !== "eligibility" && f.action && f.deliverable)
    .sort((x, y) => x.priority - y.priority || IMPORTANCE_RANK[x.importance] - IMPORTANCE_RANK[y.importance]);

  const tasks: Task[] = gaps.map((f, i) => {
    const old = prev.get(key(f.requirement));
    return old
      ? { ...old, priority: f.priority, hours: old.hours ?? (f.estimatedHours || undefined) }
      : {
          id: `${Date.now().toString(36)}-${i}`,
          title: f.action,
          requirement: f.requirement,
          deliverable: f.deliverable,
          resource: f.resource,
          priority: f.priority,
          done: false,
          hours: f.estimatedHours || undefined,
        };
  });
  // Keep tasks the user added themselves.
  for (const t of previous?.tasks ?? []) {
    if (t.requirement === "Custom" && !tasks.includes(t)) tasks.push(t);
  }
  return { roleTitle: a.roleTitle, tasks, updatedAt: new Date().toISOString(), pace: previous?.pace };
}

export function nextTask(r: Roadmap | null): Task | null {
  return r?.tasks.filter((t) => !t.done).sort((a, b) => a.priority - b.priority)[0] ?? null;
}
