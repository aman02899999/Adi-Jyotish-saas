import { AdminGemstoneCoupons } from "@/components/admin-gemstone-coupons";
import { AdminGemstoneTabs } from "@/components/admin-gemstone-tabs";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAllCouponsAdmin } from "@/lib/gemstone-coupons";

export const dynamic = "force-dynamic";

export default async function AdminGemstoneCouponsPage() {
  await requireAdminPage("gemstones");
  const coupons = await getAllCouponsAdmin();
  return (
    <AdminShell active="Gemstones">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Gemstone Store</p><h1>Coupons</h1><span>Discount codes customers can apply at checkout.</span></div></div>
        <AdminGemstoneTabs active="Coupons" />
        <AdminGemstoneCoupons initialCoupons={coupons} />
      </div>
    </AdminShell>
  );
}
