"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Scale, Search, SlidersHorizontal, X } from "lucide-react";
import { GemstoneProductCard } from "@/components/gemstone-product-card";
import type { ProductListItem } from "@/lib/gemstones";

type CategorySummary = { slug: string; name: string; productCount: number };

const ZODIAC_SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];

export function GemstoneShopExplorer({ initialItems, total, page, pageSize, categories, initialFilters, wishlistIds, signedIn }: {
  initialItems: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  categories: CategorySummary[];
  initialFilters: Record<string, string | undefined>;
  wishlistIds: number[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(initialFilters as Record<string, string>);
    if (value) params.set(key, value); else params.delete(key);
    if (key !== "page") params.delete("page");
    router.push(`/gemstones/shop?${params.toString()}`);
  }

  function toggleCompare(id: number) {
    setCompareIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  }

  return (
    <section className="shop-layout shell">
      <aside className="shop-filters">
        <div className="shop-filters__head"><SlidersHorizontal size={15} /> Filters</div>

        <form className="shop-search" onSubmit={(event) => { event.preventDefault(); updateParam("search", search || null); }}>
          <Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search gemstones…" />
        </form>

        <div className="shop-filter-group">
          <h4>Category</h4>
          <button className={!initialFilters.category ? "active" : ""} onClick={() => updateParam("category", null)}>All categories</button>
          {categories.map((category) => (
            <button key={category.slug} className={initialFilters.category === category.slug ? "active" : ""} onClick={() => updateParam("category", category.slug)}>{category.name} <small>({category.productCount})</small></button>
          ))}
        </div>

        <div className="shop-filter-group">
          <h4>Price range</h4>
          <div className="shop-price-range">
            <input type="number" min="0" placeholder="Min" defaultValue={initialFilters.minPrice ?? ""} onBlur={(event) => updateParam("minPrice", event.target.value || null)} />
            <span>–</span>
            <input type="number" min="0" placeholder="Max" defaultValue={initialFilters.maxPrice ?? ""} onBlur={(event) => updateParam("maxPrice", event.target.value || null)} />
          </div>
        </div>

        <div className="shop-filter-group">
          <h4>Zodiac sign</h4>
          <select value={initialFilters.zodiac ?? ""} onChange={(event) => updateParam("zodiac", event.target.value || null)}>
            <option value="">Any sign</option>
            {ZODIAC_SIGNS.map((sign) => <option key={sign} value={sign}>{sign}</option>)}
          </select>
        </div>

        <div className="shop-filter-group">
          <h4>Planet</h4>
          <select value={initialFilters.planet ?? ""} onChange={(event) => updateParam("planet", event.target.value || null)}>
            <option value="">Any planet</option>
            {PLANETS.map((planet) => <option key={planet} value={planet}>{planet}</option>)}
          </select>
        </div>

        <div className="shop-filter-group">
          <h4>Collections</h4>
          <label><input type="checkbox" checked={initialFilters.featured === "1"} onChange={(event) => updateParam("featured", event.target.checked ? "1" : null)} /> Featured</label>
          <label><input type="checkbox" checked={initialFilters.trending === "1"} onChange={(event) => updateParam("trending", event.target.checked ? "1" : null)} /> Trending</label>
          <label><input type="checkbox" checked={initialFilters.bestseller === "1"} onChange={(event) => updateParam("bestseller", event.target.checked ? "1" : null)} /> Bestseller</label>
        </div>

        {(initialFilters.category || initialFilters.search || initialFilters.minPrice || initialFilters.maxPrice || initialFilters.zodiac || initialFilters.planet || initialFilters.featured || initialFilters.trending || initialFilters.bestseller) && (
          <Link href="/gemstones/shop" className="shop-clear-filters"><X size={13} /> Clear all filters</Link>
        )}
      </aside>

      <div className="shop-results">
        <div className="shop-results__head">
          <span>{total} gemstone{total === 1 ? "" : "s"}</span>
          <div className="filter-select">
            <select value={initialFilters.sort ?? "newest"} onChange={(event) => updateParam("sort", event.target.value)}>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
              <option value="discount">Biggest Discount</option>
              <option value="alpha">Alphabetical</option>
            </select>
          </div>
        </div>

        <div className="product-grid">
          {initialItems.map((product) => (
            <div className="product-card-wrap" key={product.id}>
              <label className="product-card__compare"><input type="checkbox" checked={compareIds.includes(product.id)} onChange={() => toggleCompare(product.id)} /> Compare</label>
              <GemstoneProductCard product={product} wishlisted={wishlistIds.includes(product.id)} signedIn={signedIn} />
            </div>
          ))}
        </div>
        {!initialItems.length && <div className="empty-state"><Search size={26} /><h3>No gemstones match those filters</h3><p>Try a different category or price range.</p></div>}

        {totalPages > 1 && (
          <div className="shop-pagination">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <button key={pageNumber} className={pageNumber === page ? "active" : ""} onClick={() => updateParam("page", String(pageNumber))}>{pageNumber}</button>
            ))}
          </div>
        )}
      </div>

      {compareIds.length > 0 && (
        <div className="compare-bar">
          <span><Scale size={16} /> {compareIds.length} selected for comparison</span>
          <div>
            <button className="button button--ghost button--small" onClick={() => setCompareIds([])}>Clear</button>
            <Link href={`/gemstones/compare?ids=${compareIds.join(",")}`} className="button button--small">Compare now</Link>
          </div>
        </div>
      )}
    </section>
  );
}
