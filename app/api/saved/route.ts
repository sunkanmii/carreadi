import { z } from "zod";
import { accountFor, accountsEnabled, deleteAccount, deleteCheck, listChecks, saveCheck } from "@/lib/server/account";
import { json, rateLimit, readJson } from "@/lib/server/guard";

// A check is results and roadmap only; the CV is never sent here.
const Entry = z.object({ id: z.string().min(1).max(500), savedAt: z.string().max(40) }).passthrough();
const Put = z.object({ entry: Entry });
const Delete = z.union([z.object({ id: z.string().min(1).max(500) }), z.object({ all: z.literal(true) })]);

async function signedIn(req: Request): Promise<string | Response> {
  const limited = await rateLimit(req);
  if (limited) return limited;
  if (!accountsEnabled()) return json({ error: "Saving isn't available yet." }, 503);
  const account = await accountFor(req);
  return account ?? json({ error: "Please sign in again.", signedOut: true }, 401);
}

export async function GET(req: Request) {
  const account = await signedIn(req);
  if (account instanceof Response) return account;
  return json({ checks: await listChecks(account) });
}

export async function PUT(req: Request) {
  const account = await signedIn(req);
  if (account instanceof Response) return account;
  const read = await readJson(req, 250_000);
  if (read instanceof Response) return read;
  const parsed = Put.safeParse(read.body);
  if (!parsed.success) return json({ error: "Invalid check." }, 400);
  if ("resumeText" in parsed.data.entry) return json({ error: "CVs are never saved." }, 400);
  const r = await saveCheck(account, parsed.data.entry);
  if (r === "too_large") return json({ error: "This check is too large to save." }, 413);
  if (r === "full") return json({ error: "You have 100 saved checks. Delete some to save more." }, 409);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const account = await signedIn(req);
  if (account instanceof Response) return account;
  const read = await readJson(req, 2_000);
  if (read instanceof Response) return read;
  const parsed = Delete.safeParse(read.body);
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  if ("all" in parsed.data) await deleteAccount(account);
  else await deleteCheck(account, parsed.data.id);
  return json({ ok: true });
}
