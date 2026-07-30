"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, RotateCw } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    import("@sentry/nextjs").then(({ captureException }) => captureException(error)).catch(() => {});
  }, [error]);

  return (
    <main className="error-page">
      <div className="error-page__seal"><AlertTriangle size={26} /></div>
      <p className="error-page__code">Something went wrong</p>
      <h1>The sky glitched<br /><em>for a moment.</em></h1>
      <p>We&rsquo;ve been notified. Please try again, or head back home if the trouble continues.</p>
      <div className="error-page__actions">
        <button type="button" className="button" onClick={reset}>Try again <RotateCw size={15} /></button>
        <Link href="/" className="button button--ghost">Return home <ArrowRight size={16} /></Link>
      </div>
      {error.digest && <code className="error-page__detail">Reference: {error.digest}</code>}
      <BrandMark compact />
    </main>
  );
}
