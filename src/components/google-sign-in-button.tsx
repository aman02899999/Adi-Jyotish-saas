"use client";

import { useEffect, useRef, useState } from "react";
import { completeGoogleRedirectSignIn, isGoogleSignInAvailable, signInWithGoogle } from "@/lib/firebase-client";

export function GoogleSignInButton({ endpoint, extraBody, onSuccess, onError }: {
  endpoint: string;
  extraBody?: Record<string, unknown>;
  onSuccess: (data: Record<string, unknown>) => void;
  onError: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const finishing = useRef(false);

  async function finish(idToken: string) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken, ...extraBody }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Google sign-in failed.");
    onSuccess(data);
  }

  // Picks the login back up after the signInWithGoogle() popup-blocked fallback redirects the
  // whole page to Google and back — a normal page load has nothing pending here and this resolves
  // to null immediately.
  useEffect(() => {
    if (!isGoogleSignInAvailable() || finishing.current) return;
    finishing.current = true;
    completeGoogleRedirectSignIn()
      .then((idToken) => {
        if (idToken) return finish(idToken);
      })
      .catch((caught) => onError(caught instanceof Error ? caught.message : "Google sign-in could not be completed."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isGoogleSignInAvailable()) return null;

  async function handleClick() {
    setSubmitting(true);
    onError("");
    try {
      const idToken = await signInWithGoogle();
      if (!idToken) return; // redirect fallback in progress — the page is navigating away
      await finish(idToken);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong.";
      if (!message.includes("popup-closed")) onError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="member-auth-divider">or</div>
      <button type="button" className="member-auth-google" onClick={handleClick} disabled={submitting}>
        <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z" /><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" /><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z" /><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z" /></svg>
        {submitting ? "Connecting…" : "Continue with Google"}
      </button>
    </>
  );
}
