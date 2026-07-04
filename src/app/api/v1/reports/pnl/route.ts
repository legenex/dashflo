import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, authenticateV1, requireScope } from "@/server/api-utils";
import { assembleTruthDataset } from "@/server/truth-data";
import { computeTruth } from "@/domain/truth/compute";
import { toDateKey, addDays } from "@/lib/transforms";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  group_by: z.enum(["campaign", "buyer"]).default("campaign"),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authResult = await authenticateV1(req);
  if (!authResult.ok) return authResult.response;
  const scopeErr = requireScope(authResult.auth, "reports:read");
  if (scopeErr) return scopeErr;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return apiError("validation_failed", "Invalid query", 422, parsed.error.flatten());

  const from = parsed.data.from ?? toDateKey(addDays(new Date(), -30));
  const to = parsed.data.to ?? toDateKey(new Date());
  const dataset = await assembleTruthDataset(authResult.auth.organizationId);
  const result = computeTruth(dataset, { scope: parsed.data.group_by, range: { from, to } });

  return apiOk({
    data: {
      from,
      to,
      group_by: parsed.data.group_by,
      rows: result.rows.map((r) => ({
        key: r.key,
        name: r.name,
        booked: r.booked,
        verified: r.verified,
        gap: {
          revenue_gap: r.gap.revenue_gap,
          profit_gap: r.gap.profit_gap,
          outstanding: r.gap.outstanding,
          overdue: r.gap.overdue,
        },
        profit_truth: r.profit_truth,
      })),
      totals: { booked: result.totals.booked, verified: result.totals.verified, gap: result.totals.gap },
    },
  });
}
