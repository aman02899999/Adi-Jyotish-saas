import { AdminGemstoneProducts } from "@/components/admin-gemstone-products";
import { AdminGemstoneTabs } from "@/components/admin-gemstone-tabs";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getActiveCategories, getAllProductsAdmin } from "@/lib/gemstones";

export const dynamic = "force-dynamic";

export default async function AdminGemstoneProductsPage() {
  await requireAdminPage("gemstones");
  const [products, categories] = await Promise.all([getAllProductsAdmin(), getActiveCategories()]);
  return (
    <AdminShell active="Gemstones">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Gemstone Store</p><h1>Products</h1><span>Full catalog with weight/price variants and images.</span></div></div>
        <AdminGemstoneTabs active="Products" />
        {categories.length ? <AdminGemstoneProducts initialProducts={products} categories={categories} /> : <div className="finance-config-note"><span><strong>Create a category first</strong><span>You need at least one gemstone category before adding products.</span></span></div>}
      </div>
    </AdminShell>
  );
}
