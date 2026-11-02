import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeQuota, readJson, weekStart } from "@/lib/server/guard";

// No DB binding in tests, so this exercises the in-memory fallback with the same rules.
const req = (ip: string) => new Request("https://x.test/api/analyze", { headers: { "cf-connecting-ip": ip } });

afterEach(() => vi.useRealTimers());

describe("readJson", () => {
  const streamed = (text: string) =>
    new Request("https://x.test/api", {
      method: "POST",
      // A stream body has no Content-Length, like a client that omits the header.
      body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } }),
      duplex: "half",
    } as RequestInit);

  it("rejects oversized bodies even without Content-Length", async () => {
    const r = await readJson(streamed(JSON.stringify({ x: "a".repeat(5000) })), 1000);
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(413);
  });
  it("parses small bodies and rejects bad JSON", async () => {
    expect(await readJson(streamed('{"ok":1}'), 1000)).toEqual({ body: { ok: 1 } });
    expect(((await readJson(streamed("{nope"), 1000)) as Response).status).toBe(400);
  });
});

describe("weekStart", () => {
  it("returns the Monday of the UTC week", () => {
    expect(weekStart(new Date("2026-11-02T10:00:00Z"))).toBe("2026-11-02"); // Monday
    expect(weekStart(new Date("2026-11-08T23:59:00Z"))).toBe("2026-11-02"); // Sunday
    expect(weekStart(new Date("2026-11-09T00:00:00Z"))).toBe("2026-11-09");
  });
});

describe("consumeQuota", () => {
  it("allows one free analysis per week, and blocked attempts don't count", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T09:00:00Z"));
    const ip = "203.0.113.7";
    expect((await consumeQuota(req(ip))).ok).toBe(true);
    expect(await consumeQuota(req(ip))).toMatchObject({ ok: false });
    vi.setSystemTime(new Date("2026-11-05T09:00:00Z")); // same week, new day
    expect(await consumeQuota(req(ip))).toMatchObject({ ok: false, limit: "week" });
    vi.setSystemTime(new Date("2026-11-09T09:00:00Z")); // next Monday
    expect((await consumeQuota(req(ip))).ok).toBe(true);
  });

  it("lets the same résumé and job run again (a dropped request), but not a different one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T09:00:00Z"));
    const ip = "192.0.2.44";
    expect((await consumeQuota(req(ip), "cv+job-a")).ok).toBe(true);
    expect((await consumeQuota(req(ip), "cv+job-a")).ok).toBe(true); // came back from another app
    expect(await consumeQuota(req(ip), "cv+job-b")).toMatchObject({ ok: false });
    for (let i = 0; i < 4; i++) await consumeQuota(req(ip), "cv+job-a");
    expect(await consumeQuota(req(ip), "cv+job-a")).toMatchObject({ ok: false }); // re-runs are capped
  });

  it("refund gives an analysis back", async () => {
    const q = await consumeQuota(req("198.51.100.1"));
    expect(q.ok).toBe(true);
    await q.refund();
    expect((await consumeQuota(req("198.51.100.1"))).ok).toBe(true);
  });
});
