import { z } from "zod";
import { createCheckout } from "@/lib/server/payments";
import { currencyFor } from "@/lib/server/geo";
import { dailyLimit, json, rateLimit, readJson } from "@/lib/server/guard";

const Body = z.object({
  plan: z.enum(["day", "week"]),
  // Ignored: the server picks the currency from the visitor's location (naira only in Nigeria).
  currency: z.enum(["NGN", "USD"]).optional(),
  // Optional: receipt + pass recovery. Only a salted fingerprint is stored on the order.
  email: z.string().trim().max(254).email().optional().or(z.literal("")),
});

/** Starts a Bachs checkout. The price comes from our server-side plan table, never the browser. */
export async function POST(req: Request) {
  const limited = await rateLimit(req);
  if (limited) return limited;
  const read = await readJson(req, 1_000);
  if (read instanceof Response) return read;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return json({ error: parsed.error.issues.some((i) => i.path[0] === "email") ? "That email doesn't look right." : "Choose a pass and currency." }, 400);
  if (!(await dailyLimit(req, "checkout", 10))) return json({ error: "Too many checkout attempts today. Try again tomorrow." }, 429);
  const r = await createCheckout(req, parsed.data.plan, currencyFor(req), parsed.data.email || undefined);
  return "error" in r ? json({ error: r.error }, r.status) : json(r);
}
