"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { sendPasswordReset } from "@/lib/firebase-client";

/** `portal` only steers the link a person lands on after resetting (member/practitioner/admin
 * sign-in) — Firebase Auth is one shared user pool underneath all three, so the reset email
 * itself works the same way regardless of which portal the person normally signs into. */
export function ForgotPasswordForm({ portal }: { portal: "member" | "practitioner" | "admin" }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const continueUrl = `${window.location.origin}/reset-password?portal=${portal}`;
      await sendPasswordReset(email, continueUrl);
      setSent(true);
    } catch {
      // Firebase resolves successfully for both existing and non-existing accounts by design, so
      // any thrown error here is a real problem (rate limit, malformed email) rather than "no
      // such account" — safe to surface directly without leaking account existence either way.
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return <p className="member-auth-sent">If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox (and spam folder).</p>;
  }

  return (
    <form className="admin-auth-form member-auth-form" onSubmit={submit}>
      <label><span>Email address</span><div><Mail size={16} /><input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div></label>
      {error && <p className="admin-auth-error" role="alert">{error}</p>}
      <button className="button admin-auth-submit" disabled={submitting}>{submitting ? "Sending…" : "Send reset link"}<ArrowRight size={16} /></button>
    </form>
  );
}
