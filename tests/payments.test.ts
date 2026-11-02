import { describe, expect, it } from "vitest";
import { toPreview, type Analysis } from "@/lib/analysis/schema";
import { checkoutURL, majorAmount, minorAmount, paymentMode, validSignature } from "@/lib/server/bachs";
import { PASSES } from "@/lib/plans";

async function sign(secret: string, t: number, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("Bachs webhook signatures", () => {
  const secret = "whsec_test_123";
  const body = '{"id":"evt_1","type":"collection.succeeded"}';
  const now = Date.UTC(2026, 10, 2, 12) ;
  const t = Math.floor(now / 1000);

  it("accepts a valid V2 signature", async () => {
    const h = new Headers({ "X-Bachs-Signature-V2": `t=${t},v1=${await sign(secret, t, body)}` });
    expect(await validSignature(h, body, secret, now)).toBe(true);
  });
  it("rejects a tampered body, wrong secret, old timestamp and missing secret", async () => {
    const good = `t=${t},v1=${await sign(secret, t, body)}`;
    expect(await validSignature(new Headers({ "X-Bachs-Signature-V2": good }), body + " ", secret, now)).toBe(false);
    expect(await validSignature(new Headers({ "X-Bachs-Signature-V2": good }), body, "other", now)).toBe(false);
    expect(await validSignature(new Headers({ "X-Bachs-Signature-V2": good }), body, secret, now + 10 * 60_000)).toBe(false);
    expect(await validSignature(new Headers({ "X-Bachs-Signature-V2": good }), body, undefined, now)).toBe(false);
  });
});

describe("amounts and links", () => {
  it("converts money without floating-point errors", () => {
    expect(minorAmount("2000.00")).toBe(200_000);
    expect(minorAmount("5")).toBe(500);
    expect(minorAmount("1e3")).toBeNull();
    expect(minorAmount(2000 as unknown as string)).toBeNull();
    expect(majorAmount(PASSES.week.price.NGN)).toBe("5000.00");
    expect(majorAmount(PASSES.day.price.USD)).toBe("2.00");
  });
  it("only trusts Bachs checkout links for the current mode", () => {
    expect(checkoutURL("https://sandbox-checkout.bachs.io/c/abc", true)).toBe("https://sandbox-checkout.bachs.io/c/abc");
    expect(checkoutURL("https://checkout.bachs.io/c/abc", true)).toBeNull();
    expect(checkoutURL("https://evil.example/c/abc", false)).toBeNull();
    expect(checkoutURL("javascript:alert(1)", false)).toBeNull();
  });
  it("takes the mode from the key and switches off when anything is missing", () => {
    const base = { BACHS_WEBHOOK_SECRET: "w", BACHS_ORGANIZATION_ID: "org_1" };
    expect(paymentMode({ ...base, BACHS_API_KEY: "sk_sandbox_x" })).toBe("test");
    expect(paymentMode({ ...base, BACHS_API_KEY: "sk_live_x" })).toBe("live");
    expect(paymentMode({ ...base, BACHS_API_KEY: "pk_live_x" })).toBe("disabled");
    expect(paymentMode({ BACHS_API_KEY: "sk_live_x" })).toBe("disabled");
  });
});

describe("free preview", () => {
  const f = (requirement: string, status: Analysis["findings"][number]["status"], priority: number) => ({
    requirement, status, priority, evidence: "", importance: "required" as const, action: "a", deliverable: "d",
    resource: { name: "", url: "" }, estimatedHours: 5, evidenceVerified: false,
  });
  const a: Analysis = {
    roleTitle: "R", summary: "S", demonstratedSkills: ["SQL"], model: "m", createdAt: "",
    findings: [f("SQL", "demonstrated", 3), f("Go", "missing", 2), f("K8s", "missing", 1), f("AWS", "not_shown", 1), f("Visa", "eligibility", 1)],
  };
  it("keeps only strengths and removes every gap and the summary", () => {
    const p = toPreview(a);
    expect(p.findings.map((x) => x.requirement)).toEqual(["SQL"]);
    expect(p.summary).toBe("");
    expect(p.preview).toEqual({ locked: 4 });
    expect(JSON.stringify(p)).not.toMatch(/"(Go|K8s|AWS|Visa)"/);
  });
  it("leaves a free preview with an empty roadmap", async () => {
    const { buildRoadmap } = await import("@/lib/roadmap");
    expect(buildRoadmap(toPreview(a)).tasks).toEqual([]);
  });
});

describe("checkout return address", () => {
  it("returns buyers to the address they started on, and only to our own addresses", async () => {
    const { publicOrigin } = await import("@/lib/server/payments");
    expect(publicOrigin(new Request("https://carreadi.naijabukana.com/api/checkout"))).toBe("https://carreadi.naijabukana.com");
    expect(publicOrigin(new Request("https://carreadi.sunkanmifafowora.workers.dev/api/checkout"))).toBe("https://carreadi.sunkanmifafowora.workers.dev");
    expect(publicOrigin(new Request("https://evil.example/api/checkout"))).toBeNull();
    expect(publicOrigin(new Request("http://localhost:5173/api/checkout"))).toBeNull();
  });
});

describe("currency by location", () => {
  it("charges naira only in Nigeria, dollars everywhere else", async () => {
    const { currencyFor } = await import("@/lib/server/geo");
    const req = (country?: string) => new Request("https://x.test/", { headers: country ? { "cf-ipcountry": country } : {} });
    expect(currencyFor(req("NG"))).toBe("NGN");
    expect(currencyFor(req("GB"))).toBe("USD");
    expect(currencyFor(req("US"))).toBe("USD");
    expect(currencyFor(req())).toBe("USD");
  });
});

describe("pass activity", () => {
  it("is active only while paid, unexpired and with analyses left", async () => {
    const { passIsActive } = await import("@/lib/server/payments");
    const now = Date.now();
    const base = { status: "paid" as const, expires_at: now + 864e5, analyses_used: 0, analyses_limit: 5 };
    expect(passIsActive(base, now)).toBe(true);
    expect(passIsActive({ ...base, analyses_used: 5 }, now)).toBe(false); // used up → may buy again
    expect(passIsActive({ ...base, expires_at: now - 1 }, now)).toBe(false);
    expect(passIsActive({ ...base, status: "pending" as never }, now)).toBe(false);
    expect(passIsActive({ ...base, status: "reversed" as never }, now)).toBe(false); // refunded
  });
});
