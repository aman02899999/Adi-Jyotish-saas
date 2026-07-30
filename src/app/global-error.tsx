"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    import("@sentry/nextjs").then(({ captureException }) => captureException(error)).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 24, textAlign: "center", fontFamily: "Georgia, serif", background: "#eee9df", color: "#302822" }}>
        <p style={{ margin: 0, color: "#a95838", fontSize: 13, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", fontFamily: "sans-serif" }}>Something went wrong</p>
        <h1 style={{ margin: 0, maxWidth: 520, fontWeight: 400, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.2 }}>The studio hit an unexpected problem.</h1>
        <p style={{ maxWidth: 420, margin: 0, color: "#776b61", fontSize: 15, lineHeight: 1.7, fontFamily: "sans-serif" }}>We&rsquo;ve been notified. Please try reloading the page.</p>
        <button type="button" onClick={reset} style={{ marginTop: 8, padding: "12px 24px", border: 0, borderRadius: 999, background: "#a95838", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "sans-serif", cursor: "pointer" }}>
          Try again
        </button>
        {error.digest && <code style={{ marginTop: 4, padding: "10px 14px", borderRadius: 8, background: "#e6ded1", color: "#776b61", fontSize: 11.5 }}>Reference: {error.digest}</code>}
      </body>
    </html>
  );
}
