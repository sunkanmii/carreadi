import { afterEach, describe, expect, it, vi } from "vitest";
import { htmlToText } from "@/lib/html";
import { filterJobs } from "@/lib/jobs";
import { fetchBoard, safeFetchJson } from "@/lib/jobs/providers";
import { EMPLOYER_SOURCES, parseSources, type Job } from "@/lib/types";
import { safeHref } from "@/lib/url";

function mockFetch(handler: (url: string) => unknown) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (u: URL | string) => {
    const url = String(u);
    calls.push(url);
    return new Response(JSON.stringify(handler(url)), { status: 200 });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("htmlToText", () => {
  it("drops scripts and tags and decodes entities", () => {
    const t = htmlToText('<p>Build &amp; ship</p><script>alert(1)</script><ul><li>Go</li><li>SQL</li></ul><img src=x onerror=alert(1)>');
    expect(t).toBe("Build & ship\n\n• Go\n• SQL");
    expect(t).not.toMatch(/alert|<|onerror/);
  });
});

describe("safeFetchJson", () => {
  it("blocks hosts outside the allowlist and non-https", async () => {
    await expect(safeFetchJson("https://evil.example.com/x")).rejects.toThrow(/Blocked/);
    await expect(safeFetchJson("http://api.lever.co/v0/postings/x")).rejects.toThrow(/Blocked/);
  });
});

describe("Greenhouse adapter", () => {
  it("normalizes escaped HTML, dates and remote status", async () => {
    mockFetch(() => ({
      jobs: [
        {
          id: 1,
          title: " Backend Engineer ",
          absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1",
          location: { name: "Remote - US" },
          first_published: "2026-09-24T17:26:49-04:00",
          updated_at: "2026-10-20T00:00:00Z",
          content: "&lt;p&gt;Use &lt;b&gt;Python&lt;/b&gt;&lt;/p&gt;",
        },
        { id: 2, title: "Designer", absolute_url: "https://x/2", location: { name: "Dublin" }, content: "" },
      ],
    }));
    const jobs = await fetchBoard({ provider: "greenhouse", token: "acme", company: "Acme" });
    expect(jobs[0]).toMatchObject({
      id: "greenhouse~acme~1",
      title: "Backend Engineer",
      description: "Use Python",
      remote: "remote",
      remoteWorldwide: false,
      publishedAt: "2026-09-24T17:26:49-04:00",
      salary: null,
    });
    // No publication date given -> none invented (updated_at is not a publish date).
    expect(jobs[1].publishedAt).toBeNull();
    expect(jobs[1].remote).toBe("unknown");
  });
});

describe("Lever adapter", () => {
  it("paginates with skip/limit until a short page", async () => {
    const page = (n: number, offset: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `id${offset + i}`,
        text: "Engineer",
        hostedUrl: "https://jobs.lever.co/a/1",
        applyUrl: "https://jobs.lever.co/a/1/apply",
        createdAt: 1792767640768,
        workplaceType: "remote",
        categories: { commitment: "Full-time", location: "Anywhere" },
        salaryRange: { min: 100000, max: 120000, currency: "USD", interval: "per-year-salary" },
      }));
    const calls = mockFetch((url) => (url.includes("skip=0") ? page(100, 0) : page(5, 100)));
    const jobs = await fetchBoard({ provider: "lever", token: "acme", company: "Acme" });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("skip=100");
    expect(jobs).toHaveLength(105);
    expect(jobs[0]).toMatchObject({
      remote: "remote",
      remoteWorldwide: true,
      employmentType: "Full-time",
      salary: "USD 100,000–120,000 per-year-salary",
      publishedAt: new Date(1792767640768).toISOString(),
    });
  });
});

describe("Ashby adapter", () => {
  it("keeps region-restricted remote jobs restricted and hides unlisted jobs", async () => {
    mockFetch(() => ({
      jobs: [
        {
          id: "a",
          title: "Product Engineer",
          location: "Europe",
          isRemote: true,
          isListed: true,
          workplaceType: "Remote",
          employmentType: "FullTime",
          publishedAt: "2021-04-27T20:13:45.158+00:00",
          jobUrl: "https://jobs.ashbyhq.com/acme/a",
          applyUrl: "https://jobs.ashbyhq.com/acme/a/application",
          descriptionPlain: "TypeScript and React",
          compensation: { scrapeableCompensationSalarySummary: "€80K – €100K" },
        },
        { id: "b", title: "Hidden", isListed: false, jobUrl: "https://x" },
      ],
    }));
    const jobs = await fetchBoard({ provider: "ashby", token: "acme", company: "Acme" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ remote: "remote", remoteWorldwide: false, employmentType: "Full-time", salary: "€80K – €100K" });
  });

  it("rejects malformed board tokens", async () => {
    await expect(fetchBoard({ provider: "ashby", token: "../etc", company: "x" })).rejects.toThrow();
  });
});

describe("link safety", () => {
  it("drops jobs whose links aren't http(s) and falls back to the source link for a bad apply link", async () => {
    mockFetch(() => [
      { legal: "x" },
      { id: "1", position: "Evil", company: "X", url: "javascript:alert(document.cookie)" },
      { id: "2", position: "Fine", company: "Y", url: "https://remoteok.com/remote-jobs/2" },
    ]);
    const jobs = await fetchBoard({ provider: "remoteok", token: "remote", company: "Remote OK" });
    expect(jobs.map((j) => j.title)).toEqual(["Fine"]);
  });
  it("safeHref neutralises script URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
    expect(safeHref(" data:text/html,<b>x</b>")).toBe("#");
    expect(safeHref("https://jobs.example/apply?x=1")).toBe("https://jobs.example/apply?x=1");
  });
});

