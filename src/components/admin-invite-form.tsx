"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { signInWithEmailAndPassword } from "@/lib/firebase-client";

export function AdminInviteForm({ token, email, role }: { token: string; email: string; role: string }) {
  const [name, setName] = useState("");
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
      const response = await fetch("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Invitation could not be accepted.");

      const idToken = await signInWithEmailAndPassword(email, password);
      const sessionResponse = await fetch("/api/auth/invite/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!sessionResponse.ok) throw new Error("Your account was created — please sign in.");
      window.location.assign("/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitation could not be accepted.");
      setSaving(false);
    }
  }

  return (
    <form className="admin-auth-form" onSubmit={submit}>
      <div className="invite-identity"><span><ShieldCheck size={16} /></span><div><small>Invited as {role}</small><strong>{email}</strong></div></div>
      <label><span>Your name</span><div><UserRound size={16} /><input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div></label>
      <label><span>Create password</span><div><LockKeyhole size={16} /><input required minLength={10} maxLength={128} type={visible ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" /><button type="button" onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
      <label><span>Confirm password</span><div><ShieldCheck size={16} /><input required minLength={10} type={visible ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" /></div></label>
      {error && <p className="admin-auth-error">{error}</p>}
      <button className="button admin-auth-submit" disabled={saving}>{saving ? "Joining workspace…" : "Join the studio"}<ArrowRight size={16} /></button>
    </form>
  );
}
