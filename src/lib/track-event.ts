"use client";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

/** Fires a conversion event to whichever analytics scripts are actually loaded (GoogleAnalytics /
 * MetaPixel, both env-gated and both no-ops when unconfigured) — safe to call unconditionally from
 * anywhere in the app. `value`/`currency` map onto both gtag's and fbq's standard event shape. */
export function trackEvent(name: string, params?: { value?: number; currency?: string; [key: string]: unknown }) {
  if (typeof window === "undefined") return;
  window.gtag?.("event", name, params);
  window.fbq?.("track", name, params);
}
