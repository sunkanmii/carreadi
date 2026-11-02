import { currencyFor } from "@/lib/server/geo";
import { json } from "@/lib/server/guard";

/** The currency this visitor pays in, decided by location (never by the browser). */
export function GET(req: Request) {
  return json({ currency: currencyFor(req) });
}
