import { describe, expect, it } from "vitest";
import { AnalysisError, runAnalysis, type AiLike } from "@/lib/analysis/run";
import { AnalyzeRequestSchema, MODEL_JSON_SCHEMA, type ModelOutput } from "@/lib/analysis/schema";
import { verifyOutput } from "@/lib/analysis/verify";
import { careerById, guessCareerPath, skillsIn } from "@/lib/careers";
import { hardRequirements, recommend } from "@/lib/recommend";
import { buildRoadmap, nextTask, remainingHours } from "@/lib/roadmap";
import type { Job } from "@/lib/types";

const RESUME = `Jane Doe — Software Engineer
Experience: Built REST APIs in Python and FastAPI serving 2M requests per day at Acme.
Wrote internal documentation for the payments team. Skills: Python, SQL, Docker, Git.
Education: BSc Computer Science. Based in Lagos, Nigeria.`.padEnd(260, " ");

const finding = (over: Partial<ModelOutput["findings"][number]>): ModelOutput["findings"][number] => ({
  requirement: "Python",
  status: "demonstrated",
  evidence: "Built REST APIs in Python and FastAPI",
  importance: "required",
  action: "",
  deliverable: "",
  resource: { name: "Python docs", url: "https://docs.python.org/3/" },
  priority: 3,
  estimatedHours: 0,
  ...over,
});

const OUTPUT: ModelOutput = {
  roleTitle: "Backend Engineer",
  summary: "Strong Python API evidence; missing OpenAPI and Kubernetes.",
  demonstratedSkills: ["Python", "SQL", "Docker", "Kubernetes"],
  findings: [
    finding({}),
    finding({ requirement: "Kubernetes", status: "demonstrated", evidence: "Ran Kubernetes clusters at Google", priority: 2 }),
    finding({
      requirement: "OpenAPI",
      status: "missing",
      evidence: "",
      action: "Document an API with OpenAPI",
      deliverable: "Public repo with an OpenAPI 3.1 spec",
      resource: { name: "OpenAPI spec", url: "https://totally-made-up-courses.example/openapi" },
      priority: 1,
      estimatedHours: 12,
    }),
    finding({ requirement: "US work authorization", status: "eligibility", evidence: "", priority: 1, action: "Check visa sponsorship", deliverable: "Answer from recruiter" }),
  ],
};

describe("verifyOutput", () => {
  const a = verifyOutput(OUTPUT, RESUME, "m");
  it("keeps evidence that is quoted from the résumé", () => {
    expect(a.findings[0]).toMatchObject({ status: "demonstrated", evidenceVerified: true });
  });
  it("downgrades claimed evidence that is not in the résumé", () => {
    expect(a.findings[1]).toMatchObject({ status: "uncertain", evidence: "", evidenceVerified: false });
  });
  it("drops skills that don't appear in the résumé", () => {
    expect(a.demonstratedSkills).toEqual(["Python", "SQL", "Docker"]);
  });
  it("replaces unknown resource URLs with a search link", () => {
    expect(a.findings[0].resource.url).toBe("https://docs.python.org/3/");
    expect(a.findings[2].resource.url).toMatch(/^https:\/\/duckduckgo\.com\/\?q=OpenAPI/);
  });
});

describe("runAnalysis", () => {
  const input = { resumeText: RESUME, jobText: "Backend engineer. Python, OpenAPI, Kubernetes. ".repeat(4) };

  it("accepts an object response", async () => {
    const ai: AiLike = { run: async () => ({ response: OUTPUT }) };
    const a = await runAnalysis(ai, input);
    expect(a.roleTitle).toBe("Backend Engineer");
  });

  it("accepts a JSON string wrapped in prose", async () => {
    const ai: AiLike = { run: async () => ({ response: `Here you go:\n${JSON.stringify(OUTPUT)}\nThanks` }) };
    expect((await runAnalysis(ai, input)).findings).toHaveLength(4);
  });

  it("retries once when output fails schema validation", async () => {
    let n = 0;
    const ai: AiLike = { run: async () => ({ response: n++ === 0 ? { roleTitle: "x" } : OUTPUT }) };
    await runAnalysis(ai, input);
    expect(n).toBe(2);
  });

  it("throws a friendly error after repeated failure or model errors", async () => {
    await expect(runAnalysis({ run: async () => ({ response: "not json" }) }, input)).rejects.toBeInstanceOf(AnalysisError);
    await expect(runAnalysis({ run: async () => { throw new Error("JSON Mode couldn't be met"); } }, input)).rejects.toBeInstanceOf(AnalysisError);
  });

  it("sends a JSON schema to the model", async () => {
    let seen: { response_format?: { type: string } } = {};
    await runAnalysis({ run: async (_m, i) => { seen = i as typeof seen; return { response: OUTPUT }; } }, input);
    expect(seen.response_format?.type).toBe("json_schema");
    expect(MODEL_JSON_SCHEMA).toHaveProperty("properties.findings");
  });
});

describe("AnalyzeRequestSchema", () => {
  const ok = { consent: true, resumeText: RESUME, jobText: "x".repeat(120) };
  it("requires consent", () => {
    expect(AnalyzeRequestSchema.safeParse({ ...ok, consent: false }).success).toBe(false);
  });
  it("requires a job description or job id", () => {
    expect(AnalyzeRequestSchema.safeParse({ ...ok, jobText: "short" }).success).toBe(false);
    expect(AnalyzeRequestSchema.safeParse({ ...ok, jobText: undefined, jobId: "ashby~x~1" }).success).toBe(true);
  });
  it("rejects a short résumé", () => {
    expect(AnalyzeRequestSchema.safeParse({ ...ok, resumeText: "hi" }).success).toBe(false);
  });
});

