import { decodeEntities, htmlToText } from "../html";
import type { Board, Job, RemoteStatus } from "../types";
import { httpUrl } from "../url";

const ALLOWED_HOSTS = new Set([
  "boards-api.greenhouse.io", "api.lever.co", "api.ashbyhq.com", "apply.workable.com",
  "himalayas.app", "jobicy.com", "remoteok.com", "www.arbeitnow.com",
]);
// Recruitee serves each company from its own subdomain: <token>.recruitee.com.
const ALLOWED_SUFFIXES = [".recruitee.com"];
const TOKEN_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function hostAllowed(host: string) {
  // Exactly one DNS label before the suffix: "bunq.recruitee.com" yes, "a.b.recruitee.com" no.
  return ALLOWED_HOSTS.has(host) || ALLOWED_SUFFIXES.some((s) => host.endsWith(s) && /^[a-z0-9-]{1,63}$/i.test(host.slice(0, -s.length)));
}

/** Outbound fetch restricted to known job-board API hosts over HTTPS. */
export async function safeFetchJson(url: string): Promise<unknown> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !hostAllowed(u.hostname)) {
    throw new Error(`Blocked outbound host: ${u.hostname}`);
  }
  // Workers only supports "follow" | "manual"; with "manual" a redirect is a non-2xx and is rejected,
  // so we can never be bounced to a host outside the allowlist.
  const res = await fetch(u, {
    // Some feeds (Remote OK) reject requests without a user agent.
    headers: { accept: "application/json", "user-agent": "Carreadi/1.0 (+https://carreadi.sunkanmifafowora.workers.dev)" },
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`${u.hostname} responded ${res.status}`);
  return res.json();
}

const WORLDWIDE_RE = /\b(worldwide|anywhere|global(ly)?|any location)\b/i;

function remoteFromText(text: string): RemoteStatus {
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\bremote\b/i.test(text)) return "remote";
  if (/\b(on-?site|in[- ]office)\b/i.test(text)) return "onsite";
  return "unknown";
}

function jobId(board: Board, id: string | number) {
  return `${board.provider}~${board.token}~${id}`;
}

// ---------- Greenhouse: https://developers.greenhouse.io/job-board.html (no pagination) ----------
interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  first_published?: string | null;
  content?: string;
}

export async function fetchGreenhouse(board: Board, now: string): Promise<Job[]> {
  const data = (await safeFetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs?content=true`,
  )) as { jobs?: GhJob[] };
  return (data.jobs ?? []).map((j) => {
    const location = j.location?.name?.trim() || "Not specified";
    const remote = remoteFromText(location);
    return {
      id: jobId(board, j.id),
      provider: "greenhouse",
      company: board.company,
      title: j.title.trim(),
      // Greenhouse returns entity-escaped HTML.
      description: htmlToText(decodeEntities(j.content ?? "")),
      location,
      remote,
      remoteWorldwide: remote === "remote" && WORLDWIDE_RE.test(location),
      employmentType: null,
      salary: null,
      sourceUrl: j.absolute_url,
      applyUrl: j.absolute_url,
      publishedAt: j.first_published ?? null,
      lastChecked: now,
    };
  });
}

// ---------- Lever: https://github.com/lever/postings-api (skip/limit pagination) ----------
interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl: string;
  createdAt?: number;
  workplaceType?: string;
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  categories?: { commitment?: string; location?: string; allLocations?: string[] };
  salaryRange?: { min: number; max: number; currency: string; interval: string };
}

const LEVER_PAGE = 100;
const LEVER_MAX_PAGES = 10;

export async function fetchLever(board: Board, now: string): Promise<Job[]> {
  const all: LeverJob[] = [];
  for (let page = 0; page < LEVER_MAX_PAGES; page++) {
    const batch = (await safeFetchJson(
      `https://api.lever.co/v0/postings/${board.token}?mode=json&skip=${page * LEVER_PAGE}&limit=${LEVER_PAGE}`,
    )) as LeverJob[];
    if (!Array.isArray(batch)) break;
    all.push(...batch);
    if (batch.length < LEVER_PAGE) break;
  }
  return all.map((j) => {
    const locations = j.categories?.allLocations?.length ? j.categories.allLocations : [j.categories?.location ?? ""];
    const location = locations.filter(Boolean).join(" · ") || "Not specified";
    const wp = (j.workplaceType ?? "").toLowerCase();
    const remote: RemoteStatus =
      wp === "remote" ? "remote" : wp === "hybrid" ? "hybrid" : wp === "on-site" ? "onsite" : remoteFromText(location);
    const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
    const s = j.salaryRange;
    return {
      id: jobId(board, j.id),
      provider: "lever",
      company: board.company,
      title: j.text.trim(),
      description: [j.descriptionPlain ?? "", lists, j.additionalPlain ?? ""].filter(Boolean).join("\n\n").trim(),
      location,
      remote,
      remoteWorldwide: remote === "remote" && WORLDWIDE_RE.test(location),
      employmentType: j.categories?.commitment ?? null,
      salary: s ? `${s.currency} ${s.min.toLocaleString("en-US")}–${s.max.toLocaleString("en-US")} ${s.interval}` : null,
      sourceUrl: j.hostedUrl,
      applyUrl: j.applyUrl || j.hostedUrl,
      publishedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      lastChecked: now,
    };
  });
}

