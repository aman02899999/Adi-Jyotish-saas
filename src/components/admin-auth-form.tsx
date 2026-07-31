"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "@/lib/firebase-client";

export function AdminAuthForm({ setup }: { setup: boolean }) {
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
    if (setup && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const idToken = setup
        ? await createUserWithEmailAndPassword(email, password)
        : await signInWithEmailAndPassword(email, password);
      const response = await fetch(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Access could not be verified.");
      window.location.assign("/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="admin-auth-form" onSubmit={submit}>
      {setup && <label><span>Your name</span><div><UserRound size={16} /><input autoComplete="name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Workspace owner" /></div></label>}
      <label><span>Email address</span><div><Mail size={16} /><input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@yourstudio.com" /></div></label>
      <label><span>Password</span><div><LockKeyhole size={16} /><input autoComplete={setup ? "new-password" : "current-password"} type={visible ? "text" : "password"} required minLength={setup ? 10 : undefined} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={setup ? "At least 10 characters" : "Your password"} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
      {setup && <label><span>Confirm password</span><div><ShieldCheck size={16} /><input autoComplete="new-password" type={visible ? "text" : "password"} required minLength={10} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Repeat your password" /></div><small>Use a unique phrase with 10 or more characters.</small></label>}
      {error && <p className="admin-auth-error" role="alert">{error}</p>}
      <button className="button admin-auth-submit" disabled={submitting}>{submitting ? "Verifying…" : setup ? "Create secure workspace" : "Enter workspace"}<ArrowRight size={16} /></button>
    </form>
  );
}