describe("roadmap", () => {
  const a = verifyOutput(OUTPUT, RESUME, "m");
  it("turns gaps (not shown skills or eligibility) into prioritized tasks with deliverables", () => {
    const r = buildRoadmap(a);
    expect(r.tasks.map((t) => t.requirement)).toEqual(["OpenAPI"]);
    expect(r.tasks[0].deliverable).toMatch(/OpenAPI/);
    expect(nextTask(r)?.requirement).toBe("OpenAPI");
    expect(r.tasks[0].hours).toBe(12);
    expect(remainingHours(r)).toBe(12);
    r.tasks[0].done = true;
    expect(remainingHours(r)).toBe(0);
  });
  it("keeps progress and custom tasks when refreshed", () => {
    const r = buildRoadmap(a);
    r.tasks[0].done = true;
    r.tasks.push({ id: "c", title: "Mine", requirement: "Custom", deliverable: "d", resource: { name: "", url: "" }, priority: 3, done: false });
    const again = buildRoadmap(a, r);
    expect(again.tasks.find((t) => t.requirement === "OpenAPI")?.done).toBe(true);
    expect(again.tasks.some((t) => t.title === "Mine")).toBe(true);
    expect(nextTask(again)?.title).toBe("Mine");
  });
});

describe("skills and recommendations", () => {
  it("guesses the career path from the résumé headline and file name", () => {
    expect(guessCareerPath(RESUME)).toBe("software");
    expect(guessCareerPath("Ada Okafor — Backend Software Engineer\nLagos")).toBe("backend");
    expect(guessCareerPath("Jane Doe\nMy CV", "Jane-Doe-Technical-Content-Writer-Resume.pdf")).toBe("devrel");
    expect(guessCareerPath("Sam\nCommercial Underwriter")).toBe("");
    expect(careerById("devrel")!.titles.test("Senior Underwriter")).toBe(false);
  });

  it("covers non-tech careers", () => {
    expect(guessCareerPath("Amaka Obi, RN\nRegistered Nurse\nAbuja")).toBe("healthcare");
    expect(guessCareerPath("Chidi Eze\nChartered Accountant (ICAN)")).toBe("finance");
    expect(guessCareerPath("Bola\nSecondary School Teacher")).toBe("education");
    expect(guessCareerPath("Ife\nHR Generalist & Recruiter")).toBe("hr");
    expect(careerById("finance")!.titles.test("Senior Underwriter")).toBe(false);
    const s = skillsIn("Prepared IFRS financial reporting, handled payroll and KYC/AML checks in QuickBooks. Patient care on a busy ward.");
    expect(s).toEqual(expect.arrayContaining(["IFRS", "Financial reporting", "Payroll", "KYC", "AML", "QuickBooks", "Patient care"]));
    expect(skillsIn("a small family run Canvas shop")).not.toContain("AML");
    expect(skillsIn("a small family run Canvas shop")).not.toContain("Canva");
  });

  it("avoids common-word false positives", () => {
    expect(skillsIn("Let's go build it, we rest on Fridays")).toEqual([]);
    expect(skillsIn("Experience with Go, Python and REST APIs")).toEqual(expect.arrayContaining(["Go", "Python", "REST"]));
  });

  const job = (id: string, title: string, description: string, location: string, remote: Job["remote"] = "onsite"): Job => ({
    id, title, description, location, remote, provider: "lever", company: "Acme", remoteWorldwide: false,
    employmentType: null, salary: null, sourceUrl: "", applyUrl: "", publishedAt: null, lastChecked: "",
  });

  it("classifies with explicit reasons and no probabilities", () => {
    const recs = recommend(
      [
        job("a", "Backend Engineer", "Python, SQL, Docker and Git", "Lagos, Nigeria"),
        job("b", "Backend Engineer", "Python, Kubernetes, Kafka, Terraform, AWS, Go, Rust", "Lagos, Nigeria"),
        job("c", "Backend Engineer", "Python, SQL, Docker and Git", "Remote - US", "remote"),
      ],
      { skills: ["Python", "SQL", "Docker", "Git"], careerPath: "backend", location: "Nigeria" },
    );
    const tier = (id: string) => recs.find((r) => r.job.id === id)?.tier;
    expect(tier("a")).toBe("apply");
    expect(tier("b")).toBe("future");
    expect(tier("c")).toBe("future");
    expect(recs.find((r) => r.job.id === "c")?.reasons.join(" ")).toMatch(/Remote, limited to: Remote - US/);
    expect(JSON.stringify(recs)).not.toMatch(/%|probab/i);
  });

  it("never marks jobs with hard eligibility requirements as apply-now", () => {
    const recs = recommend(
      [job("j", "Backend Engineer (Japanese Speaking)", "Python, SQL, Docker and Git", "Lagos, Nigeria")],
      { skills: ["Python", "SQL", "Docker", "Git"] },
    );
    expect(recs[0].tier).toBe("review");
    expect(recs[0].reasons.join(" ")).toMatch(/specific language/);
    expect(hardRequirements("We are unable to sponsor visas")).toEqual(["existing work authorization"]);
  });
});
