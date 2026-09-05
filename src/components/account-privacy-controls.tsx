"use client";

import { useState } from "react";
import { AlertTriangle, Download, Trash2 } from "lucide-react";

/**
 * Self-service privacy rights on the member Security page: download a full data export, and
 * irreversibly delete the account. Deletion asks for a typed confirmation phrase (and a 2FA
 * code when enabled) and surfaces server-side blockers (wallet balance, live chat) inline.
 */
export function AccountPrivacyControls({ twoFactorEnabled }: { twoFactorEnabled: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [phrase, setPhrase] = useState("DELETE");
  const [blockers, setBlockers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function beginDelete() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/member/delete-account");
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "Could not check your account just now.");
      return;
    }
    setPhrase(data.confirmationPhrase || "DELETE");
    setBlockers(data.blockers || []);
    setConfirming(true);
  }

  async function confirmDelete() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/member/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation, code }),
    });
    const data = await response.json();
    if (response.ok) {
      // Account and session are gone — land on the homepage as a signed-out visitor.
      window.location.assign("/?notice=account-deleted");
      return;
    }
    setError(data.error || "Your account could not be deleted.");
    setBusy(false);
  }

  return (
    <>
      <section className="settings-card two-factor-card">
        <header><div><p>Your data</p><h2>Download your data</h2></div><Download size={18} /></header>
        <p className="two-factor-hint">
          Get a copy of everything stored on your account — profile, birth details, bookings, invoices, readings, wallet ledger, orders, and more — as a single JSON file.
        </p>
        {/* A plain link (not fetch) so the browser handles the file download natively. */}
        <a className="button button--ghost button--small" href="/api/member/data-export" download>
          <Download size={15} /> Download my data
        </a>
      </section>

      <section className="settings-card two-factor-card danger-zone-card">
        <header><div><p>Danger zone</p><h2>Delete account</h2></div><AlertTriangle size={18} /></header>
        <p className="two-factor-hint">
          Permanently deletes your profile, birth details, charts, readings, journal, and family charts. Records we must keep for tax or accounting (paid invoices and orders) are kept without your name on them. This cannot be undone.
        </p>
        {!confirming && (
          <button className="button button--ghost button--small danger-zone-trigger" disabled={busy} onClick={beginDelete}>
            <Trash2 size={15} /> {busy ? "Checking…" : "Delete my account"}
          </button>
        )}
        {confirming && (
          <div className="two-factor-disable">
            {blockers.length > 0 && (
              <div className="danger-zone-blockers" role="alert">
                {blockers.map((item) => <p key={item}><AlertTriangle size={13} /> {item}</p>)}
              </div>
            )}
            <label className="field">
              <span>Type {phrase} to confirm</span>
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={phrase} autoComplete="off" />
            </label>
            {twoFactorEnabled && (
              <label className="field">
                <span>Your 6-digit code or a backup code</span>
                <input value={code} onChange={(event) => setCode(event.target.value.trim())} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" />
              </label>
            )}
            {error && <p className="admin-auth-error" role="alert">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="button button--ghost" onClick={() => { setConfirming(false); setError(""); setConfirmation(""); setCode(""); }}>Cancel</button>
              <button
                className="button danger-zone-confirm"
                disabled={busy || blockers.length > 0 || confirmation.trim() !== phrase || (twoFactorEnabled && !code)}
                onClick={confirmDelete}
              >
                {busy ? "Deleting…" : "Permanently delete my account"}
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
