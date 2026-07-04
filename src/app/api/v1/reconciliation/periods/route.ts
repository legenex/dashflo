import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { apiOk, authenticateV1, requireScope } from "@/server/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authResult = await authenticateV1(req);
  if (!authResult.ok) return authResult.response;
  const scopeErr = requireScope(authResult.auth, "reconciliation:read");
  if (scopeErr) return scopeErr;

  const url = new URL(req.url);
  const conditions = [eq(schema.reconciliationPeriods.organizationId, authResult.auth.organizationId)];
  const cpType = url.searchParams.get("counterparty_type");
  if (cpType === "buyer" || cpType === "supplier") {
    conditions.push(eq(schema.reconciliationPeriods.counterpartyType, cpType));
  }
  const status = url.searchParams.get("status");
  if (status) {
    conditions.push(eq(schema.reconciliationPeriods.status, status as "open"));
  }

  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.reconciliationPeriods)
    .where(and(...conditions));

  return apiOk({
    data: rows.map((p) => ({
      id: p.id,
      counterparty_type: p.counterpartyType,
      counterparty_id: p.counterpartyId,
      granularity: p.granularity,
      period_start: p.periodStart,
      period_end: p.periodEnd,
      expected_cents: p.expectedCents,
      invoiced_cents: p.invoicedCents,
      paid_cents: p.paidCents,
      variance_cents: p.varianceCents,
      status: p.status,
    })),
  });
}
