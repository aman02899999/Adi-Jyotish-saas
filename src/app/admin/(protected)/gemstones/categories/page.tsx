import { AdminGemstoneCategories } from "@/components/admin-gemstone-categories";
import { AdminGemstoneTabs } from "@/components/admin-gemstone-tabs";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAllCategoriesAdmin } from "@/lib/gemstones";

export const dynamic = "force-dynamic";

export default async function AdminGemstoneCategoriesPage() {
  await requireAdminPage("gemstones");
  const categories = await getAllCategoriesAdmin();
  return (
    <AdminShell active="Gemstones">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Gemstone Store</p><h1>Categories</h1><span>Organize the storefront into browsable categories.</span></div></div>
        <AdminGemstoneTabs active="Categories" />
        <AdminGemstoneCategories initialCategories={categories} />
      </div>
    </AdminShell>
  );
}
