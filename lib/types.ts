/** Company applicant-tracking systems (one board = one company) and remote-job aggregators (one feed, many companies). */
export type Provider =
  | "ashby" | "lever" | "greenhouse" | "workable" | "recruitee"
  | "himalayas" | "jobicy" | "remoteok" | "arbeitnow";

/** Display names. Aggregators require visible credit with a link back to their posting. */
export const PROVIDER_NAMES: Record<Provider, string> = {
  ashby: "Ashby", lever: "Lever", greenhouse: "Greenhouse", workable: "Workable", recruitee: "Recruitee",
  himalayas: "Himalayas", jobicy: "Jobicy", remoteok: "Remote OK", arbeitnow: "Arbeitnow",
};
/** Jobs posted by the employer on its own careers page. On by default. */
export const EMPLOYER_SOURCES: Provider[] = ["greenhouse", "lever", "ashby", "workable", "recruitee"];
/** Remote-job sites that collect postings from many companies. Off until the user turns them on. */
export const EXTRA_SOURCES: { id: Provider; note: string }[] = [
  { id: "himalayas", note: "Remote jobs, many open worldwide" },
  { id: "jobicy", note: "Remote jobs from the last 7 days" },
  { id: "remoteok", note: "Remote tech and startup jobs" },
  { id: "arbeitnow", note: "Mostly Europe, many in Germany" },
];

/** Accepts a comma list or array from a request; unknown names are dropped. Empty → employer sources. */
export function parseSources(v: string | string[] | null | undefined): Provider[] {
  const list = (Array.isArray(v) ? v : (v ?? "").split(",")).map((s) => s.trim()).filter((s): s is Provider => s in PROVIDER_NAMES);
  return list.length ? [...new Set(list)] : EMPLOYER_SOURCES;
}

export type RemoteStatus = "remote" | "hybrid" | "onsite" | "unknown";

export interface Job {
  id: string;
  provider: Provider;
  company: string;
  title: string;
  description: string;
  location: string;
  remote: RemoteStatus;
  /** True only when the posting itself says the remote role is open worldwide. */
  remoteWorldwide: boolean;
  employmentType: string | null;
  salary: string | null;
  sourceUrl: string;
  applyUrl: string;
  /** Only set when the provider exposes a publication/creation date. Never inferred. */
  publishedAt: string | null;
  lastChecked: string;
}

export type JobSummary = Omit<Job, "description"> & { snippet: string };

export interface Board {
  provider: Provider;
  token: string;
  company: string;
}
