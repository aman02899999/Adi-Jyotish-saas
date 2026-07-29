import Link from "next/link";
import { AlertTriangle, Boxes, Gem, IndianRupee, Package, Star, TicketPercent } from "lucide-react";
import { AdminGemstoneTabs } from "@/components/admin-gemstone-tabs";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getGemstoneAdminStats, getLowStockVariants } from "@/lib/gemstone-orders";
import { getAllReviewsAdmin } from "@/lib/gemstone-reviews";
import { getAllCategoriesAdmin, getAllProductsAdmin } from "@/lib/gemstones";

export const dynamic = "force-dynamic";

export default async function AdminGemstonesOverviewPage() {
  await requireAdminPage("gemstones");
  const [stats, lowStock, products, categories, pendingReviews] = await Promise.all([
    getGemstoneAdminStats(),
    getLowStockVariants(),
    getAllProductsAdmin(),
    getAllCategoriesAdmin(),
    getAllReviewsAdmin("pending"),
  ]);

  return (
    <AdminShell active="Gemstones">
      <div className="admin-content">
        <div className="admin-heading">
          <div><p>Jyotish / Gemstone Store</p><h1>Gemstones</h1><span>Buy Gemstones module overview.</span></div>
          <div><small>Products</small><strong>{products.length} listed <i /></strong></div>
        </div>
        <AdminGemstoneTabs active="Overview" />

        <section className="gem-admin-stats">
          <article><span><IndianRupee size={19} /></span><div><small>Revenue collected</small><strong>₹{stats.revenue.toLocaleString()}</strong><p>{stats.paidOrderCount} paid orders</p></div></article>
          <article><span><Package size={19} /></span><div><small>Orders</small><strong>{Object.values(stats.statusCounts).reduce((sum, count) => sum + count, 0)}</strong><p>{stats.statusCounts.pending ?? 0} awaiting processing</p></div></article>
          <article><span><Boxes size={19} /></span><div><small>Catalog</small><strong>{products.length}</strong><p>{categories.length} categories</p></div></article>
          <article><span><AlertTriangle size={19} /></span><div><small>Low stock</small><strong>{stats.lowStockVariantCount}</strong><p>Variants at 5 units or fewer</p></div></article>
        </section>

        <div className="gem-admin-grid">
          <section className="admin-table-card">
            <div className="admin-table-header"><div><h2>Low stock alerts</h2><p>Restock these before they sell out.</p></div><Link href="/admin/gemstones/products" className="button button--small button--ghost">Manage products</Link></div>
            <div className="service-table" role="table" aria-label="Low stock variants">
              <div className="service-table__head" role="row"><span>Product</span><span>Variant</span><span>Stock</span></div>
              {lowStock.slice(0, 8).map((row) => (
                <div className="service-table__row" role="row" key={row.variant.id}>
                  <div className="table-service"><span className="table-service__icon"><Gem size={17} /></span><div><strong>{row.productName}</strong><small>{row.productSlug}</small></div></div>
                  <span>{row.variant.label}</span>
                  <strong style={{ color: row.variant.stockQuantity === 0 ? "#a5473b" : undefined }}>{row.variant.stockQuantity} left</strong>
                </div>
              ))}
              {!lowStock.length && <div className="empty-state"><Boxes size={24} /><h3>Stock levels are healthy</h3><p>Nothing needs restocking right now.</p></div>}
            </div>
          </section>

          <section className="admin-table-card">
            <div className="admin-table-header"><div><h2>Pending reviews</h2><p>Awaiting moderation before they go live.</p></div><Link href="/admin/gemstones/reviews" className="button button--small button--ghost"><Star size={14} /> Moderate</Link></div>
            <div className="service-table" role="table" aria-label="Pending reviews">
              <div className="service-table__head" role="row"><span>Product</span><span>Reviewer</span><span>Rating</span></div>
              {pendingReviews.slice(0, 8).map((review) => (
                <div className="service-table__row" role="row" key={review.id}>
                  <div className="table-service"><span className="table-service__icon"><Star size={17} /></span><div><strong>{review.productName}</strong><small>{review.title || review.body.slice(0, 40)}</small></div></div>
                  <span>{review.reviewerName}</span>
                  <strong>{review.rating} / 5</strong>
                </div>
              ))}
              {!pendingReviews.length && <div className="empty-state"><Star size={24} /><h3>No reviews waiting</h3><p>You&apos;re all caught up.</p></div>}
            </div>
          </section>
        </div>

        <div className="gem-admin-quicklinks">
          <Link href="/admin/gemstones/products"><Gem size={16} /> Manage products</Link>
          <Link href="/admin/gemstones/categories"><Boxes size={16} /> Manage categories</Link>
          <Link href="/admin/gemstones/orders"><Package size={16} /> Manage orders</Link>
          <Link href="/admin/gemstones/coupons"><TicketPercent size={16} /> Manage coupons</Link>
        </div>
      </div>
    </AdminShell>
  );
}
