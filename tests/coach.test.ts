import { afterEach, describe, expect, it, vi } from "vitest";
import { checkProof, stepGuide } from "../lib/analysis/coach";
import { cvBlocks, cvDocxBytes } from "../lib/client/export";
import { proofText } from "../lib/proof";
import { buildRoadmap } from "../lib/roadmap";
import type { Analysis } from "../lib/analysis/schema";

afterEach(() => vi.unstubAllGlobals());

const step = { roleTitle: "Frontend Engineer", requirement: "Zero-to-one product work", title: "Build a small SaaS dashboard", deliverable: "Live app + repo" };
const fakeAi = (out: unknown) => ({ run: vi.fn(async () => ({ response: out })) });
const project = { name: "Ticket Router", line: "React + TypeScript dashboard for routing support tickets", bullets: ["Built X", "Shipped Y"], link: "https://github.com/me/router" };

describe("CV with projects", () => {
  const cv = "Ada Obi\nLagos · ada@example.com\n\nEXPERIENCE\nFrontend Dev, Acme\n• Built things\n\nEDUCATION\nBSc, Unilag";

  it("adds a Projects section before Education and keeps the CV text", () => {
    const blocks = cvBlocks(cv, [project]);
    const texts = blocks.map((b) => b.text);
    expect(texts.indexOf("PROJECTS")).toBeLessThan(texts.indexOf("EDUCATION"));
    expect(texts).toContain("Ticket Router | https://github.com/me/router");
    expect(blocks[0]).toEqual({ kind: "name", text: "Ada Obi" });
    expect(texts).toContain("Built things");
  });

  it("puts projects at the top of an existing Projects section", () => {
    const blocks = cvBlocks("Ada\n\nProjects\nOld project\n\nSkills\nReact", [project]);
    const texts = blocks.map((b) => b.text);
    expect(texts.indexOf("Ticket Router | https://github.com/me/router")).toBe(texts.indexOf("Projects") + 1);
    expect(texts.filter((t) => /projects/i.test(t))).toHaveLength(1);
  });

  it("appends a section when the CV has no headings", () => {
    const texts = cvBlocks("Ada\nI build websites.", [project]).map((b) => b.text);
    expect(texts.indexOf("PROJECTS")).toBeGreaterThan(texts.indexOf("I build websites."));
  });

  it("builds a Word file", () => {
    const bytes = cvDocxBytes(cv, [project]);
    expect(bytes[0]).toBe(0x50); // "PK" zip
    expect(bytes.length).toBeGreaterThan(500);
  });
});

describe("step guide", () => {
  const guide = {
    why: "Shipping from scratch shows ownership.",
    steps: ["Scope it", "Build it", "Publish it"],
    resources: [
      { name: "React docs", url: "https://react.dev/learn", use: "Components" },
      { name: "Dead page", url: "https://react.dev/nope", use: "" },
      { name: "Random blog", url: "https://random-blog.example/post", use: "" },
    ],
    avoid: ["Copying a tutorial", "No README"],
    showIt: "Repo with README and a live link.",
  };

  it("keeps only known learning links that load", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => new Response("", { status: String(u).includes("nope") ? 404 : 200 })));
    const g = await stepGuide(fakeAi(JSON.stringify(guide)), step, "en");
    expect(g.resources.map((r) => r.name)).toEqual(["React docs"]);
  });

  it("falls back to a search when no link survives", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    const g = await stepGuide(fakeAi(JSON.stringify(guide)), step, "en");
    expect(g.resources).toHaveLength(1);
    expect(g.resources[0].url).toContain("duckduckgo.com");
  });
});

describe("work check", () => {
  it("never writes CV bullets when the work isn't shown", async () => {
    const out = { verdict: "not_yet", strengths: [], improve: ["Add a README"], project: { name: "X", line: "Y", bullets: ["Invented claim"] } };
    const p = await checkProof(fakeAi(JSON.stringify(out)), step, "LINK x: could not be opened", "", "en");
    expect(p.project.bullets).toEqual([]);
  });

  it("reads a GitHub repo's README", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      expect(String(u)).toBe("https://raw.githubusercontent.com/me/router/HEAD/README.md");
      return new Response("# Ticket Router\nRoutes tickets.");
    }));
    expect(await proofText("https://github.com/me/router")).toContain("Routes tickets.");
  });

  it("refuses private addresses", async () => {
    expect(await proofText("http://127.0.0.1/admin")).toContain("not a public https link");
  });
});

describe("roadmap reasons", () => {
  it("keeps why each step is there", () => {
    const a = { roleTitle: "Dev", summary: "", demonstratedSkills: [], model: "m", createdAt: "",
      findings: [{ requirement: "GraphQL", status: "missing", evidence: "", importance: "required", action: "Build an API", deliverable: "Repo", resource: { name: "r", url: "" }, priority: 1, estimatedHours: 10, evidenceVerified: false }] } as Analysis;
    expect(buildRoadmap(a).tasks[0]).toMatchObject({ status: "missing", importance: "required" });
  });
});

describe("guide links", () => {
  it("prefers topic pages over homepages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    const out = { why: "w", steps: ["Scope it", "Build it", "Ship it"], avoid: ["No README", "No tests"], showIt: "s", resources: [
      { name: "Figma", url: "https://www.figma.com/", use: "" },
      { name: "GitHub Docs", url: "https://docs.github.com/en", use: "" },
      { name: "Actions", url: "https://docs.github.com/en/actions/quickstart", use: "" },
    ] };
    const g = await stepGuide(fakeAi(JSON.stringify(out)), step, "en");
    expect(g.resources.map((r) => r.name)).toEqual(["Actions"]);
  });
});

describe("tidy AI text", async () => {
  const { tidyText } = await import("../lib/analysis/coach");
  it("cuts a drifted ending back to the last sentence", () => {
    expect(tidyText("Publish it on GitHub. The demo should be live, demonstrating the 候s' 0-")).toBe("Publish it on GitHub.");
    expect(tidyText("Explain the development过程.")).toBe("Explain the development");
    expect(tidyText("Plain sentence.")).toBe("Plain sentence.");
    expect(tidyText("نص عربي سليم.")).toBe("نص عربي سليم.");
  });
});