// ---------- Ashby: https://developers.ashbyhq.com/docs/public-job-posting-api (no pagination) ----------
interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location: string }[];
  isRemote?: boolean;
  isListed?: boolean;
  workplaceType?: string | null;
  employmentType?: string | null;
  publishedAt?: string | null;
  jobUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensation?: { compensationTierSummary?: string | null; scrapeableCompensationSalarySummary?: string | null };
}

const ASHBY_EMPLOYMENT: Record<string, string> = {
  FullTime: "Full-time",
  PartTime: "Part-time",
  Intern: "Internship",
  Contract: "Contract",
  Temporary: "Temporary",
};

export async function fetchAshby(board: Board, now: string): Promise<Job[]> {
  const data = (await safeFetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${board.token}?includeCompensation=true`,
  )) as { jobs?: AshbyJob[] };
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const location =
        [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean).join(" · ") ||
        "Not specified";
      const wp = (j.workplaceType ?? "").toLowerCase();
      const remote: RemoteStatus =
        wp === "remote" || (!wp && j.isRemote)
          ? "remote"
          : wp === "hybrid"
            ? "hybrid"
            : wp === "onsite"
              ? "onsite"
              : remoteFromText(location);
      return {
        id: jobId(board, j.id),
        provider: "ashby",
        company: board.company,
        title: j.title.trim(),
        description: (j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? "")).trim(),
        location,
        remote,
        remoteWorldwide: remote === "remote" && WORLDWIDE_RE.test(location),
        employmentType: j.employmentType ? (ASHBY_EMPLOYMENT[j.employmentType] ?? j.employmentType) : null,
        salary:
          j.compensation?.scrapeableCompensationSalarySummary || j.compensation?.compensationTierSummary || null,
        sourceUrl: j.jobUrl,
        applyUrl: j.applyUrl || j.jobUrl,
        publishedAt: j.publishedAt ?? null,
        lastChecked: now,
      };
    });
}

function money(min?: number | null, max?: number | null, currency?: string | null, period?: string | null) {
  if (!min && !max) return null;
  const n = (v?: number | null) => (v ? v.toLocaleString("en-US") : "");
  const range = min && max && min !== max ? `${n(min)}–${n(max)}` : n(min || max);
  return [currency, range, period].filter(Boolean).join(" ");
}

function isoOrNull(v: string | number | null | undefined, unit: "s" | "iso" = "iso") {
  if (v === null || v === undefined || v === "") return null;
  const d = unit === "s" ? new Date(Number(v) * 1000) : new Date(String(v).replace(" UTC", "Z"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------- Workable: public widget API, one company per board ----------
interface WorkableJob {
  title: string;
  shortcode: string;
  employment_type?: string;
  telecommuting?: boolean;
  url: string;
  application_url?: string;
  published_on?: string;
  city?: string;
  state?: string;
  country?: string;
  description?: string;
}

export async function fetchWorkable(board: Board, now: string): Promise<Job[]> {
  const data = (await safeFetchJson(`https://apply.workable.com/api/v1/widget/accounts/${board.token}?details=true`)) as { jobs?: WorkableJob[] };
  return (data.jobs ?? []).map((j) => {
    const place = [j.city, j.state, j.country].filter(Boolean).join(", ") || "Not specified";
    const remote: RemoteStatus = j.telecommuting ? "remote" : remoteFromText(`${j.title} ${place}`);
    const location = j.telecommuting && !/remote/i.test(place) ? `Remote · ${place}` : place;
    return {
      id: jobId(board, j.shortcode),
      provider: "workable",
      company: board.company,
      title: j.title.trim(),
      description: htmlToText(j.description ?? ""),
      location,
      remote,
      remoteWorldwide: remote === "remote" && WORLDWIDE_RE.test(`${j.title} ${location}`),
      employmentType: j.employment_type || null,
      salary: null,
      sourceUrl: j.url,
      applyUrl: j.application_url || j.url,
      publishedAt: isoOrNull(j.published_on),
      lastChecked: now,
    };
  });
}

// ---------- Recruitee: https://<company>.recruitee.com/api/offers ----------
interface RecruiteeOffer {
  id: number;
  title: string;
  status?: string;
  careers_url: string;
  careers_apply_url?: string;
  location?: string;
  remote?: boolean;
  hybrid?: boolean;
  on_site?: boolean;
  published_at?: string;
  employment_type_code?: string;
  description?: string;
  requirements?: string;
  salary?: { min?: number | null; max?: number | null; currency?: string | null; period?: string | null };
}

export async function fetchRecruitee(board: Board, now: string): Promise<Job[]> {
  const data = (await safeFetchJson(`https://${board.token}.recruitee.com/api/offers/`)) as { offers?: RecruiteeOffer[] };
  return (data.offers ?? [])
    .filter((o) => !o.status || o.status === "published")
    .map((o) => {
      const location = o.location?.trim() || "Not specified";
      const remote: RemoteStatus = o.remote ? "remote" : o.hybrid ? "hybrid" : o.on_site ? "onsite" : remoteFromText(location);
      return {
        id: jobId(board, o.id),
        provider: "recruitee",
        company: board.company,
        title: o.title.trim(),
        description: htmlToText(`${o.description ?? ""}\n${o.requirements ?? ""}`),
        location,
        remote,
        remoteWorldwide: remote === "remote" && WORLDWIDE_RE.test(location),
        employmentType: o.employment_type_code ? o.employment_type_code.replace(/_/g, " ") : null,
        salary: money(o.salary?.min, o.salary?.max, o.salary?.currency, o.salary?.period),
        sourceUrl: o.careers_url,
        applyUrl: o.careers_apply_url || o.careers_url,
        publishedAt: isoOrNull(o.published_at),
        lastChecked: now,
      };
    });
}

// ---------- Himalayas: https://himalayas.app/api — credit + unchanged applicationLink required ----------
interface HimalayasJob {
  title: string;
  companyName: string;
  employmentType?: string;
  minSalary?: number | null;
  maxSalary?: number | null;
  currency?: string | null;
  salaryPeriod?: string | null;
  locationRestrictions?: string[];
  description?: string;
  pubDate?: number;
  expiryDate?: number;
  applicationLink: string;
  guid: string;
}

const HIMALAYAS_PAGES = 5; // 20 jobs per page (API maximum)

export async function fetchHimalayas(board: Board, now: string): Promise<Job[]> {
  const all: HimalayasJob[] = [];
  let cursor = "";
  for (let page = 0; page < HIMALAYAS_PAGES; page++) {
    const data = (await safeFetchJson(`https://himalayas.app/jobs/api?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)) as {
      jobs?: HimalayasJob[];
      nextCursor?: string | null;
    };
    all.push(...(data.jobs ?? []));
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
  }
  const nowS = Date.now() / 1000;
  return all
    .filter((j) => !j.expiryDate || j.expiryDate > nowS)
    .map((j) => {
      const places = j.locationRestrictions ?? [];
      return {
        // guid is the job's URL (/companies/<co>/jobs/<slug>); the whole path keeps ids unique across companies.
        id: jobId(board, j.guid.replace(/^https?:\/\/[^/]+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")),
        provider: "himalayas",
        company: j.companyName,
        title: j.title.trim(),
        description: htmlToText(j.description ?? ""),
        // Himalayas lists only remote jobs; no restriction means open worldwide.
        location: places.length ? `Remote · ${places.join(", ")}` : "Remote · Worldwide",
        remote: "remote",
        remoteWorldwide: places.length === 0,
        employmentType: j.employmentType || null,
        salary: money(j.minSalary, j.maxSalary, j.currency, j.salaryPeriod),
        sourceUrl: j.guid,
        applyUrl: j.applicationLink,
        publishedAt: isoOrNull(j.pubDate, "s"),
        lastChecked: now,
      };
    });
}

// ---------- Jobicy: https://jobicy.com/jobs-rss-feed — credit required, sync at most hourly ----------
interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobType?: string[];
  jobGeo?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}

export async function fetchJobicy(board: Board, now: string): Promise<Job[]> {
  const data = (await safeFetchJson("https://jobicy.com/api/v2/remote-jobs?count=100")) as { jobs?: JobicyJob[] };
  return (data.jobs ?? []).map((j) => {
    const geo = j.jobGeo?.trim() || "";
    return {
      id: jobId(board, j.id),
      provider: "jobicy",
      company: decodeEntities(j.companyName),
      title: decodeEntities(j.jobTitle).trim(),
      description: htmlToText(j.jobDescription ?? ""),
      location: geo ? `Remote · ${geo}` : "Remote · Not specified",
      remote: "remote",
      remoteWorldwide: WORLDWIDE_RE.test(geo),
      employmentType: j.jobType?.join(", ") || null,
      salary: money(j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryPeriod),
      sourceUrl: j.url,
      // Free API: applications must go through the Jobicy page.
      applyUrl: j.url,
      publishedAt: isoOrNull(j.pubDate),
      lastChecked: now,
    };
  });
}

// ---------- Remote OK: https://remoteok.com/api — first item is the legal notice; link back required ----------
interface RemoteOkJob {
  id?: string;
  date?: string;
  company?: string;
  position?: string;
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
}

export async function fetchRemoteOk(board: Board, now: string): Promise<Job[]> {
  const data = (await safeFetchJson("https://remoteok.com/api")) as RemoteOkJob[];
  return (Array.isArray(data) ? data : [])
    .filter((j) => j.id && j.position && j.url)
    .map((j) => {
      const place = j.location?.trim() || "";
      return {
        id: jobId(board, j.id!),
        provider: "remoteok",
        company: decodeEntities(j.company ?? "Unknown company"),
        title: decodeEntities(j.position!).trim(),
        description: htmlToText(j.description ?? ""),
        location: place ? `Remote · ${place}` : "Remote · Not specified",
        remote: "remote",
        // An empty location is not proof of worldwide hiring.
        remoteWorldwide: WORLDWIDE_RE.test(place),
        employmentType: null,
        salary: money(j.salary_min, j.salary_max, "USD", "per year"),
        sourceUrl: j.url!,
        applyUrl: j.url!,
        publishedAt: isoOrNull(j.date),
        lastChecked: now,
      };
    });
}

// ---------- Arbeitnow: https://www.arbeitnow.com/api/job-board-api (mostly Europe) ----------
interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote?: boolean;
  url: string;
  job_types?: string[];
  location?: string;
  created_at?: number;
}

export async function fetchArbeitnow(board: Board, now: string): Promise<Job[]> {
  const data = (await safeFetchJson("https://www.arbeitnow.com/api/job-board-api")) as { data?: ArbeitnowJob[] };
  return (data.data ?? []).map((j) => {
    const place = j.location?.trim() || "Not specified";
    const remote: RemoteStatus = j.remote ? "remote" : remoteFromText(place);
    return {
      id: jobId(board, j.slug),
      provider: "arbeitnow",
      company: j.company_name,
      title: j.title.trim(),
      description: htmlToText(j.description ?? ""),
      location: remote === "remote" && !/remote/i.test(place) ? `Remote · ${place}` : place,
      remote,
      remoteWorldwide: remote === "remote" && WORLDWIDE_RE.test(place),
      employmentType: j.job_types?.join(", ") || null,
      salary: null,
      sourceUrl: j.url,
      applyUrl: j.url,
      publishedAt: isoOrNull(j.created_at, "s"),
      lastChecked: now,
    };
  });
}

/** Every job's links must be plain http(s); anything else (e.g. `javascript:`) drops the job. */
function withSafeLinks(jobs: Job[]): Job[] {
  return jobs.flatMap((j) => {
    const sourceUrl = httpUrl(j.sourceUrl);
    const applyUrl = httpUrl(j.applyUrl) ?? sourceUrl;
    return sourceUrl && applyUrl ? [{ ...j, sourceUrl, applyUrl }] : [];
  });
}

export function fetchBoard(board: Board): Promise<Job[]> {
  return fetchBoardRaw(board).then(withSafeLinks);
}

function fetchBoardRaw(board: Board): Promise<Job[]> {
  if (!TOKEN_RE.test(board.token)) return Promise.reject(new Error("Invalid board token"));
  const now = new Date().toISOString();
  switch (board.provider) {
    case "greenhouse":
      return fetchGreenhouse(board, now);
    case "lever":
      return fetchLever(board, now);
    case "ashby":
      return fetchAshby(board, now);
    case "workable":
      return fetchWorkable(board, now);
    case "recruitee":
      return fetchRecruitee(board, now);
    case "himalayas":
      return fetchHimalayas(board, now);
    case "jobicy":
      return fetchJobicy(board, now);
    case "remoteok":
      return fetchRemoteOk(board, now);
    case "arbeitnow":
      return fetchArbeitnow(board, now);
  }
}
