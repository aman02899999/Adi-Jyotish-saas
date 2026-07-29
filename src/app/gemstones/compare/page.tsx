import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Gem, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { getProductBySlug, getProductsByIds } from "@/lib/gemstones";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compare Gemstones · Buy Gemstones" };

export default async function GemstoneComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const productIds = (ids ?? "").split(",").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0).slice(0, 3);
  const items = await getProductsByIds(productIds);
  const details = await Promise.all(items.map((item) => getProductBySlug(item.slug)));

  return (
    <main className="marketing-page gem-store">
      <SiteHeader />
      <section className="shop-header shell">
        <p className="eyebrow"><span /> Buy Gemstones</p>
        <h1>Compare<br /><em>gemstones side by side.</em></h1>
      </section>
      <section className="compare-table-wrap shell">
        {details.filter(Boolean).length ? (
          <table className="compare-table">
            <thead>
              <tr>
                <th></th>
                {details.map((product) => product && (
                  <th key={product.id}>
                    <div className="compare-table__product">
                      {product.images[0] ? <div className="compare-table__art"><Image src={product.images[0].url} alt={product.name} fill sizes="200px" /></div> : <div className="compare-table__art"><Gem size={24} /></div>}
                      <Link href={`/gemstones/${product.slug}`}>{product.name}</Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><td>Price</td>{details.map((p) => p && <td key={p.id}>{p.currency} {p.variants[0]?.price ?? "—"}</td>)}</tr>
              <tr><td>Category</td>{details.map((p) => p && <td key={p.id}>{p.categoryName}</td>)}</tr>
              <tr><td>Origin</td>{details.map((p) => p && <td key={p.id}>{p.origin || "—"}</td>)}</tr>
              <tr><td>Color</td>{details.map((p) => p && <td key={p.id}>{p.color || "—"}</td>)}</tr>
              <tr><td>Treatment</td>{details.map((p) => p && <td key={p.id}>{p.treatment || "—"}</td>)}</tr>
              <tr><td>Certification</td>{details.map((p) => p && <td key={p.id}>{p.certification || "—"}</td>)}</tr>
              <tr><td>Recommended zodiac</td>{details.map((p) => p && <td key={p.id}>{p.recommendedZodiac || "—"}</td>)}</tr>
              <tr><td>Recommended planets</td>{details.map((p) => p && <td key={p.id}>{p.recommendedPlanets || "—"}</td>)}</tr>
              <tr><td>Rating</td>{details.map((p) => p && <td key={p.id}>{p.ratingCount ? `${p.ratingAverage} (${p.ratingCount})` : "No reviews yet"}</td>)}</tr>
            </tbody>
          </table>
        ) : (
          <div className="empty-state"><X size={26} /><h3>Nothing to compare</h3><p>Select up to 3 gemstones from the shop page.</p></div>
        )}
      </section>
    </main>
  );
}
