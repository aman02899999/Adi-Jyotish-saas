"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const DISMISS_KEY = "promoBannerDismissedAt";

type Banner = { enabled: boolean; message: string; ctaLabel: string | null; ctaHref: string | null; updatedAt: string };

/** A site-wide announcement bar, admin-configurable from Settings. Fetches its own config client-side
 * so it never touches server rendering / static generation for the pages it appears on. Dismissal
 * is keyed to `updatedAt`, so editing the banner brings it back even for visitors who dismissed an
 * earlier version. */
export function PromoBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    fetch("/api/promo-banner")
      .then((response) => response.json())
      .then((data: Banner) => {
        setBanner(data);
        setDismissed(localStorage.getItem(DISMISS_KEY) === data.updatedAt);
      })
      .catch(() => {});
  }, []);

  if (!banner || !banner.enabled || !banner.message || dismissed) return null;

  function dismiss() {
    if (banner) localStorage.setItem(DISMISS_KEY, banner.updatedAt);
    setDismissed(true);
  }

  return (
    <div className="promo-banner">
      <p>{banner.message}</p>
      {banner.ctaLabel && banner.ctaHref && <a href={banner.ctaHref}>{banner.ctaLabel}</a>}
      <button type="button" onClick={dismiss} aria-label="Dismiss"><X size={14} /></button>
    </div>
  );
}
