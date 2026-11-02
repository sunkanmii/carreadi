import { handleWebhook } from "@/lib/server/payments";

/** Register this URL in Bachs for collection.succeeded and refund.paid events. */
export async function POST(req: Request) {
  try {
    return await handleWebhook(req);
  } catch {
    // Bachs retries on 5xx, and every effect is idempotent.
    return Response.json({ error: "retry" }, { status: 503, headers: { "Retry-After": "10" } });
  }
}
