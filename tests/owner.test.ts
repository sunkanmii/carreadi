import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { hashEmail } from "@/lib/server/payments";
import { isOwnerAccount, ownerFor, requestLink } from "@/lib/server/account";
import { requireAdmin } from "@/lib/server/guard";
import { POST as passStatus } from "@/app/api/pass/route";

const cfg = env as Record<string, unknown>;
const sessions = new Map<string, { email_hash: string; expires_at: number }>();
const ownerEmail = "owner@example.com";
const token = "o".repeat(43);
const digest = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");
const req = (credential?: string) => new Request("https://carreadi.naijabukana.com/api/pass", {
  method: "POST",
  headers: credential ? { authorization: `Bearer ${credential}` } : {},
  body: JSON.stringify({ action: "status" }),
});

beforeEach(async () => {
  cfg.OWNER_EMAIL = ownerEmail;
  cfg.RESEND_API_KEY = "test-only";
  cfg.DATA_KEY = "test-only-key".repeat(4);
  cfg.DB = {
    batch: async () => [],
    prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({
      run: async () => ({}),
      first: async () => {
        if (sql.startsWith("SELECT email_hash FROM sessions")) {
          const row = sessions.get(String(args[0]));
          return row && row.expires_at > Number(args[1]) ? row : null;
        }
        return null;
      },
    }) }),
  };
  sessions.clear();
  sessions.set(await digest(`session:${token}`), { email_hash: await hashEmail(ownerEmail), expires_at: Date.now() + 60_000 });
});
afterEach(() => {
  for (const key of ["OWNER_EMAIL", "RESEND_API_KEY", "DATA_KEY", "DB", "ADMIN_TOKEN"]) delete cfg[key];
  vi.unstubAllGlobals();
});

describe("verified owner access", () => {
  it("recognizes normalized owner identity and fails closed without configuration", async () => {
    expect(await isOwnerAccount(await hashEmail("  OWNER@example.com "))).toBe(true);
    expect(await isOwnerAccount(await hashEmail("someone@example.com"))).toBe(false);
    delete cfg.OWNER_EMAIL;
    expect(await ownerFor(req(token))).toBe(false);
  });
  it("grants permanent feature and admin access to an authenticated owner without a purchase", async () => {
    expect(await ownerFor(req(token))).toBe(true);
    expect(await requireAdmin(req(token))).toBeNull();
    expect(await (await passStatus(req(token))).json()).toEqual({ active: true, owner: true });
  });
  it("rejects typed email addresses, forged tokens, expired sessions and other accounts", async () => {
    for (const credential of [undefined, ownerEmail, "f".repeat(43)]) expect(await ownerFor(req(credential))).toBe(false);
    sessions.set(await digest(`session:${token}`), { email_hash: await hashEmail(ownerEmail), expires_at: Date.now() - 1 });
    expect(await ownerFor(req(token))).toBe(false);
    sessions.set(await digest(`session:${token}`), { email_hash: await hashEmail("someone@example.com"), expires_at: Date.now() + 60_000 });
    expect(await ownerFor(req(token))).toBe(false);
    expect((await requireAdmin(req(token)))?.status).toBe(503);
    expect(await (await passStatus(req(token))).json()).toEqual({ active: false });
  });
  it("sends an owner a verification link even when they have never purchased a pass", async () => {
    const send = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", send);
    expect(await requestLink(req(), ownerEmail)).toBe("sent");
    expect(send).toHaveBeenCalledOnce();
    const email = JSON.parse(send.mock.calls[0][1].body);
    expect(email.to).toEqual([ownerEmail]);
    expect(email.text).toContain("/signin?token=");
    expect(await ownerFor(req())).toBe(false);
  });
  it("keeps the existing admin-token login working", async () => {
    cfg.ADMIN_TOKEN = "existing-admin-token";
    expect(await requireAdmin(req("existing-admin-token"))).toBeNull();
    expect((await requireAdmin(req("wrong-token")))?.status).toBe(401);
  });
});
