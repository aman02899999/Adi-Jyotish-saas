import { AdminPayouts } from "@/components/admin-payouts";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAllPayoutsAdmin } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export default async function AdminPayoutsPage() {
  await requireAdminPage("billing");
  const rows = await getAllPayoutsAdmin();
  return (
    <AdminShell active="Payouts">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Finance</p><h1>Payouts</h1><span>Review and disburse practitioner earnings requests.</span></div><div><small>Ledger status</small><strong>Live <i /></strong></div></div>
        <AdminPayouts initialPayouts={rows} />
      </div>
    </AdminShell>
  );
}
