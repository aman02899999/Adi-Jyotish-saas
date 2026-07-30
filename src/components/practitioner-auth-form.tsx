"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail } from "lucide-react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export function PractitionerAuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [totpCode, setTotpCode] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/practitioner-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Access could not be verified.");
      if (data.requiresTotp) {
        setChallengeToken(data.challengeToken);
      } else {
        window.location.assign("/practitioner");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/practitioner-login/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, code: totpCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That code is incorrect.");
      window.location.assign("/practitioner");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (challengeToken) {
    return (
      <form className="admin-auth-form" onSubmit={submitTotp}>
        <label>
          <span>Two-factor code</span>
          <div><KeyRound size={16} /><input autoFocus inputMode="numeric" autoComplete="one-time-code" required value={totpCode} onChange={(event) => setTotpCode(event.target.value.trim())} placeholder="6-digit code or backup code" /></div>
          <small>Open your authenticator app, or use one of your backup codes.</small>
        </label>
        {error && <p className="admin-auth-error" role="alert">{error}</p>}
        <button className="button admin-auth-submit" disabled={submitting}>{submitting ? "Verifying…" : "Verify and continue"}<ArrowRight size={16} /></button>
      </form>
    );
  }

  return (
    <>
      <form className="admin-auth-form" onSubmit={submit}>
        <label><span>Email address</span><div><Mail size={16} /><input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@studio.com" /></div></label>
        <label><span>Password</span><div><LockKeyhole size={16} /><input autoComplete="current-password" type={visible ? "text" : "password"} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        <Link href="/practitioner/forgot-password" className="member-auth-forgot">Forgot your password?</Link>
        {error && <p className="admin-auth-error" role="alert">{error}</p>}
        <button className="button admin-auth-submit" disabled={submitting}>{submitting ? "Verifying…" : "Enter your workspace"}<ArrowRight size={16} /></button>
      </form>
      <GoogleSignInButton endpoint="/api/auth/practitioner-google-login" onError={setError} onSuccess={() => window.location.assign("/practitioner")} />
    </>
  );
}
