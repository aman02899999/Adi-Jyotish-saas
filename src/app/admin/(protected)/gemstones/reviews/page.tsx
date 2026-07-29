import { AdminGemstoneReviews } from "@/components/admin-gemstone-reviews";
import { AdminGemstoneTabs } from "@/components/admin-gemstone-tabs";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAllReviewsAdmin } from "@/lib/gemstone-reviews";

export const dynamic = "force-dynamic";

export default async function AdminGemstoneReviewsPage() {
  await requireAdminPage("gemstones");
  const reviews = await getAllReviewsAdmin();
  return (
    <AdminShell active="Gemstones">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Gemstone Store</p><h1>Reviews</h1><span>Moderate customer reviews before they go live.</span></div></div>
        <AdminGemstoneTabs active="Reviews" />
        <AdminGemstoneReviews initialReviews={reviews} />
      </div>
    </AdminShell>
  );
}
