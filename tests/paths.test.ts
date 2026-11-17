import { describe, expect, it, vi } from "vitest";
import { PathFitModelSchema, PathFitRequestSchema, suggestPaths, toPathsPreview, verifyPaths } from "../lib/analysis/paths";
import { CAREER_PATHS, careerById, guessCareerPath, TECH_PATHS } from "../lib/careers";

const CV = `Tolu Adeyemi
Customer Support Agent

EXPERIENCE
Support Agent, Paystack
• Reproduced and logged 40+ checkout bugs in Jira with clear steps for the engineering team
• Built an Excel dashboard tracking weekly ticket volume by product
• Wrote the help-centre guide for refunds used by 3,000 merchants

SKILLS
Excel, SQL basics, Jira, Zendesk`.padEnd(260, " ");

const fakeAi = (...outs: unknown[]) => {
  const run = vi.fn();
  for (const o of outs) run.mockResolvedValueOnce({ response: JSON.stringify(o) });
  return { run };
};

const good = {
  paths: [
    { id: "qa", why: "You already find and report bugs.", evidence: ["Reproduced and logged 40+ checkout bugs in Jira"], missing: ["Test automation", "Test plans"], firstStep: "Write 10 Playwright tests for a demo shop." },
    { id: "data-analytics", why: "You build dashboards.", evidence: ["Built an Excel dashboard tracking weekly ticket volume"], missing: ["SQL", "Power BI"], firstStep: "Rebuild the dashboard in Power BI." },
    { id: "devrel", why: "You write guides people use.", evidence: ["Wrote the help-centre guide for refunds"], missing: ["API docs"], firstStep: "Document a public API." },
  ],
};

describe("career paths", () => {
  it("every tech path is a real career path, with the roles people ask about", () => {
    for (const id of Object.keys(TECH_PATHS)) expect(careerById(id), id).not.toBeNull();
    for (const id of ["frontend", "backend", "fullstack", "mobile", "devops", "cloud", "security", "qa", "data-analytics", "data-engineering", "ai-ml", "design", "product", "devrel"])
      expect(TECH_PATHS[id], id).toBeTruthy();
    expect(new Set(CAREER_PATHS.map((c) => c.id)).size).toBe(CAREER_PATHS.length);
  });

  it("guesses the narrow new paths from a headline", () => {
    expect(guessCareerPath("Ada\nFull Stack Developer")).toBe("fullstack");
    expect(guessCareerPath("Ada\nReact Native Developer")).toBe("mobile");
    expect(guessCareerPath("Ada\nQA Automation Engineer")).toBe("qa");
    expect(guessCareerPath("Ada\nPenetration Tester")).toBe("security");
    expect(guessCareerPath("Ada\nData Engineer")).toBe("data-engineering");
    expect(guessCareerPath("Ada\nMachine Learning Engineer")).toBe("ai-ml");
    expect(guessCareerPath("Ada\nAWS Cloud Engineer")).toBe("cloud");
    expect(guessCareerPath("Ada\nData Analyst")).toBe("data-analytics");
  });

  it("filters job titles for the new paths", () => {
    expect(careerById("mobile")!.titles.test("Senior iOS Engineer")).toBe(true);
    expect(careerById("qa")!.titles.test("SDET II")).toBe(true);
    expect(careerById("cloud")!.titles.test("Cloud Architect")).toBe(true);
    expect(careerById("data-engineering")!.titles.test("Analytics Engineer")).toBe(true);
  });
});

describe("tech path fit", () => {
  it("needs consent and a real CV", () => {
    expect(PathFitRequestSchema.safeParse({ resumeText: CV }).success).toBe(false);
    expect(PathFitRequestSchema.safeParse({ consent: true, resumeText: "short" }).success).toBe(false);
    expect(PathFitRequestSchema.safeParse({ consent: true, resumeText: CV }).success).toBe(true);
  });

  it("only accepts known tech path ids", () => {
    expect(PathFitModelSchema.safeParse({ paths: [{ ...good.paths[0], id: "nursing" }] }).success).toBe(false);
  });

  it("keeps only quotes found in the CV and drops paths with none", () => {
    const out = verifyPaths(
      {
        paths: [
          { ...good.paths[0], evidence: ["Reproduced and logged 40+ checkout bugs in Jira", "Led a team of 12 QA engineers"] },
          { ...good.paths[1], id: "ai-ml", evidence: ["Trained a GPT model on support tickets"] },
          good.paths[0],
        ],
      },
      CV,
    );
    expect(out.map((p) => p.id)).toEqual(["qa"]);
    expect(out[0].evidence).toEqual(["Reproduced and logged 40+ checkout bugs in Jira"]);
  });

  it("drops the catch-all software path when narrower ones fit", () => {
    const out = verifyPaths({ paths: [{ ...good.paths[0], id: "software" }, ...good.paths] }, CV);
    expect(out.map((p) => p.id)).toEqual(["qa", "data-analytics", "devrel"]);
  });

  it("asks the AI once and returns verified paths", async () => {
    const ai = fakeAi(good);
    const fits = await suggestPaths(ai, CV, "fr");
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect(fits.locale).toBe("fr");
    expect(fits.paths.map((p) => p.id)).toEqual(["qa", "data-analytics", "devrel"]);
    const system = (ai.run.mock.calls[0][1] as { messages: { content: string }[] }).messages[0].content;
    expect(system).toContain("French");
    expect(system).toContain("data-engineering");
  });

  it("retries when no suggestion quotes the CV, then gives up", async () => {
    const invented = { paths: [{ ...good.paths[0], evidence: ["Shipped a Kubernetes operator"] }] };
    const ai = fakeAi(invented, good);
    expect((await suggestPaths(ai, CV)).paths).toHaveLength(3);
    expect(ai.run).toHaveBeenCalledTimes(2);
    await expect(suggestPaths(fakeAi(invented, invented), CV)).rejects.toThrow(/couldn't suggest/);
  });

  it("free preview keeps every path's reasons but only the best fit's gaps and first step", () => {
    const fits = { paths: verifyPaths(good, CV), locale: "en" as const, createdAt: "" };
    const preview = toPathsPreview(fits);
    expect(preview.preview).toEqual({ locked: 2 });
    expect(preview.paths[0]).toEqual(fits.paths[0]);
    for (const p of preview.paths.slice(1)) {
      expect(p.why).toBeTruthy();
      expect(p.evidence.length).toBeGreaterThan(0);
      expect(p.missing).toEqual([]);
      expect(p.firstStep).toBe("");
    }
  });
});
