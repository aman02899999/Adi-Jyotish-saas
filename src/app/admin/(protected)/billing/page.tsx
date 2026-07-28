import { AdminBilling } from "@/components/admin-billing";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAdminBilling } from "@/lib/billing";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  await requireAdminPage("billing");
  const rows = await getAdminBilling();
  return <AdminShell active="Billing"><div className="admin-content"><div className="admin-heading"><div><p>Jyotish / Finance</p><h1>Billing</h1><span>Collect, reconcile, and refund consultation revenue.</span></div><div><small>Ledger status</small><strong>Live <i/></strong></div></div><AdminBilling initialInvoices={rows} razorpayConfigured={isRazorpayConfigured()}/></div></AdminShell>;
}
