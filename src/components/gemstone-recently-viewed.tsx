"use client";

import { useEffect, useState } from "react";
import { GemstoneProductCard } from "@/components/gemstone-product-card";
import type { ProductListItem } from "@/lib/gemstones";

const RECENTLY_VIEWED_KEY = "jyotish_gem_recently_viewed";

export function GemstoneRecentlyViewed({ excludeSlug, wishlistIds, signedIn }: { excludeSlug?: string; wishlistIds: string[]; signedIn: boolean }) {
  const [items, setItems] = useState<ProductListItem[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
      const slugs: string[] = raw ? JSON.parse(raw) : [];
      const filtered = slugs.filter((slug) => slug !== excludeSlug).slice(0, 4);
      if (!filtered.length) return;
      fetch(`/api/gemstones/products/by-slugs?slugs=${filtered.join(",")}`)
        .then((response) => response.json())
        .then((data) => setItems(data.products ?? []))
        .catch(() => {});
    } catch {
      // ignore storage errors
    }
  }, [excludeSlug]);

  if (!items.length) return null;

  return (
    <section className="gem-rail shell">
      <div className="gem-rail__head reveal"><div><p className="eyebrow"><span /> Your history</p><h2>Recently viewed</h2></div></div>
      <div className="product-grid">{items.map((product) => <GemstoneProductCard key={product.id} product={product} wishlisted={wishlistIds.includes(product.id)} signedIn={signedIn} />)}</div>
    </section>
  );
}
