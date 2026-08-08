"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";

/** Shown in place of the normal login form once a login/google-login call responds with
 * `{requiresTotp: true, challengeToken}` instead of minting a session. Submits the code to the
 * matching verify-2fa endpoint, which mints the session on success. */
export function TwoFactorChallenge({ endpoint, challengeToken, onSuccess }: {
  endpoint: string;
  challengeToken: string;
  onSuccess: (data: Record<string, unknown>) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That code is incorrect.");
      onSuccess(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="admin-auth-form member-auth-form" onSubmit={submit}>
      <div className="two-factor-challenge-hint"><ShieldCheck size={16} /><span>Enter the 6-digit code from your authenticator app, or a backup code.</span></div>
      <label><span>Verification code</span><div><input inputMode="numeric" autoFocus required value={code} onChange={(event) => setCode(event.target.value.trim())} placeholder="000000" /></div></label>
      {error && <p className="admin-auth-error" role="alert">{error}</p>}
      <button className="button admin-auth-submit" disabled={submitting || !code}>{submitting ? "Verifying…" : "Verify"}<ArrowRight size={16} /></button>
    </form>
  );
}
