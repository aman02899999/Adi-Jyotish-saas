import { AdminGemstoneOrders } from "@/components/admin-gemstone-orders";
import { AdminGemstoneTabs } from "@/components/admin-gemstone-tabs";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAllOrdersAdmin } from "@/lib/gemstone-orders";

export const dynamic = "force-dynamic";

export default async function AdminGemstoneOrdersPage() {
  await requireAdminPage("gemstones");
  const orders = await getAllOrdersAdmin();
  return (
    <AdminShell active="Gemstones">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Gemstone Store</p><h1>Orders</h1><span>Track, process, and ship customer orders.</span></div></div>
        <AdminGemstoneTabs active="Orders" />
        <AdminGemstoneOrders initialOrders={orders} />
      </div>
    </AdminShell>
  );
}
