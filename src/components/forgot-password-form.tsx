"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Mail } from "lucide-react";

export function ForgotPasswordForm({ endpoint }: { endpoint: string }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!response.ok) throw new Error("Something went wrong. Please try again.");
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
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
