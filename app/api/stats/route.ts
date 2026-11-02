import { getStat } from "@/lib/server/stats";

/** Public counter: CVs checked so far. Cached briefly; it's the same for everyone. */
export async function GET() {
  return Response.json({ cvsChecked: await getStat("analyses") }, { headers: { "cache-control": "public, max-age=300" } });
}
