import { AdminReviews } from "@/components/admin-reviews";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAdminReviews } from "@/lib/marketplace";
import { getPractitionerDirectory } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  await requireAdminPage("reviews");
  const [reviews, directory] = await Promise.all([getAdminReviews(), getPractitionerDirectory(false, true)]);
  const practitioners = directory.map((person) => ({ id: person.id, name: person.name, featured: person.featured }));
  return <AdminShell active="Reviews"><div className="admin-content"><div className="admin-heading"><div><p>Jyotish / Trust</p><h1>Reviews</h1><span>Moderate verified-session feedback across the marketplace.</span></div><div><small>Last synced</small><strong>Just now <i /></strong></div></div><AdminReviews initialReviews={reviews} practitioners={practitioners} /></div></AdminShell>;
}
