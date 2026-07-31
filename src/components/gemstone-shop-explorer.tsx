"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Scale, Search, SlidersHorizontal, X } from "lucide-react";
import { GemstoneProductCard } from "@/components/gemstone-product-card";
import type { ProductListItem } from "@/lib/gemstones";

type CategorySummary = { slug: string; name: string; productCount: number };
type FilterState = Record<string, string | undefined>;

const ZODIAC_SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];
const FILTER_KEYS = ["category", "minPrice", "maxPrice", "zodiac", "planet", "featured", "trending", "bestseller"] as const;

export function GemstoneShopExplorer({ initialItems, total, page, pageSize, categories, initialFilters, wishlistIds, signedIn }: {
  initialItems: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  categories: CategorySummary[];
  initialFilters: FilterState;
  wishlistIds: string[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(initialFilters);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeFilterCount = FILTER_KEYS.filter((key) => initialFilters[key]).length;

  useEffect(() => {
    // Resyncs local search/draft state when the URL-driven filters change from outside this
    // component's own apply/clear calls (e.g. browser back/forward), so the panel never drifts from the URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(initialFilters.search ?? "");
    setDraft(initialFilters);
  }, [initialFilters]);

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(initialFilters as Record<string, string>);
    if (value) params.set(key, value); else params.delete(key);
    if (key !== "page") params.delete("page");
    router.push(`/gemstones/shop?${params.toString()}`);
  }

  function setDraftValue(key: string, value: string | undefined) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    const params = new URLSearchParams();
    Object.entries({ ...initialFilters, ...draft }).forEach(([key, value]) => {
      if (key === "page") return;
      if (value) params.set(key, value);
    });
    router.push(`/gemstones/shop?${params.toString()}`);
    setFiltersOpen(false);
  }

  function clearFilters() {
    const params = new URLSearchParams();
    if (initialFilters.search) params.set("search", initialFilters.search);
    if (initialFilters.sort) params.set("sort", initialFilters.sort);
    router.push(`/gemstones/shop${params.toString() ? `?${params.toString()}` : ""}`);
    setFiltersOpen(false);
  }

  function toggleCompare(id: string) {
    setCompareIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 3 ? [...current, id] : current);
  }

  return (
    <section className="shop-layout shell">
      <div className="shop-toolbar">
        <button type="button" className={`shop-filter-toggle${filtersOpen ? " active" : ""}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
          <SlidersHorizontal size={15} /> Filters
          {activeFilterCount > 0 && <span className="shop-filter-toggle__count">{activeFilterCount}</span>}
          <ChevronDown size={14} />
        </button>

        <form className="shop-search" onSubmit={(event) => { event.preventDefault(); updateParam("search", search || null); }}>
          <Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search gemstones…" />
        </form>

        <div className="shop-toolbar__meta">
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
      </div>

      {filtersOpen && (
        <div className="shop-filters">
          <div className="shop-filter-group">
            <h4>Category</h4>
            <div className="shop-filter-group__scroll">
              <button type="button" className={!draft.category ? "active" : ""} onClick={() => setDraftValue("category", undefined)}>All categories</button>
              {categories.map((category) => (
                <button type="button" key={category.slug} className={draft.category === category.slug ? "active" : ""} onClick={() => setDraftValue("category", category.slug)}>{category.name} <small>({category.productCount})</small></button>
              ))}
            </div>
          </div>

          <div className="shop-filter-group">
            <h4>Price range</h4>
            <div className="shop-price-range">
              <input type="number" min="0" placeholder="Min" value={draft.minPrice ?? ""} onChange={(event) => setDraftValue("minPrice", event.target.value || undefined)} />
              <span>–</span>
              <input type="number" min="0" placeholder="Max" value={draft.maxPrice ?? ""} onChange={(event) => setDraftValue("maxPrice", event.target.value || undefined)} />
            </div>
          </div>

          <div className="shop-filter-group">
            <h4>Zodiac sign</h4>
            <select value={draft.zodiac ?? ""} onChange={(event) => setDraftValue("zodiac", event.target.value || undefined)}>
              <option value="">Any sign</option>
              {ZODIAC_SIGNS.map((sign) => <option key={sign} value={sign}>{sign}</option>)}
            </select>
          </div>

          <div className="shop-filter-group">
            <h4>Planet</h4>
            <select value={draft.planet ?? ""} onChange={(event) => setDraftValue("planet", event.target.value || undefined)}>
              <option value="">Any planet</option>
              {PLANETS.map((planet) => <option key={planet} value={planet}>{planet}</option>)}
            </select>
          </div>

          <div className="shop-filter-group">
            <h4>Collections</h4>
            <label><input type="checkbox" checked={draft.featured === "1"} onChange={(event) => setDraftValue("featured", event.target.checked ? "1" : undefined)} /> Featured</label>
            <label><input type="checkbox" checked={draft.trending === "1"} onChange={(event) => setDraftValue("trending", event.target.checked ? "1" : undefined)} /> Trending</label>
            <label><input type="checkbox" checked={draft.bestseller === "1"} onChange={(event) => setDraftValue("bestseller", event.target.checked ? "1" : undefined)} /> Bestseller</label>
          </div>

          <div className="shop-filters__actions">
            <button type="button" className="shop-clear-filters" onClick={clearFilters}><X size={13} /> Clear all filters</button>
            <button type="button" className="button button--small" onClick={applyFilters}>Apply filters</button>
          </div>
        </div>
      )}

      <div className="shop-results">
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
