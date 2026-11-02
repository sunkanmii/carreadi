import { z } from "zod";
import { accountsEnabled, requestLink, signOut, validAuthToken, validEmail, verifyLink } from "@/lib/server/account";
import { dailyLimit, json, rateLimit, readJson } from "@/lib/server/guard";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), email: z.string().max(254), passToken: z.string().max(100).optional() }),
  z.object({ action: z.literal("verify"), token: z.string().max(100) }),
  z.object({ action: z.literal("signout") }),
]);

export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  if (!accountsEnabled()) return json({ error: "Sign-in isn't available yet. Your checks are still saved on this device." }, 503);
  const read = await readJson(req, 2_000);
  if (read instanceof Response) return read;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  const body = parsed.data;
  try {
    if (body.action === "request") {
      if (!validEmail(body.email)) return json({ error: "Enter a valid email address." }, 400);
      if (!(await dailyLimit(req, "signin", 10))) return json({ error: "Too many sign-in emails today. Try again tomorrow." }, 429);
      const r = await requestLink(req, body.email, body.passToken);
      if (r === "busy") return json({ error: "We've sent a few links already. Check your inbox and spam folder, or try again in an hour." }, 429);
      return json({ ok: true });
    }
    if (body.action === "verify") {
      if (!validAuthToken(body.token)) return json({ error: "That sign-in link isn't valid." }, 400);
      if (!(await dailyLimit(req, "verify", 30))) return json({ error: "Too many attempts today. Try again tomorrow." }, 429);
      const session = await verifyLink(body.token);
      return session ? json({ session }) : json({ error: "This link has expired or was already used. Ask for a new one." }, 410);
    }
    await signOut(req);
    return json({ ok: true });
  } catch (e) {
    console.error("auth_failed", e instanceof Error ? e.message : "unknown");
    return json({ error: "Couldn't sign you in right now. Try again in a moment." }, 503);
  }
}
