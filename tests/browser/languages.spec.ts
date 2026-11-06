import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

async function audit(page: Page) {
  // Audit the settled interface, after finite card entrance animations finish.
  await expect.poll(() => page.locator("main .card").evaluateAll((cards) => cards.every((card) => Number(getComputedStyle(card).opacity) >= 0.99))).toBe(true);
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (node: Document, options: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[]; failureSummary?: string }[] }[] }> } }).axe;
    return (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ target: n.target, failureSummary: n.failureSummary })) }));
  });
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => console.error("Browser error:", error.message));
  await page.route("**/api/jobs**", (route) => route.fulfill({ json: { jobs: [], total: 0, errors: [] } }));
  await page.route("**/api/recommend", (route) => route.fulfill({ json: { recommendations: [], locked: 0, errors: [] } }));
  await page.route("**/api/stats", (route) => route.fulfill({ json: { cvsChecked: 0 } }));
});

for (const locale of ["en", "fr", "es", "ar"]) {
  for (const width of [390, 1280]) {
    test(`${locale} ${width}px: main pages are accessible without overflow`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "carreadi_locale", value: locale, url: baseURL! }]);
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", "/signin", "/plans", "/request", "/jobs", "/privacy", "/terms"]) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
        await expect(page.locator("header select")).toHaveValue(locale);
        await expect(page.locator("header select")).toBeEnabled();
        await audit(page);
      }
    });
  }
}

test("language choice persists, updates server copy, and preserves an unfinished CV", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header select")).toBeEnabled();
  const englishTitle = await page.locator("h1").innerText();
  await page.getByRole("button", { name: "paste text", exact: true }).click();
  const resume = "My draft CV, kept while switching languages. ".repeat(6);
  await page.locator("#resume-text").fill(resume);
  await page.locator("header select").selectOption("fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("h1")).not.toHaveText(englishTitle!);
  await expect(page.locator("#resume-text")).toHaveValue(resume);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.locator("header select")).toHaveValue("fr");
});

test("job tabs use one tab stop and support arrow, Home and End keys", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header select")).toBeEnabled();
  await page.getByRole("button", { name: "paste text", exact: true }).click();
  await page.locator("#resume-text").fill("Software writer with experience documenting Python APIs and SQL workflows. ".repeat(5));
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const tabs = page.getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tabs.last()).toBeFocused();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(tabs.first()).toBeFocused();
  await audit(page);
});

test("mobile navigation closes with Escape and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("header select")).toBeEnabled();
  const menu = page.locator("header button[aria-controls]");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

for (const locale of ["en", "ar"]) test(`${locale}: saved reports, roadmap, and exports remain accessible`, async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "carreadi_locale", value: locale, url: baseURL! }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const finding = { requirement: "Python APIs", status: "demonstrated", evidence: "Built Python APIs.", importance: "required", action: "", deliverable: "", resource: { name: "Python docs", url: "https://docs.python.org/3/" }, priority: 3, estimatedHours: 0, evidenceVerified: true };
    localStorage.setItem("carreadi:v1", JSON.stringify({
      jobText: "Write documentation for Python APIs.",
      analysis: { roleTitle: "Technical writer", summary: "Strong Python evidence. Add an OpenAPI example.", demonstratedSkills: ["Python"], findings: [finding, { ...finding, requirement: "OpenAPI", status: "missing", action: "Publish an OpenAPI example", deliverable: "A public specification", priority: 1, estimatedHours: 8, evidence: "", evidenceVerified: false }], model: "test", createdAt: "2026-11-05T00:00:00Z", locale: "en" },
      roadmap: { roleTitle: "Technical writer", updatedAt: "2026-11-05T00:00:00Z", pace: 5, tasks: [{ id: "test-task", title: "Publish an OpenAPI example", requirement: "OpenAPI", deliverable: "A public specification", resource: { name: "OpenAPI", url: "https://spec.openapis.org/oas/latest.html" }, priority: 1, done: false, hours: 8 }] },
    }));
  });
  await page.goto("/results");
  await expect(page.locator("header select")).toBeEnabled();
  await expect(page.getByRole("tab")).toHaveCount(3);
  await page.locator("summary").first().click();
  await audit(page);
  await page.getByRole("tab").nth(1).click();
  await expect(page.getByRole("tabpanel")).toContainText("Publish an OpenAPI example");
  await audit(page);
  await page.getByRole("checkbox").first().check();
  await expect(page.getByRole("checkbox").first()).toHaveAttribute("aria-checked", "true");
  const exportButton = page.getByRole("button", { name: /Export|تصدير/ }).first();
  await exportButton.click();
  await expect(exportButton).toHaveAttribute("aria-expanded", "true");
  await audit(page);
  await page.keyboard.press("Escape");
  await expect(exportButton).toBeFocused();
  await expect(exportButton).toHaveAttribute("aria-expanded", "false");
});
