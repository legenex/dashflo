import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, authenticateV1, requireScope } from "@/server/api-utils";
import { assembleTruthDataset } from "@/server/truth-data";
import { computeTruth } from "@/domain/truth/compute";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  scope: z.enum(["campaign", "buyer", "supplier", "day", "org", "state"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// GET /api/v1/truth?scope=campaign&from=&to=  DashFlo's signature endpoint:
// the four layers per row, null meaning UNKNOWN, never zero.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authResult = await authenticateV1(req);
  if (!authResult.ok) return authResult.response;
  const scopeErr = requireScope(authResult.auth, "truth:read");
  if (scopeErr) return scopeErr;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return apiError("validation_failed", "Invalid query", 422, parsed.error.flatten());
  }

  const dataset = await assembleTruthDataset(authResult.auth.organizationId);
  const result = computeTruth(dataset, {
    scope: parsed.data.scope,
    range:
      parsed.data.from && parsed.data.to ? { from: parsed.data.from, to: parsed.data.to } : undefined,
  });

  return apiOk({
    data: {
      rows: result.rows,
      totals: result.totals,
      generated_at: result.generatedAt,
      semantics: "All money integer cents. null = UNKNOWN (missing source), never zero.",
    },
  });
}
