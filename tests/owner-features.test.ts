import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  owner: false,
  quota: vi.fn(),
  consumePass: vi.fn(),
  refundPass: vi.fn(),
  run: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: { AI: {} } }));
vi.mock("@/lib/server/account", () => ({ ownerFor: async () => mocks.owner }));
vi.mock("@/lib/server/payments", () => ({ consumePass: mocks.consumePass, refundPassUse: mocks.refundPass, passStatus: async () => ({ active: false }) }));
vi.mock("@/lib/server/guard", async (original) => ({ ...await original<typeof import("@/lib/server/guard")>(), consumeQuota: mocks.quota }));
vi.mock("@/lib/server/stats", () => ({ bumpStat: async () => {} }));
vi.mock("@/lib/analysis/run", () => ({ runAnalysis: mocks.run, AnalysisError: class extends Error {} }));
vi.mock("@/lib/jobs", () => ({ getJob: async () => null, getAllJobs: async () => ({ jobs: [], errors: [] }), filterJobs: () => [] }));
vi.mock("@/lib/recommend", () => ({ recommend: () => Array.from({ length: 12 }, (_, id) => ({ id })) }));
import { POST as analyze } from "@/app/api/analyze/route";
import { POST as recommend } from "@/app/api/recommend/route";
const req = (body: unknown) => new Request("https://carreadi.naijabukana.com/api/test", { method: "POST", body: JSON.stringify(body) });
const input = { consent: true, resumeText: "Resume experience ".repeat(20), jobText: "Job requirements ".repeat(20) };
const analysisBody = async (response: Response) => await response.json() as { analysis: { summary: string; preview?: { locked: number } }; pass: { owner: boolean } };
const matchesBody = async (response: Response) => await response.json() as { recommendations: unknown[]; locked: number };

beforeEach(() => {
  mocks.owner = false;
  vi.clearAllMocks();
  mocks.quota.mockResolvedValue({ ok: true, refund: vi.fn() });
  mocks.consumePass.mockResolvedValue(null);
  mocks.run.mockResolvedValue({ summary: "Full summary", findings: [], demonstratedSkills: [] });
});

describe("owner premium routes", () => {
  it("returns full analyses repeatedly without charging a pass or consuming free quota", async () => {
    mocks.owner = true;
    for (let i = 0; i < 2; i++) {
      const response = await analyze(req({ ...input, passToken: "an-old-pass" }));
      expect(response.status).toBe(200);
      const body = await analysisBody(response);
      expect(body.analysis.summary).toBe("Full summary");
      expect(body.analysis.preview).toBeUndefined();
      expect(body.pass).toEqual({ owner: true });
    }
    expect(mocks.consumePass).not.toHaveBeenCalled();
    expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("preserves previews and exhausted free quotas for ordinary visitors", async () => {
    expect((await analysisBody(await analyze(req(input)))).analysis.preview).toEqual({ locked: 0 });
    expect(mocks.quota).toHaveBeenCalledOnce();
    mocks.quota.mockResolvedValue({ ok: false });
    expect((await analyze(req(input))).status).toBe(402);
  });
  it("does not try to refund a nonexistent owner purchase after an AI failure", async () => {
    mocks.owner = true;
    mocks.run.mockRejectedValue(new Error("test failure"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try { expect((await analyze(req(input))).status).toBe(500); } finally { log.mockRestore(); }
    expect(mocks.refundPass).not.toHaveBeenCalled();
  });
  it("returns every ranked match to owners and keeps the free three-match limit", async () => {
    mocks.owner = true;
    expect((await matchesBody(await recommend(req({ skills: [] })))).recommendations).toHaveLength(12);
    mocks.owner = false;
    const free = await matchesBody(await recommend(req({ skills: [] })));
    expect(free.recommendations).toHaveLength(3);
    expect(free.locked).toBe(9);
  });
});
