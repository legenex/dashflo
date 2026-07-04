import { NextResponse, type NextRequest } from "next/server";
import { apiError, apiOk, authenticateV1, requireScope } from "@/server/api-utils";
import { markLeadReturned } from "@/server/leads";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authResult = await authenticateV1(req);
  if (!authResult.ok) return authResult.response;
  const scopeErr = requireScope(authResult.auth, "leads:write");
  if (scopeErr) return scopeErr;

  const { id } = await params;
  const result = await markLeadReturned(authResult.auth.organizationId, id, "api");
  if (!result.ok) return apiError("return_failed", result.message, 409);
  return apiOk({ data: { lead_id: id, status: "returned" } });
}
