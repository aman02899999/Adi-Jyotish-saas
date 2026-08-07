"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";

type DemoAccountsResult = {
  password: string;
  member: { email: string; url: string };
  practitioner: { email: string; url: string };
};

export function AdminDemoAccounts() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DemoAccountsResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function create() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/demo-accounts", { method: "POST" });
    const data = await response.json();
    if (response.ok) setResult(data);
    else setError(data.error || "Could not create demo accounts.");
    setLoading(false);
  }

  function copy(value: string, label: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    });
  }

  return (
    <section className="admin-table-card">
      <div className="admin-table-header">
        <div>
          <h2>Demo accounts</h2>
          <p>Create a ready-to-use member and practitioner login for walkthroughs — funded wallet, online practitioner, same password for both. Safe to run again; it resets rather than duplicates.</p>
        </div>
        <button className="button" disabled={loading} onClick={create}><Sparkles size={16} /> {loading ? "Creating…" : result ? "Recreate" : "Create demo accounts"}</button>
      </div>
      {error && <div className="finance-config-note"><span>{error}</span></div>}
      {result && (
        <div className="review-moderation-list" style={{ padding: "0 22px 22px" }}>
          <article className="review-moderation-row">
            <div className="review-moderation-main">
              <div><strong>Demo member</strong></div>
              <p>{result.member.email}</p>
              <small>Sign in at {result.member.url} · wallet pre-funded with ₹1,000</small>
            </div>
            <div className="row-actions">
              <button onClick={() => copy(result.member.email, "member-email")} aria-label="Copy member email">{copied === "member-email" ? <Check size={16} /> : <Copy size={16} />}</button>
            </div>
          </article>
          <article className="review-moderation-row">
            <div className="review-moderation-main">
              <div><strong>Demo practitioner</strong></div>
              <p>{result.practitioner.email}</p>
              <small>Sign in at {result.practitioner.url} · already online, ready for instant chat</small>
            </div>
            <div className="row-actions">
              <button onClick={() => copy(result.practitioner.email, "practitioner-email")} aria-label="Copy practitioner email">{copied === "practitioner-email" ? <Check size={16} /> : <Copy size={16} />}</button>
            </div>
          </article>
          <article className="review-moderation-row">
            <div className="review-moderation-main">
              <div><strong>Shared password</strong></div>
              <p>{result.password}</p>
              <small>Same password for both accounts. Change it before sharing this demo outside your team.</small>
            </div>
            <div className="row-actions">
              <button onClick={() => copy(result.password, "password")} aria-label="Copy password">{copied === "password" ? <Check size={16} /> : <Copy size={16} />}</button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
