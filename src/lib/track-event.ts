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
  // Meta counts a conversion only under its own standard names, which differ from Google's
  // ("CompleteRegistration", not "sign_up"). Anything without one goes through "trackCustom";
  // sending a non-standard name through "track" is reported as an error and not counted.
  const metaName = META_STANDARD_EVENT[name];
  if (metaName) window.fbq?.("track", metaName, params);
  else window.fbq?.("trackCustom", name, params);
}

/** Google Analytics event names this app sends, mapped to Meta's standard event for the same thing. */
export const META_STANDARD_EVENT: Record<string, string> = {
  sign_up: "CompleteRegistration",
  purchase: "Purchase",
  add_payment_info: "AddPaymentInfo",
  generate_lead: "Lead",
};
