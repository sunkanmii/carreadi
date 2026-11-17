import { decodeEntities, htmlToText } from "../html";
import type { Board } from "../types";
import { httpUrl } from "../url";
import { BOARDS } from "./boards";
import { detectBoard } from "./detect";

/** The job a pasted link points to, as text ready to check. */
export interface LinkedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
}

export class JobLinkError extends Error {}

const MAX_HTML = 1_000_000;
const MAX_TEXT = 25_000;
const TIMEOUT_MS = 10_000;

/** The posting's own id in an applicant-tracking link, or null for a whole careers page. */
export function postingId(provider: Board["provider"], u: URL): string | null {
  const parts = u.pathname.split("/").filter(Boolean);
  switch (provider) {
    case "greenhouse": {
      const i = parts.indexOf("jobs");
      return (i >= 0 ? parts[i + 1] : null) ?? u.searchParams.get("token") ?? u.searchParams.get("gh_jid");
    }
    case "lever":
    case "ashby":
      return parts[1] ?? null;
    case "workable": {
      const i = parts.indexOf("j");
      return i >= 0 ? (parts[i + 1] ?? null) : null;
    }
    case "recruitee": {
      const i = parts.indexOf("o");
      return i >= 0 ? (parts[i + 1] ?? null) : null;
    }
    default:
      return null;
  }
}

const pretty = (token: string) =>
  token.replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();


/** Links that name an outside host we must never fetch: local names, raw IP addresses, odd ports. */
export function publicHttpUrl(raw: string): URL | null {
  const href = httpUrl(raw);
  if (!href) return null;
  const u = new URL(href);
  const host = u.hostname.toLowerCase();
  if (u.username || u.password) return null;
  if (u.port && u.port !== "443" && u.port !== "80") return null;
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost" || host.endsWith(".localhost")) return null;
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) return null;
  return u;
}

export async function fetchPage(start: URL): Promise<{ html: string; url: URL }> {
  let url = start;
  // Follow a few redirects by hand, checking every hop, so a link can't bounce us somewhere private.
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 (compatible; Carreadi/1.0; +https://carreadi.naijabukana.com)" },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = publicHttpUrl(new URL(res.headers.get("location") ?? "", url).href);
      if (!next) throw new JobLinkError("That link redirects somewhere we can't open.");
      url = next;
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 999) throw new JobLinkError("That site doesn't let us read its jobs. Copy the job description and paste it instead.");
    if (!res.ok) throw new JobLinkError("We couldn't open that link. Check it, or paste the job description instead.");
    if (!/html|xml/i.test(res.headers.get("content-type") ?? "")) throw new JobLinkError("That link isn't a job page. Paste the job description instead.");
    const html = (await res.text()).slice(0, MAX_HTML);
    return { html, url };
  }
  throw new JobLinkError("That link redirects too many times.");
}

type Ld = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? decodeEntities(v).trim() : "");

function findPosting(node: unknown): Ld | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const o = node as Ld;
  const type = o["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return o;
  return findPosting(o["@graph"]);
}

function placeOf(p: Ld): string {
  const locs = Array.isArray(p.jobLocation) ? p.jobLocation : p.jobLocation ? [p.jobLocation] : [];
  const names = locs.map((l) => {
    const a = (l as Ld)?.address as Ld | string | undefined;
    if (typeof a === "string") return a;
    return a ? [a.addressLocality, a.addressRegion, a.addressCountry].map((x) => (typeof x === "string" ? x : str((x as Ld)?.name))).filter(Boolean).join(", ") : "";
  }).filter(Boolean);
  const remote = /TELECOMMUTE/i.test(String(p.jobLocationType ?? ""));
  return [remote ? "Remote" : "", ...new Set(names)].filter(Boolean).join(" · ") || "Not specified";
}

