"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";

export function ResetPasswordForm({ endpoint, token, signInHref }: { endpoint: string; token: string; signInHref: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) return setError("This reset link is invalid. Please request a new one.");
    if (password !== confirm) return setError("Passwords do not match.");
    setSubmitting(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "This reset link is invalid or has expired.");
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <p className="member-auth-sent">Your password has been updated. <a href={signInHref}>Sign in</a> with your new password.</p>;
  }

  return (
    <form className="admin-auth-form member-auth-form" onSubmit={submit}>
      <label><span>New password</span><div><LockKeyhole size={16} /><input autoComplete="new-password" type={visible ? "text" : "password"} required minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 10 characters" /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
      <label><span>Confirm new password</span><div><ShieldCheck size={16} /><input autoComplete="new-password" type={visible ? "text" : "password"} required minLength={10} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Repeat your new password" /></div></label>
      {error && <p className="admin-auth-error" role="alert">{error}</p>}
      <button className="button admin-auth-submit" disabled={submitting || !token}>{submitting ? "Saving…" : "Set new password"}<ArrowRight size={16} /></button>
    </form>
  );
}