describe("job sources", () => {
  it("defaults to employer career pages and ignores unknown names", () => {
    expect(parseSources(null)).toEqual(EMPLOYER_SOURCES);
    expect(parseSources("himalayas,evil,greenhouse")).toEqual(["himalayas", "greenhouse"]);
    expect(parseSources("evil")).toEqual(EMPLOYER_SOURCES);
  });
  it("filters jobs to the chosen sources", () => {
    const mk = (id: string, provider: Job["provider"]) => ({ id, provider }) as Job;
    const jobs = [mk("a", "greenhouse"), mk("b", "himalayas"), mk("c", "remoteok")];
    expect(filterJobs(jobs, { sources: EMPLOYER_SOURCES }).map((j) => j.id)).toEqual(["a"]);
    expect(filterJobs(jobs, { sources: ["greenhouse", "himalayas"] }).map((j) => j.id)).toEqual(["a", "b"]);
  });
});

describe("safeFetchJson subdomains", () => {
  it("allows a company's Recruitee subdomain but not lookalikes", async () => {
    mockFetch(() => ({}));
    await expect(safeFetchJson("https://bunq.recruitee.com/api/offers/")).resolves.toEqual({});
    await expect(safeFetchJson("https://evilrecruitee.com/api")).rejects.toThrow(/Blocked/);
    await expect(safeFetchJson("https://a.b.recruitee.com/api")).rejects.toThrow(/Blocked/);
  });
});

describe("aggregator adapters", () => {
  it("Himalayas: follows the cursor, keeps the apply link, treats no restriction as worldwide, drops expired", async () => {
    const future = Date.now() / 1000 + 86400;
    const calls = mockFetch((url) =>
      url.includes("cursor=")
        ? { jobs: [{ title: "Writer", companyName: "Doc Co", applicationLink: "https://x.example/apply", guid: "https://himalayas.app/companies/doc-co/jobs/writer", locationRestrictions: [], pubDate: 1793500000, expiryDate: future }] }
        : {
            nextCursor: "abc",
            jobs: [
              { title: "PM", companyName: "Acme", applicationLink: "https://acme.example/apply", guid: "https://himalayas.app/companies/acme/jobs/pm", locationRestrictions: ["United States"], expiryDate: future },
              { title: "Old", companyName: "Gone", applicationLink: "https://g.example", guid: "https://himalayas.app/companies/gone/jobs/old", expiryDate: 1 },
            ],
          },
    );
    const jobs = await fetchBoard({ provider: "himalayas", token: "remote", company: "Himalayas" });
    expect(calls).toHaveLength(2);
    expect(jobs.map((j) => j.title)).toEqual(["PM", "Writer"]);
    expect(jobs[0]).toMatchObject({ company: "Acme", remoteWorldwide: false, location: "Remote · United States", applyUrl: "https://acme.example/apply" });
    expect(jobs[1]).toMatchObject({ remoteWorldwide: true, id: "himalayas~remote~companies-doc-co-jobs-writer", publishedAt: new Date(1793500000 * 1000).toISOString() });
  });

  it("Remote OK: skips the legal-notice item and never assumes an empty location is worldwide", async () => {
    mockFetch(() => [
      { legal: "API Terms of Service" },
      { id: "1", position: "Dev &amp; Ops", company: "Co", location: "", url: "https://remoteok.com/remote-jobs/1", description: "<p>Hi</p>", salary_min: 80000, salary_max: 100000 },
      { id: "2", position: "Writer", company: "Co", location: "Worldwide", url: "https://remoteok.com/remote-jobs/2" },
    ]);
    const jobs = await fetchBoard({ provider: "remoteok", token: "remote", company: "Remote OK" });
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ title: "Dev & Ops", remoteWorldwide: false, applyUrl: "https://remoteok.com/remote-jobs/1", salary: "USD 80,000–100,000 per year" });
    expect(jobs[1].remoteWorldwide).toBe(true);
  });

  it("Jobicy: sends applicants to the Jobicy page and reads 'Anywhere' as worldwide", async () => {
    mockFetch(() => ({ jobs: [{ id: 9, url: "https://jobicy.com/jobs/9-x", jobTitle: "Editor", companyName: "Pub", jobGeo: "Anywhere", jobType: ["Full-Time"] }] }));
    const [j] = await fetchBoard({ provider: "jobicy", token: "remote", company: "Jobicy" });
    expect(j).toMatchObject({ applyUrl: "https://jobicy.com/jobs/9-x", remoteWorldwide: true, employmentType: "Full-Time" });
  });
});

describe("filterJobs", () => {
  const base = { provider: "ashby", company: "Acme", description: "", employmentType: "Full-time", salary: null, sourceUrl: "", applyUrl: "", publishedAt: null, lastChecked: "" } as const;
  const jobs: Job[] = [
    { ...base, id: "1", title: "Backend Engineer", location: "Remote - US", remote: "remote", remoteWorldwide: false },
    { ...base, id: "2", title: "Backend Engineer", location: "Remote (Worldwide)", remote: "remote", remoteWorldwide: true },
    { ...base, id: "3", title: "Product Designer", location: "Berlin, Germany", remote: "onsite", remoteWorldwide: false },
  ];
  it("does not treat region-restricted remote jobs as available elsewhere", () => {
    expect(filterJobs(jobs, { location: "Germany" }).map((j) => j.id)).toEqual(["2", "3"]);
  });
  it("filters by career path and remote", () => {
    expect(filterJobs(jobs, { path: "design" }).map((j) => j.id)).toEqual(["3"]);
    expect(filterJobs(jobs, { remote: "remote" }).map((j) => j.id)).toEqual(["1", "2"]);
  });
});
