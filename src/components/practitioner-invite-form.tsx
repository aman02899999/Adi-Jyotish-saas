"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";

export function PractitionerInviteForm({ token, name, email }: { token: string; name: string; email: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/practitioner-invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Invitation could not be accepted.");
      window.location.assign("/practitioner");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <form className="admin-auth-form" onSubmit={submit}>
      <div className="invite-identity"><span><ShieldCheck size={16} /></span><div><small>Practitioner portal for</small><strong>{name} · {email}</strong></div></div>
      <label><span>Create password</span><div><LockKeyhole size={16} /><input required minLength={10} maxLength={128} type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 10 characters" /><button type="button" onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
      <label><span>Confirm password</span><div><ShieldCheck size={16} /><input required minLength={10} type={visible ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Repeat password" /></div></label>
      {error && <p className="admin-auth-error" role="alert">{error}</p>}
      <button className="button admin-auth-submit" disabled={saving}>{saving ? "Setting up…" : "Enter your workspace"}<ArrowRight size={16} /></button>
    </form>
  );
}
