"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { signInWithEmailAndPassword } from "@/lib/firebase-client";

export function PractitionerAuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const idToken = await signInWithEmailAndPassword(email, password);
      const response = await fetch("/api/auth/practitioner-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Access could not be verified.");
      window.location.assign("/practitioner");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="admin-auth-form" onSubmit={submit}>
        <label><span>Email address</span><div><Mail size={16} /><input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@studio.com" /></div></label>
        <label><span>Password</span><div><LockKeyhole size={16} /><input autoComplete="current-password" type={visible ? "text" : "password"} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        {error && <p className="admin-auth-error" role="alert">{error}</p>}
        <button className="button admin-auth-submit" disabled={submitting}>{submitting ? "Verifying…" : "Enter your workspace"}<ArrowRight size={16} /></button>
      </form>
      <GoogleSignInButton endpoint="/api/auth/practitioner-google-login" onError={setError} onSuccess={() => window.location.assign("/practitioner")} />
    </>
  );
}
