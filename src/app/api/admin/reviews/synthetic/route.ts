import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { purgeSyntheticReviews } from "@/lib/synthetic-reviews";

export const dynamic = "force-dynamic";

/**
 * Permanently deletes every synthetic review. Held to the same bar creating them was — reviews AND
 * practitioners — because it rewrites every practitioner's review history at once.
 */
export async function DELETE() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "reviews") || !hasAdminPermission(admin, "practitioners")) {
    return Response.json({ error: "Reviews and practitioners permission required." }, { status: 403 });
  }

  const deleted = await purgeSyntheticReviews();
  await recordAudit(admin, "reviews.synthetic_purged", "practitioner_review", "synthetic", { deleted });
  return Response.json({ deleted });
}
