import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import { direction, messageKey, negotiateLocale, requestLocale } from "@/lib/i18n";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import es from "@/messages/es.json";
import ar from "@/messages/ar.json";
import { buildRoadmap } from "@/lib/roadmap";
import type { Analysis } from "@/lib/analysis/schema";
import { localizeReason } from "@/lib/localizeReason";
import { installClientText } from "@/lib/client/locale";
import { docxBytes, reportOf } from "@/lib/client/export";
import { unzipSync, strFromU8 } from "fflate";
import { runAnalysis } from "@/lib/analysis/run";

const args = (message: string) => [...new Set([...message.matchAll(/\{([A-Za-z]\w*)(?:\}|,)/g)].map((match) => match[1]))].sort();

describe("language selection", () => {
  it("honors explicit choices, supports regional tags and ignores invalid preferences", () => {
    expect(negotiateLocale("de;q=1, fr-CA;q=0.9, en;q=0.5")).toBe("fr");
    expect(negotiateLocale("ar;q=0, es;q=0.7")).toBe("es");
    expect(negotiateLocale("not-a-language;q=NaN")).toBe("en");
    expect(requestLocale(new Request("https://x.test", { headers: { cookie: "carreadi_locale=ar", "accept-language": "fr" } }))).toBe("ar");
    expect(requestLocale(new Request("https://x.test", { headers: { cookie: "carreadi_locale=evil", "accept-language": "es-MX" } }))).toBe("es");
    expect(direction("ar")).toBe("rtl");
    expect(direction("fr")).toBe("ltr");
  });
});

describe("translation catalogs", () => {
  for (const [locale, raw] of Object.entries({ en, fr, es, ar })) it(`${locale} covers the complete source catalog with valid messages and unchanged arguments`, () => {
    const messages = raw as { ui: Record<string, string> };
    const t = createTranslator({ locale, messages, namespace: "ui", onError: (error) => { throw error; } });
    for (const [key, source] of Object.entries(en.ui)) {
      expect(messages.ui[key], `${locale}: ${source}`).toBeTruthy();
      expect(args(messages.ui[key]), `${locale}: ${source}`).toEqual(args(source));
      const values = Object.fromEntries(args(source).map((name) => [name, 3]));
      expect(typeof t(key, values)).toBe("string");
    }
  });
  it("formats Arabic plural branches without English suffixes", () => {
    const t = createTranslator({ locale: "ar", messages: ar as { ui: Record<string, string> }, namespace: "ui" });
    const source = "Showing your top {shown} matches. {count, plural, one {# more ranked match unlocks with a pass.} other {# more ranked matches unlock with a pass.}}";
    for (const count of [0, 1, 2, 3, 11, 100]) expect(t(messageKey(source), { shown: 3, count })).not.toMatch(/[{}]|matches|unlocks/);
  });
});

describe("multilingual user content", () => {
  it("requests Arabic guidance while verifying original English evidence", async () => {
    const ai = { run: vi.fn<(model: string, input: unknown) => Promise<unknown>>().mockResolvedValue({ response: { roleTitle: "كاتب تقني", summary: "خبرة موثقة في Python.", demonstratedSkills: ["Python"], findings: [{ requirement: "برمجة Python", status: "demonstrated", evidence: "Built Python APIs.", importance: "required", action: "", deliverable: "", resource: { name: "Python", url: "https://docs.python.org/3/" }, priority: 3, estimatedHours: 0 }] } }) };
    const analysis = await runAnalysis(ai, { resumeText: "Built Python APIs.", jobText: "Python APIs", locale: "ar" });
    expect(analysis.locale).toBe("ar");
    expect(analysis.findings[0].evidence).toBe("Built Python APIs.");
    expect(analysis.findings[0].evidenceVerified).toBe(true);
    expect((ai.run.mock.calls[0][1] as { messages: { content: string }[] }).messages[0].content).toContain("in Arabic");
  });
  it("does not merge unrelated Arabic roadmap requirements", () => {
    const a = { roleTitle: "كاتب تقني", findings: ["توثيق الواجهات", "اختبار البرامج"].map((requirement) => ({ requirement, status: "missing", action: requirement, deliverable: requirement, resource: { name: "Docs", url: "https://example.com" }, priority: 1, estimatedHours: 4, importance: "required" })) } as Analysis;
    const initial = buildRoadmap(a);
    initial.tasks[0].done = true;
    const refreshed = buildRoadmap(a, initial);
    expect(refreshed.tasks.map((task) => task.done)).toEqual([true, false]);
    expect(refreshed.tasks[0].requirement).not.toBe(refreshed.tasks[1].requirement);
  });
  it("localizes rule explanations while preserving original job locations", () => {
    const t = (source: string, values?: Record<string, string | number>) => `${source}:${JSON.stringify(values ?? {})}`;
    expect(localizeReason("Location may not fit: Lagos, Nigeria", t)).toContain('"location":"Lagos, Nigeria"');
    expect(localizeReason("You have 2 of the 5 skills it lists", t)).toContain('"matched":2,"total":5');
  });
  it("keeps evidence untouched in RTL Word exports", () => {
    const t = createTranslator({ locale: "ar", messages: ar as { ui: Record<string, string> }, namespace: "ui" });
    installClientText((source, values) => t.has(messageKey(source)) ? t(messageKey(source), values) : source);
    try {
      const report = reportOf({ analysis: { roleTitle: "كاتب", summary: "ملخص", locale: "ar", model: "test", createdAt: "2026-11-05", demonstratedSkills: [], findings: [{ requirement: "Python", status: "demonstrated", evidence: "Built Python APIs.", evidenceVerified: true, importance: "required", action: "", deliverable: "", resource: { name: "", url: "" }, priority: 3, estimatedHours: 0 }] }, roadmap: { roleTitle: "كاتب", tasks: [], updatedAt: "2026-11-05" } });
      report.locale = "ar";
      const xml = strFromU8(unzipSync(docxBytes(report))["word/document.xml"]);
      expect(xml).toContain("<w:bidi/>");
      expect(xml).toContain("Built Python APIs.");
      expect(xml).toContain("كاتب");
    } finally { installClientText((source, values) => source.replace(/\{(\w+)\}/g, (match, key) => String(values?.[key] ?? match))); }
  });
});
