import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/track-event";

/** Meta counts a conversion only under its own standard names; Google gets the name as given. */
function stubAnalytics() {
  const gtag = vi.fn();
  const fbq = vi.fn();
  vi.stubGlobal("window", { gtag, fbq });
  return { gtag, fbq };
}

describe("trackEvent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends sign-ups to Meta as CompleteRegistration and to Google as sign_up", () => {
    const { gtag, fbq } = stubAnalytics();
    trackEvent("sign_up", { method: "password" });
    expect(gtag).toHaveBeenCalledWith("event", "sign_up", { method: "password" });
    expect(fbq).toHaveBeenCalledWith("track", "CompleteRegistration", { method: "password" });
  });

  it("sends a purchase to Meta as Purchase with its value", () => {
    const { fbq } = stubAnalytics();
    trackEvent("purchase", { value: 499, currency: "INR" });
    expect(fbq).toHaveBeenCalledWith("track", "Purchase", { value: 499, currency: "INR" });
  });

  it("sends app-specific events to Meta as custom events", () => {
    const { fbq } = stubAnalytics();
    trackEvent("free_chart_result");
    expect(fbq).toHaveBeenCalledWith("trackCustom", "free_chart_result", undefined);
  });

  it("does nothing when no analytics script is loaded", () => {
    vi.stubGlobal("window", {});
    expect(() => trackEvent("sign_up")).not.toThrow();
  });
});
