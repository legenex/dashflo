import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { apiError, apiOk, authenticateV1, requireScope } from "@/server/api-utils";
import { serializeLead } from "@/server/serializers";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authResult = await authenticateV1(req);
  if (!authResult.ok) return authResult.response;
  const scopeErr = requireScope(authResult.auth, "leads:read");
  if (scopeErr) return scopeErr;

  const { id } = await params;
  const db = await getDb();
  const lead = await db.query.leads.findFirst({
    where: and(eq(schema.leads.id, id), eq(schema.leads.organizationId, authResult.auth.organizationId)),
  });
  if (!lead) return apiError("not_found", "No lead with that id", 404);

  const [events, attempts] = await Promise.all([
    db.query.leadEvents.findMany({
      where: eq(schema.leadEvents.leadId, id),
      orderBy: asc(schema.leadEvents.at),
    }),
    db.query.distributionAttempts.findMany({
      where: eq(schema.distributionAttempts.leadId, id),
      orderBy: asc(schema.distributionAttempts.at),
    }),
  ]);

  return apiOk({
    data: {
      ...serializeLead(lead),
      events: events.map((e) => ({ kind: e.kind, detail: e.detail, at: e.at.toISOString() })),
      attempts: attempts.map((a) => ({
        buyer_id: a.buyerId,
        type: a.attemptType,
        outcome: a.outcome,
        response_code: a.responseCode,
        bid_cents: a.bidCents,
        duration_ms: a.durationMs,
        at: a.at.toISOString(),
      })),
    },
  });
}
