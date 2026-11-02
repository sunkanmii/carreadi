import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { Analysis } from "@/lib/analysis/schema";
import { calendarText, checklistText, docxBytes, reportOf } from "@/lib/client/export";
import { buildRoadmap } from "@/lib/roadmap";

const f = (requirement: string, status: Analysis["findings"][number]["status"], priority: number, extra = {}) => ({
  requirement, status, priority, evidence: "", importance: "required" as const, action: `Do ${requirement}`, deliverable: `Ship ${requirement}`,
  resource: { name: "Docs", url: "https://example.com/learn" }, estimatedHours: 10, evidenceVerified: false, ...extra,
});
const analysis: Analysis = {
  roleTitle: "Writer", summary: "Strong on APIs & docs.", demonstratedSkills: ["SQL"], model: "m", createdAt: "2026-11-02",
  findings: [f("SQL", "demonstrated", 3, { evidence: "Wrote <SQL> guides" }), f("Go", "missing", 1), f("K8s", "not_shown", 2)],
};
const roadmap = { ...buildRoadmap(analysis), pace: 10 };
const report = reportOf({ analysis, roadmap, job: { id: "j", title: "Senior Writer", company: "Acme & Co", applyUrl: "https://acme.test/apply" } });

describe("exports", () => {
  it("builds a Word file with the report, escaped", () => {
    const files = unzipSync(docxBytes(report));
    expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).toContain("Senior Writer · Acme &amp; Co");
    expect(xml).toContain("Wrote &lt;SQL&gt; guides");
    expect(xml).toContain("Do Go");
    expect(xml).not.toMatch(/<SQL>/);
  });

  it("puts each open step on the calendar, spaced by the user's pace", () => {
    const ics = calendarText(report, new Date(2026, 10, 2, 10));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("SUMMARY:Carreadi: Do Go");
    // 10 h at 10 h/week = 7 days after tomorrow, then another 7.
    expect(ics).toMatch(/DTSTART:20261110T\d{6}Z/);
    expect(ics).toMatch(/DTSTART:20261117T\d{6}Z/);
  });

  it("copies a plain checklist", () => {
    const text = checklistText(report);
    expect(text).toContain("☐ Do Go (~10 h)");
    expect(text).toContain("→ Ship K8s");
  });
});
