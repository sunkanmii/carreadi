import { activePromo } from "@/lib/plans";
import { currencyFor } from "@/lib/server/geo";
import { json } from "@/lib/server/guard";

/** The currency this visitor pays in (by location, never by the browser) and any running promo. */
export function GET(req: Request) {
  return json({ currency: currencyFor(req), promo: activePromo() });
}
