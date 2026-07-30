"use client";

import Script from "next/script";
import { useId, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void }) => void;
    };
  }
}

export function isTurnstileEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/** Renders nothing when Turnstile isn't configured — forms treat a missing token the same as a skipped check server-side. */
export function TurnstileWidget({ onVerify }: { onVerify: (token: string) => void }) {
  const containerId = useId().replace(/[:]/g, "");
  const [ready, setReady] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;

  function render() {
    if (!window.turnstile) return;
    window.turnstile.render(`#${containerId}`, { sitekey: siteKey!, callback: onVerify });
  }

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer onLoad={() => { setReady(true); render(); }} />
      <div id={containerId} className="turnstile-widget" data-ready={ready} />
    </>
  );
}
