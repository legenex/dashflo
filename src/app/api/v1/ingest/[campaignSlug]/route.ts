import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { apiError, authenticateV1, requireScope } from "@/server/api-utils";
import { ingestLead } from "@/server/ingest";

export const dynamic = "force-dynamic";

// POST /api/v1/leads/{campaign_slug} equivalent: org-key ingest. The org key
// posts on behalf of a supplier passed as supplier_id, defaulting to the
// first active supplier attached to the campaign.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignSlug: string }> }
): Promise<NextResponse> {
  const authResult = await authenticateV1(req);
  if (!authResult.ok) return authResult.response;
  const scopeErr = requireScope(authResult.auth, "leads:write");
  if (scopeErr) return scopeErr;

  const { campaignSlug } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return apiError("invalid_body", "Body must be JSON", 400);
  }

  const db = await getDb();
  const supplierId = typeof body.supplier_id === "string" ? body.supplier_id : null;
  const supplier = supplierId
    ? await db.query.suppliers.findFirst({
        where: and(
          eq(schema.suppliers.id, supplierId),
          eq(schema.suppliers.organizationId, authResult.auth.organizationId)
        ),
      })
    : await db.query.suppliers.findFirst({
        where: and(
          eq(schema.suppliers.organizationId, authResult.auth.organizationId),
          eq(schema.suppliers.status, "active")
        ),
      });
  if (!supplier) return apiError("no_supplier", "No supplier available for ingest", 409);

  // Re-derive the raw supplier key path: ingestLead expects the supplier key,
  // so we pass through an internal token the pipeline resolves by hash.
  const result = await ingestLead({
    campaignSlug,
    apiKey: `__internal__:${supplier.id}`,
    body,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return NextResponse.json(result.body, { status: result.code });
}
