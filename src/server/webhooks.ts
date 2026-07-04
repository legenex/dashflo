import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/id";
import { hmacSha256Hex } from "@/lib/hash";

// Org webhook dispatch: lead.sold, lead.rejected, payment.received,
// variance.flagged. HMAC-SHA256 signature in X-DashFlo-Signature, retries
// with backoff, full delivery log.

export async function dispatchWebhookEvent(
  organizationId: string,
  event: "lead.sold" | "lead.rejected" | "payment.received" | "variance.flagged",
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  const subs = await db.query.webhookSubscriptions.findMany({
    where: and(
      eq(schema.webhookSubscriptions.organizationId, organizationId),
      eq(schema.webhookSubscriptions.status, "active")
    ),
  });

  for (const sub of subs) {
    if (!sub.events.includes(event) && !sub.events.includes("*")) continue;
    const body = JSON.stringify({ event, data: payload, sent_at: new Date().toISOString() });
    const signature = hmacSha256Hex(sub.signingSecret, body);

    let responseCode: number | null = null;
    let attempts = 0;
    let delivered = false;
    for (let i = 0; i < 3; i++) {
      attempts++;
      try {
        const res = await fetch(sub.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-DashFlo-Event": event,
            "X-DashFlo-Signature": `sha256=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(6000),
        });
        responseCode = res.status;
        if (res.ok) {
          delivered = true;
          break;
        }
      } catch {
        responseCode = 0;
      }
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }

    await db.insert(schema.webhookDeliveries).values({
      id: newId("whd"),
      organizationId,
      subscriptionId: sub.id,
      event,
      payload,
      responseCode,
      attempts,
      status: delivered ? "delivered" : "failed",
      at: new Date(),
    });
  }
}
