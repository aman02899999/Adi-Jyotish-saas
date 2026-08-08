"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { TwoFactorChallenge } from "@/components/two-factor-challenge";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "@/lib/firebase-client";
import { trackEvent } from "@/lib/track-event";

export function MemberAuthForm({ initialMode = "login" }: { initialMode?: "login" | "register" }) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");

  function afterSignIn(data: Record<string, unknown>) {
    if (mode === "register") trackEvent("sign_up", { method: "password" });
    window.location.assign(mode === "register" || !data.onboardingComplete ? "/onboarding" : "/dashboard");
  }
  // Read once at mount, client-side only — a signup started from someone's invite link (?ref=CODE)
  // needs to survive through to the register/google-login call, but never affects what's rendered.
  const [refCode] = useState(() => (typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("ref") ?? undefined));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirm) return setError("Passwords do not match.");
    setSubmitting(true);
    try {
      const idToken = mode === "register"
        ? await createUserWithEmailAndPassword(email, password)
        : await signInWithEmailAndPassword(email, password);
      const response = await fetch(`/api/member/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, idToken, ref: mode === "register" ? refCode : undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your account could not be verified.");
      if (data.requiresTotp) return setChallengeToken(data.challengeToken);
      afterSignIn(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  function changeMode(next: "login" | "register") {
    setMode(next); setError(""); setPassword(""); setConfirm("");
  }

  if (challengeToken) {
    return <TwoFactorChallenge endpoint="/api/member/login/verify-2fa" challengeToken={challengeToken} onSuccess={afterSignIn} />;
  }

  return (
    <>
      <div className="member-auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Sign in</button><button className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Create account</button></div>
      <form className="admin-auth-form member-auth-form" onSubmit={submit}>
        {mode === "register" && <label><span>Your name</span><div><UserRound size={16} /><input autoComplete="name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" /></div></label>}
        <label><span>Email address</span><div><Mail size={16} /><input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div></label>
        <label><span>Password</span><div><LockKeyhole size={16} /><input autoComplete={mode === "register" ? "new-password" : "current-password"} type={visible ? "text" : "password"} required minLength={mode === "register" ? 10 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        {mode === "register" && <label><span>Confirm password</span><div><ShieldCheck size={16} /><input autoComplete="new-password" type={visible ? "text" : "password"} required minLength={10} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Repeat your password" /></div></label>}
        {mode === "login" && <a className="member-auth-forgot" href="/forgot-password?portal=member">Forgot your password?</a>}
        {error && <p className="admin-auth-error" role="alert">{error}</p>}
        <button className="button admin-auth-submit" disabled={submitting}>{submitting ? "Opening your sky…" : mode === "register" ? "Create my chart" : "Open my dashboard"}<ArrowRight size={16} /></button>
      </form>
      <GoogleSignInButton
        endpoint="/api/member/google-login"
        extraBody={refCode ? { ref: refCode } : undefined}
        onError={setError}
        onRequiresTotp={setChallengeToken}
        onSuccess={(data) => {
          if (!data.onboardingComplete) trackEvent("sign_up", { method: "google" });
          window.location.assign(!data.onboardingComplete ? "/onboarding" : "/dashboard");
        }}
      />
    </>
  );
}
