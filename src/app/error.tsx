"use client";

import { useEffect } from "react";
import { AlertTriangle, ArrowRight, RotateCw } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    import("@sentry/nextjs").then(({ captureException }) => captureException(error)).catch(() => {});
  }, [error]);

  function tryAgain() {
    // reset() alone only clears the boundary's local React state — it doesn't reliably re-fetch
    // the Server Component that actually threw (verified: no network request fires at all), so a
    // real, even transient, server-side error just reappears immediately with no visible retry.
    // A hard reload guarantees a genuine fresh request every time, at the cost of losing the SPA
    // transition — the right tradeoff for a button whose entire job is "make this actually work."
    window.location.reload();
  }

  return (
    <main className="error-page">
      <div className="error-page__seal"><AlertTriangle size={26} /></div>
      <p className="error-page__code">Something went wrong</p>
      <h1>The sky glitched<br /><em>for a moment.</em></h1>
      <p>We&rsquo;ve been notified. Please try again, or head back home if the trouble continues.</p>
      <div className="error-page__actions">
        <button type="button" className="button" onClick={tryAgain}>Try again <RotateCw size={15} /></button>
        {/* A plain <a>, not next/link — Next's client-side router can get stuck on the errored
            segment it's leaving, so a soft navigation away from an error boundary is unreliable.
            A hard navigation always works since it discards the broken router state entirely. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional hard navigation, see comment above */}
        <a href="/" className="button button--ghost">Return home <ArrowRight size={16} /></a>
      </div>
      {error.digest && <code className="error-page__detail">Reference: {error.digest}</code>}
      <BrandMark compact />
    </main>
  );
}
