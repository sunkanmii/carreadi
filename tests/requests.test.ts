import { describe, expect, it } from "vitest";
import { detectBoard } from "@/lib/jobs/detect";

describe("detectBoard", () => {
  it("recognises supported job-board links", () => {
    expect(detectBoard("https://boards.greenhouse.io/moniepoint/jobs/123")).toEqual({ provider: "greenhouse", token: "moniepoint" });
    expect(detectBoard("https://job-boards.greenhouse.io/Acme")).toEqual({ provider: "greenhouse", token: "acme" });
    expect(detectBoard("https://boards.greenhouse.io/embed/job_board?for=acme")).toEqual({ provider: "greenhouse", token: "acme" });
    expect(detectBoard("https://jobs.lever.co/spotify/abc-123")).toEqual({ provider: "lever", token: "spotify" });
    expect(detectBoard("https://jobs.ashbyhq.com/andela")).toEqual({ provider: "ashby", token: "andela" });
    expect(detectBoard("https://apply.workable.com/kuda/j/ABC/")).toEqual({ provider: "workable", token: "kuda" });
    expect(detectBoard("https://bunq.recruitee.com/o/data-scientist")).toEqual({ provider: "recruitee", token: "bunq" });
  });
  it("returns null for other sites and unsafe links", () => {
    expect(detectBoard("https://careers.example.com/jobs")).toBeNull();
    expect(detectBoard("https://apply.workable.com/j/ABC123")).toBeNull();
    expect(detectBoard("javascript:alert(1)")).toBeNull();
    // Dot segments are resolved by URL parsing, so a path can never escape the board name.
    expect(detectBoard("https://jobs.lever.co/../../etc")?.token).toBe("etc");
    expect(detectBoard("https://evil.com/boards.greenhouse.io/acme")).toBeNull();
    expect(detectBoard("not a url")).toBeNull();
  });
});