/** Reads a job page: its structured JobPosting data if it has one, otherwise the page text. */
export function parseJobPage(html: string, url: string, ld?: string[]): LinkedJob {
  const blocks = ld ?? [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block.trim());
    } catch {
      continue;
    }
    const p = findPosting(data);
    if (!p) continue;
    const description = htmlToText(decodeEntities(String(p.description ?? ""))).slice(0, MAX_TEXT);
    if (description.length < 100) continue;
    const org = p.hiringOrganization as Ld | string | undefined;
    return {
      title: str(p.title) || "Job",
      company: typeof org === "string" ? str(org) : str(org?.name),
      location: placeOf(p),
      url,
      description,
    };
  }
  const meta = (name: string) =>
    str(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)`, "i"))?.[1]);
  const title = meta("og:title") || str(html.match(/<title[^>]*>([^<]*)/i)?.[1]);
  const body = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  const description = htmlToText(body.replace(/<(nav|header|footer|form|noscript)[\s\S]*?<\/\1>/gi, "")).slice(0, MAX_TEXT);
  if (description.length < 300) {
    throw new JobLinkError("We couldn't find a job description on that page. Copy it and paste it here instead.");
  }
  return { title: title || "Job", company: meta("og:site_name"), location: "", url, description };
}

/**
 * The page's JSON-LD blocks, found by Cloudflare's built-in HTML parser. Scanning a whole page with
 * regular expressions costs too much CPU for one request on Workers. Elsewhere (tests) returns undefined.
 */
async function ldBlocks(html: string): Promise<string[] | undefined> {
  const Rewriter = (globalThis as { HTMLRewriter?: typeof HTMLRewriter }).HTMLRewriter;
  if (!Rewriter) return undefined;
  const blocks: string[] = [];
  let current = "";
  await new Rewriter()
    .on('script[type="application/ld+json"]', {
      text(t) {
        current += t.text;
        if (t.lastInTextNode) (blocks.push(current), (current = ""));
      },
    })
    .transform(new Response(html))
    .arrayBuffer();
  return blocks;
}

async function apiJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { headers: { accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
}

/**
 * One posting from the applicant-tracking systems that serve single jobs as JSON. Whole boards
 * can be close to a megabyte, too much to parse inside one request, so we never load them here.
 */
async function fromAts(provider: Board["provider"], token: string, id: string, company: string): Promise<LinkedJob | null> {
  const enc = encodeURIComponent;
  if (provider === "greenhouse" && /^\d+$/.test(id)) {
    const j = await apiJson(`https://boards-api.greenhouse.io/v1/boards/${enc(token)}/jobs/${id}`);
    if (!j) return null;
    return {
      title: str(j.title), company: str(j.company_name) || company,
      location: str((j.location as Ld | undefined)?.name), url: httpUrl(j.absolute_url) ?? "",
      description: htmlToText(decodeEntities(String(j.content ?? ""))).slice(0, MAX_TEXT),
    };
  }
  if (provider === "lever") {
    const j = await apiJson(`https://api.lever.co/v0/postings/${enc(token)}/${enc(id)}`);
    if (!j) return null;
    const lists = ((j.lists as { text: string; content: string }[] | undefined) ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`);
    const cat = (j.categories ?? {}) as Ld;
    return {
      title: str(j.text), company, location: str(cat.location), url: httpUrl(j.hostedUrl) ?? "",
      description: [str(j.descriptionPlain), ...lists, str(j.additionalPlain)].filter(Boolean).join("\n\n").slice(0, MAX_TEXT),
    };
  }
  return null;
}

/** Gets the details of the one job a link points to. */
export async function importJobLink(raw: string): Promise<LinkedJob> {
  const u = publicHttpUrl(raw);
  if (!u) throw new JobLinkError("That doesn't look like a job link. It should start with https://");

  const board = detectBoard(u.href);
  let company = "";
  if (board) {
    const id = postingId(board.provider, u);
    if (!id) throw new JobLinkError("That's a whole careers page. Open one job and paste its link.");
    company = BOARDS.find((b) => b.provider === board.provider && b.token === board.token)?.company ?? pretty(board.token);
    try {
      const hit = await fromAts(board.provider, board.token, id, company);
      if (hit && hit.url && hit.description.length >= 100) return hit;
    } catch {
      // Fall through to reading the page itself.
    }
  }

  const page = await fetchPage(u);
  const job = parseJobPage(page.html, page.url.href, await ldBlocks(page.html));
  return { ...job, company: job.company || company };
}

/** The job as text for the check, in the same shape as a job picked from the list. */
export function linkedJobText(j: LinkedJob): string {
  const head = [j.company ? `${j.title} at ${j.company}` : j.title, j.location && `Location: ${j.location}`, `Link: ${j.url}`];
  return `${head.filter(Boolean).join("\n")}\n\n${j.description}`;
}
