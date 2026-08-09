"use client";

import { useEffect } from "react";
import { AlertTriangle, ArrowLeft, RotateCw } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

// A plain error.tsx at the app root exists too, but its only recovery link is "Return home" to
// the public marketing site ("/") — dropping an admin mid-task out of the workspace entirely.
// This segment-scoped boundary catches errors from any page under /admin instead and sends
// "go back" to the actual admin overview, not the storefront.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
      <p className="error-page__code">Workspace error</p>
      <h1>This screen hit<br /><em>a snag.</em></h1>
      <p>We&rsquo;ve been notified. Try again, or head back to the admin overview if the trouble continues.</p>
      <div className="error-page__actions">
        <button type="button" className="button" onClick={tryAgain}>Try again <RotateCw size={15} /></button>
        {/* A plain <a>, not next/link — Next's client-side router can get stuck on the errored
            segment it's leaving, so a soft navigation away from an error boundary is unreliable.
            A hard navigation always works since it discards the broken router state entirely. */}
        <a href="/admin" className="button button--ghost"><ArrowLeft size={16} /> Back to admin overview</a>
      </div>
      {error.digest && <code className="error-page__detail">Reference: {error.digest}</code>}
      <BrandMark compact />
    </main>
  );
}
