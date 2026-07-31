"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

export function MemberAuthForm({ initialMode = "login" }: { initialMode?: "login" | "register" }) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirm) return setError("Passwords do not match.");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/member/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your account could not be verified.");
      window.location.assign(mode === "register" || !data.onboardingComplete ? "/onboarding" : "/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function changeMode(next: "login" | "register") {
    setMode(next); setError(""); setPassword(""); setConfirm("");
  }

  return (
    <>
      <div className="member-auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Sign in</button><button className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Create account</button></div>
      <form className="admin-auth-form member-auth-form" onSubmit={submit}>
        {mode === "register" && <label><span>Your name</span><div><UserRound size={16} /><input autoComplete="name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" /></div></label>}
        <label><span>Email address</span><div><Mail size={16} /><input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div></label>
        <label><span>Password</span><div><LockKeyhole size={16} /><input autoComplete={mode === "register" ? "new-password" : "current-password"} type={visible ? "text" : "password"} required minLength={mode === "register" ? 10 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        {mode === "register" && <label><span>Confirm password</span><div><ShieldCheck size={16} /><input autoComplete="new-password" type={visible ? "text" : "password"} required minLength={10} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Repeat your password" /></div></label>}
        {error && <p className="admin-auth-error" role="alert">{error}</p>}
        <button className="button admin-auth-submit" disabled={submitting}>{submitting ? "Opening your sky…" : mode === "register" ? "Create my chart" : "Open my dashboard"}<ArrowRight size={16} /></button>
      </form>
      <GoogleSignInButton
        endpoint="/api/member/google-login"
        onError={setError}
        onSuccess={(data) => window.location.assign(!data.onboardingComplete ? "/onboarding" : "/dashboard")}
      />
    </>
  );
}
