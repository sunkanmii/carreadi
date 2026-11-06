import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: { baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:5173", channel: "chrome", headless: true, reducedMotion: "reduce", screenshot: "only-on-failure", trace: "retain-on-failure" },
});
