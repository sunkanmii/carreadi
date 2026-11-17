import { describe, expect, it, vi } from "vitest";
import { codeProblem, normalizeCode, randomCode } from "@/lib/codes";
import { priceOf, PROMO } from "@/lib/plans";

// A real SQL database behind the D1 interface, so the code-counting statements are tested for real.
vi.mock("cloudflare:workers", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const sql = new DatabaseSync(":memory:");
  const statement = (text: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => statement(text, a),
    first: async () => sql.prepare(text).get(...(args as never[])) ?? null,
    all: async () => ({ results: sql.prepare(text).all(...(args as never[])) }),
    run: async () => (/RETURNING/i.test(text) ? void sql.prepare(text).all(...(args as never[])) : sql.prepare(text).run(...(args as never[]))),
  });
  const DB = {
    prepare: (text: string) => statement(text),
    batch: async (list: { all(): Promise<unknown> }[]) => Promise.all(list.map((s) => s.all())),
    exec: async (text: string) => sql.exec(text),
  };
  return { env: { DB } };
});

const afterPromo = PROMO ? Date.parse(PROMO.endsAt) + 1 : Date.now();
const local = () => new Request("http://localhost:5173/api/checkout");

describe("discount code rules", () => {
  it("tidies what was typed and refuses things that can't be codes", () => {
    expect(normalizeCode(" career day-70 ")).toBe("CAREERDAY-70");
    expect(normalizeCode("abc")).toBeNull();
    expect(normalizeCode("-ABCD")).toBeNull();
    expect(normalizeCode("x'; DROP TABLE orders;--")).toBeNull();
    expect(normalizeCode(123)).toBeNull();
  });
  it("makes random codes without look-alike characters", () => {
    const codes = new Set(Array.from({ length: 200 }, () => randomCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(normalizeCode(randomCode("CD26"))).toMatch(/^CD26-[A-HJ-NP-Z2-9]{8}$/);
  });
  it("knows when a code is ended, used up or for another pass", () => {
    const c = { active: 1, expires_at: null, max_uses: 2, used: 1, plan: "day" as const };
    expect(codeProblem(null)).toBe("unknown");
    expect(codeProblem(c, "day")).toBeNull();
    expect(codeProblem(c, "week")).toBe("plan");
    expect(codeProblem({ ...c, used: 2 })).toBe("used_up");
    expect(codeProblem({ ...c, active: 0 })).toBe("ended");
    expect(codeProblem({ ...c, expires_at: 1000 }, "day", 1000)).toBe("ended");
  });
  it("prices a code like a promo: whole naira and cents, free at 100%", () => {
    expect(priceOf("week", "NGN", afterPromo, 70)).toBe(150_000);
    expect(priceOf("day", "USD", afterPromo, 70)).toBe(60);
    expect(priceOf("week", "NGN", afterPromo, 100)).toBe(0);
    expect(priceOf("week", "NGN", afterPromo)).toBe(500_000);
    if (PROMO && PROMO.percent > 20) expect(priceOf("day", "NGN", Date.parse(PROMO.startsAt), 20)).toBe(priceOf("day", "NGN", Date.parse(PROMO.startsAt)));
  });
});

describe("redeeming codes", () => {
  const setup = async () => {
    const payments = await import("@/lib/server/payments");
    const codes = await import("@/lib/server/codes");
    return { ...payments, ...codes, d: await payments.paymentDb() };
  };
  const make = { count: 1, plan: null, maxUses: 1 as number | null, expiresAt: null as number | null, note: "" };

  it("a 100% code starts a pass at once, with no payment page, and only as often as allowed", async () => {
    const { d, createCodes, createCheckout, findCode, passStatus, consumePass } = await setup();
    expect(await createCodes(d, { ...make, percent: 100, code: "freeday" })).toEqual(["FREEDAY"]);
    expect(await createCodes(d, { ...make, percent: 100, code: "FREEDAY" })).toBeNull(); // already exists

    const r = await createCheckout(local(), "week", "NGN", undefined, "FREEDAY");
    if ("error" in r) throw Error(r.error);
    expect(r.url).toBeNull();
    const s = await passStatus(r.token);
    expect(s).toMatchObject({ active: true, plan: "week", analysesLeft: 20 });
    expect(s.expiresAt! - Date.now()).toBeGreaterThan(6.9 * 864e5);
    expect(await consumePass(r.token)).toBe(19);

    expect(await createCheckout(local(), "week", "NGN", undefined, "FREEDAY")).toMatchObject({ status: 400, error: expect.stringContaining("used up") });
    expect((await findCode(d, "FREEDAY"))!.used).toBe(1);
  });

  it("a shared code stops exactly at its limit, even when redeemed at the same moment", async () => {
    const { d, createCodes, createCheckout, findCode } = await setup();
    await createCodes(d, { ...make, percent: 100, code: "ROOM-OF-3", maxUses: 3 });
    const results = await Promise.all(Array.from({ length: 8 }, () => createCheckout(local(), "day", "USD", undefined, "ROOM-OF-3")));
    expect(results.filter((r) => "token" in r)).toHaveLength(3);
    expect((await findCode(d, "ROOM-OF-3"))!.used).toBe(3);
  });

  it("refuses unknown, switched-off, expired and wrong-pass codes without starting an order", async () => {
    const { d, createCodes, createCheckout, setCodeActive } = await setup();
    await createCodes(d, { ...make, percent: 100, code: "DAYONLY", plan: "day" });
    await createCodes(d, { ...make, percent: 100, code: "OLDCODE", expiresAt: Date.now() - 1 });
    await createCodes(d, { ...make, percent: 100, code: "OFFCODE" });
    await setCodeActive(d, "OFFCODE", false);
    for (const [code, plan] of [["NOSUCHCODE", "day"], ["DAYONLY", "week"], ["OLDCODE", "day"], ["OFFCODE", "day"]] as const)
      expect(await createCheckout(local(), plan, "USD", undefined, code), code).toMatchObject({ status: 400 });
    const { n } = (await d.prepare("SELECT COUNT(*) AS n FROM orders WHERE code IN ('DAYONLY', 'OLDCODE', 'OFFCODE')").first<{ n: number }>())!;
    expect(n).toBe(0);
  });

  it("a part-discount still needs a real payment, and keeps its use when checkout can't open", async () => {
    const { d, createCodes, createCheckout, findCode } = await setup();
    await createCodes(d, { ...make, percent: 70, code: "SEVENTY" });
    // No Bachs keys in tests: nothing is free, so nothing is granted.
    expect(await createCheckout(local(), "week", "NGN", undefined, "SEVENTY")).toMatchObject({ status: 503 });
    expect((await findCode(d, "SEVENTY"))!.used).toBe(0);
  });

  it("makes batches of single-use codes", async () => {
    const { d, createCodes, listCodes } = await setup();
    const batch = await createCodes(d, { ...make, percent: 70, count: 25, prefix: "cd26", note: "Career day" });
    expect(new Set(batch).size).toBe(25);
    expect(batch![0]).toMatch(/^CD26-/);
    expect((await listCodes(d)).filter((c) => c.note === "Career day" && c.percent === 70 && c.max_uses === 1)).toHaveLength(25);
  });
});
