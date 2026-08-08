"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { confirmPasswordReset, verifyPasswordResetCode } from "@/lib/firebase-client";

export function ResetPasswordForm({ oobCode, signInHref }: { oobCode: string; signInHref: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  // Verified once up front so an expired/already-used link fails fast with a clear message,
  // rather than letting someone fill out the whole form before finding out.
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(Boolean(oobCode));

  useEffect(() => {
    if (!oobCode) return;
    verifyPasswordResetCode(oobCode)
      .then(setEmail)
      .catch(() => setError("This reset link is invalid or has expired. Please request a new one."))
      .finally(() => setChecking(false));
  }, [oobCode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match.");
    setSubmitting(true);
    try {
      await confirmPasswordReset(oobCode, password);
      setDone(true);
    } catch (caught) {
      const code = caught instanceof Error && "code" in caught ? (caught as { code: string }).code : "";
      setError(code === "auth/weak-password" ? "Please choose a stronger password." : "This reset link is invalid or has expired. Please request a new one.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <p className="member-auth-sent">Your password has been updated. <a href={signInHref}>Sign in</a> with your new password.</p>;
  }

  if (checking) return <p className="member-auth-sent">Checking your reset link…</p>;

  if (!email) {
    return <p className="admin-auth-error" role="alert">{error || "This reset link is invalid or has expired. Please request a new one."}</p>;
  }

  return (
    <form className="admin-auth-form member-auth-form" onSubmit={submit}>
      <p className="two-factor-hint">Resetting the password for <strong>{email}</strong>.</p>
      <label><span>New password</span><div><LockKeyhole size={16} /><input autoComplete="new-password" type={visible ? "text" : "password"} required minLength={10} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 10 characters" /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
      <label><span>Confirm new password</span><div><ShieldCheck size={16} /><input autoComplete="new-password" type={visible ? "text" : "password"} required minLength={10} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Repeat your new password" /></div></label>
      {error && <p className="admin-auth-error" role="alert">{error}</p>}
      <button className="button admin-auth-submit" disabled={submitting}>{submitting ? "Saving…" : "Set new password"}<ArrowRight size={16} /></button>
    </form>
  );
}
