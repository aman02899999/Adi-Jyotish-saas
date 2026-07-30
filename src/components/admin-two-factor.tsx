"use client";

import { useState } from "react";
import { Check, KeyRound, ShieldCheck, ShieldOff, X } from "lucide-react";

type Stage = "idle" | "enrolling" | "backup-codes";

export function AdminTwoFactor({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [stage, setStage] = useState<Stage>("idle");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function startEnrollment() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/2fa/enroll", { method: "POST" });
    const data = await response.json();
    if (response.ok) {
      setQrDataUrl(data.qrDataUrl);
      setSecret(data.secret);
      setStage("enrolling");
    } else {
      setError(data.error || "Enrollment could not be started.");
    }
    setBusy(false);
  }

  async function confirmEnrollment() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/2fa/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await response.json();
    if (response.ok) {
      setBackupCodes(data.backupCodes);
      setStage("backup-codes");
      setEnabled(true);
    } else {
      setError(data.error || "That code is incorrect.");
    }
    setBusy(false);
  }

  async function disable() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: disablePassword }),
    });
    const data = await response.json();
    if (response.ok) {
      setEnabled(false);
      setDisabling(false);
      setDisablePassword("");
      setNotice("Two-factor authentication turned off.");
    } else {
      setError(data.error || "Two-factor authentication could not be disabled.");
    }
    setBusy(false);
  }

  if (stage === "backup-codes") {
    return (
      <section className="settings-card two-factor-card">
        <header><div><p>Save these now</p><h2>Backup codes</h2></div><ShieldCheck size={18} /></header>
        <p className="two-factor-hint">Each code works once if you lose access to your authenticator app. Store them somewhere safe — they won&apos;t be shown again.</p>
        <div className="backup-codes-grid">{backupCodes.map((item) => <code key={item}>{item}</code>)}</div>
        <button className="button" onClick={() => setStage("idle")}>Done</button>
      </section>
    );
  }

  if (stage === "enrolling") {
    return (
      <section className="settings-card two-factor-card">
        <header><div><p>Scan to continue</p><h2>Set up your authenticator</h2></div><KeyRound size={18} /></header>
        <div className="two-factor-enroll">
          {qrDataUrl && <img src={qrDataUrl} alt="Scan this QR code with your authenticator app" width={180} height={180} />}
          <div>
            <p className="two-factor-hint">Scan with Google Authenticator, 1Password, or Authy — or enter this key manually:</p>
            <code className="two-factor-secret">{secret}</code>
            <label className="field"><span>6-digit code</span><input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.trim())} placeholder="000000" /></label>
          </div>
        </div>
        {error && <p className="admin-auth-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button--ghost" onClick={() => setStage("idle")}>Cancel</button>
          <button className="button" disabled={busy || code.length < 6} onClick={confirmEnrollment}>{busy ? "Verifying…" : "Enable two-factor auth"}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-card two-factor-card">
      <header><div><p>Account security</p><h2>Two-factor authentication</h2></div>{enabled ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}</header>
      <p className="two-factor-hint">{enabled ? "Two-factor authentication is protecting your admin sign-in." : "Add a second step at sign-in using an authenticator app."}</p>
      {notice && <div className="toast"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
      {!enabled && !disabling && <button className="button button--small" disabled={busy} onClick={startEnrollment}>{busy ? "Starting…" : "Turn on two-factor auth"}</button>}
      {enabled && !disabling && <button className="button button--ghost button--small" onClick={() => setDisabling(true)}>Turn off two-factor auth</button>}
      {disabling && (
        <div className="two-factor-disable">
          <label className="field"><span>Confirm your password</span><input type="password" value={disablePassword} onChange={(event) => setDisablePassword(event.target.value)} /></label>
          {error && <p className="admin-auth-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="button button--ghost" onClick={() => { setDisabling(false); setError(""); }}>Cancel</button>
            <button className="button" disabled={busy || !disablePassword} onClick={disable}>{busy ? "Turning off…" : "Turn off two-factor auth"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
