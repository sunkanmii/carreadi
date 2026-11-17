import { afterEach, describe, expect, it, vi } from "vitest";
import { importJobLink, parseJobPage, postingId, publicHttpUrl } from "../lib/jobs/link";

afterEach(() => vi.unstubAllGlobals());

describe("job links", () => {
  it("finds the posting id in applicant-tracking links", () => {
    expect(postingId("ashby", new URL("https://jobs.ashbyhq.com/Serval/a6cb109f-143d-4b46-b77a-1f1cb622a62b"))).toBe("a6cb109f-143d-4b46-b77a-1f1cb622a62b");
    expect(postingId("greenhouse", new URL("https://job-boards.greenhouse.io/acme/jobs/12345"))).toBe("12345");
    expect(postingId("lever", new URL("https://jobs.lever.co/acme/abc-123/apply"))).toBe("abc-123");
    expect(postingId("workable", new URL("https://apply.workable.com/acme/j/AB12CD/"))).toBe("AB12CD");
    expect(postingId("ashby", new URL("https://jobs.ashbyhq.com/Serval"))).toBeNull();
  });

  it("never fetches local or raw-IP links", () => {
    for (const bad of ["http://localhost/x", "http://127.0.0.1/", "http://[::1]/", "https://intranet/", "https://a.internal/", "https://x.com:8080/", "file:///etc/passwd", "https://u:p@site.com/"]) {
      expect(publicHttpUrl(bad)).toBeNull();
    }
    expect(publicHttpUrl("https://careers.example.com/jobs/1")).not.toBeNull();
  });

  it("reads structured JobPosting data from a page", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@graph": [{ "@type": "Organization" }, {
        "@type": "JobPosting", title: "Data Analyst", hiringOrganization: { name: "Acme" }, jobLocationType: "TELECOMMUTE",
        jobLocation: { address: { addressLocality: "Lagos", addressCountry: "NG" } },
        description: "<p>We need someone who knows SQL &amp; Python.</p><ul><li>Build dashboards</li></ul>" + "<p>More detail.</p>".repeat(10),
      }],
    })}</script></head><body>nav</body></html>`;
    const j = parseJobPage(html, "https://acme.com/jobs/1");
    expect(j).toMatchObject({ title: "Data Analyst", company: "Acme", location: "Remote · Lagos, NG" });
    expect(j.description).toContain("SQL & Python");
    expect(j.description).toContain("• Build dashboards");
  });

  it("refuses a page with no job on it", () => {
    expect(() => parseJobPage("<html><body><p>Hello</p></body></html>", "https://a.com")).toThrow(/couldn't find a job description/);
  });

  it("gets one Ashby job from its page, never the whole board", async () => {
    const id = "a6cb109f-143d-4b46-b77a-1f1cb622a62b";
    const posting = { "@type": "JobPosting", title: "Software Engineer, Frontend", hiringOrganization: { name: "Serval" },
      jobLocation: { "@type": "Place", address: { addressLocality: "San Francisco", addressCountry: "United States" } },
      description: "<p>Build the product UI.</p>".repeat(20) };
    const fetchMock = vi.fn(async (u: URL | string) => {
      expect(String(u)).toBe(`https://jobs.ashbyhq.com/Serval/${id}`);
      return new Response(`<html><script type="application/ld+json">${JSON.stringify(posting)}</script></html>`, { headers: { "content-type": "text/html" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const j = await importJobLink(`https://jobs.ashbyhq.com/Serval/${id}`);
    expect(j).toMatchObject({ title: "Software Engineer, Frontend", company: "Serval", location: "San Francisco, United States" });
    expect(j.description).toContain("Build the product UI.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads one Greenhouse job from its single-job API", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: URL | string) => {
      expect(String(u)).toBe("https://boards-api.greenhouse.io/v1/boards/acme/jobs/123");
      return Response.json({ title: "Analyst", company_name: "Acme Inc", location: { name: "Lagos" }, absolute_url: "https://job-boards.greenhouse.io/acme/jobs/123", content: "&lt;p&gt;" + "Analyse data. ".repeat(20) + "&lt;/p&gt;" });
    }));
    const j = await importJobLink("https://job-boards.greenhouse.io/acme/jobs/123");
    expect(j).toMatchObject({ title: "Analyst", company: "Acme Inc", location: "Lagos" });
    expect(j.description).toContain("Analyse data.");
  });

  it("stops at a redirect to a private address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } })));
    await expect(importJobLink("https://careers.example.com/jobs/1")).rejects.toThrow(/redirects somewhere/);
  });

  it("asks for one job when given a whole careers page", async () => {
    await expect(importJobLink("https://jobs.ashbyhq.com/Serval")).rejects.toThrow(/whole careers page/);
  });
});
