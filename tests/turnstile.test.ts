import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { requireHuman, turnstileEnabled } from "@/lib/server/turnstile";

const bag = env as Record<string, string | undefined>;
const req = new Request("https://carreadi.example/api/feedback", { method: "POST" });

function siteverify(result: object, ok = true) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(result), { status: ok ? 200 : 500 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("requireHuman", () => {
  beforeEach(() => {
    bag.TURNSTILE_SECRET = "secret";
    delete bag.TURNSTILE_HOSTNAMES;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete bag.TURNSTILE_SECRET;
    delete bag.TURNSTILE_HOSTNAMES;
  });

  it("lets everything through until a secret is set", async () => {
    delete bag.TURNSTILE_SECRET;
    const f = siteverify({ success: false });
    expect(turnstileEnabled()).toBe(false);
    expect(await requireHuman(req, undefined, "feedback")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("accepts a good token for the right action and host", async () => {
    siteverify({ success: true, action: "feedback", hostname: "carreadi.example" });
    expect(await requireHuman(req, "token", "feedback")).toBeNull();
  });

  it("blocks a missing or oversized token without calling Cloudflare", async () => {
    const f = siteverify({ success: true, action: "feedback", hostname: "carreadi.example" });
    expect((await requireHuman(req, undefined, "feedback"))?.status).toBe(403);
    expect((await requireHuman(req, "", "feedback"))?.status).toBe(403);
    expect((await requireHuman(req, "x".repeat(2049), "feedback"))?.status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it("blocks a failed check, another form's token, or another site's token", async () => {
    siteverify({ success: false });
    expect((await requireHuman(req, "t", "feedback"))?.status).toBe(403);
    siteverify({ success: true, action: "support", hostname: "carreadi.example" });
    expect((await requireHuman(req, "t", "feedback"))?.status).toBe(403);
    siteverify({ success: true, action: "feedback", hostname: "evil.example" });
    expect((await requireHuman(req, "t", "feedback"))?.status).toBe(403);
  });

  it("uses TURNSTILE_HOSTNAMES when set", async () => {
    bag.TURNSTILE_HOSTNAMES = "carreadi.naijabukana.com, www.carreadi.com";
    siteverify({ success: true, action: "feedback", hostname: "www.carreadi.com" });
    expect(await requireHuman(req, "t", "feedback")).toBeNull();
    siteverify({ success: true, action: "feedback", hostname: "carreadi.example" });
    expect((await requireHuman(req, "t", "feedback"))?.status).toBe(403);
  });

  it("fails closed when Cloudflare errors or can't be reached", async () => {
    siteverify({}, false);
    expect((await requireHuman(req, "t", "feedback"))?.status).toBe(403);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await requireHuman(req, "t", "feedback"))?.status).toBe(403);
  });

  it("sends the secret and token to siteverify", async () => {
    const f = siteverify({ success: true, action: "feedback", hostname: "carreadi.example" });
    await requireHuman(req, "the-token", "feedback");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("the-token");
  });
});
