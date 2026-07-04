import { requireOrg } from "@/server/org";
import { WhiteLabelForm } from "./WhiteLabelForm";

export const dynamic = "force-dynamic";

export default async function WhiteLabelPage() {
  const ctx = await requireOrg();
  return <WhiteLabelForm whiteLabel={ctx.organization.whiteLabel} />;
}
