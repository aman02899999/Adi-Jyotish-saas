import { AdminPlans } from "@/components/admin-plans";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAllPlans } from "@/lib/plans";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  await requireAdminPage("plans");
  const plans = await getAllPlans();
  return <AdminShell active="Plans"><div className="admin-content"><div className="admin-heading"><div><p>Jyotish / Membership</p><h1>Plans</h1><span>Manage recurring membership tiers and Razorpay billing plans.</span></div><div><small>Last synced</small><strong>Just now <i /></strong></div></div><AdminPlans initialPlans={plans} razorpayConfigured={isRazorpayConfigured()} /></div></AdminShell>;
}
