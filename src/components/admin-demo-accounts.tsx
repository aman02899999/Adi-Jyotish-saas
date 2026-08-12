"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";

type DemoAccount = { email: string; url: string };
type DemoAccountsResult = {
  password: string;
  admins: DemoAccount[];
  practitioners: DemoAccount[];
  members: DemoAccount[];
};

function AccountGroup({ title, hint, accounts, onCopy, copied }: { title: string; hint: string; accounts: DemoAccount[]; onCopy: (value: string, label: string) => void; copied: string }) {
  return (
    <div className="review-moderation-list" style={{ padding: "0 22px 22px" }}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{title}</p>
      {accounts.map((account, index) => (
        <article className="review-moderation-row" key={account.email}>
          <div className="review-moderation-main">
            <div><strong>{title.replace(/s$/, "")} {index + 1}</strong></div>
            <p>{account.email}</p>
            <small>Sign in at {account.url} · {hint}</small>
          </div>
          <div className="row-actions">
            <button onClick={() => onCopy(account.email, account.email)} aria-label={`Copy ${account.email}`}>{copied === account.email ? <Check size={16} /> : <Copy size={16} />}</button>
          </div>
        </article>
      ))}
    </div>
  );
}

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
          <p>Create 9 ready-to-use, full-access logins for walkthroughs — 3 admins (Owner role, every permission), 3 practitioners (verified, featured, online), 3 members (active Pro plan + funded wallet). Same password for all. Safe to run again; it resets rather than duplicates.</p>
        </div>
        <button className="button" disabled={loading} onClick={create}><Sparkles size={16} /> {loading ? "Creating…" : result ? "Recreate all 9" : "Create demo accounts"}</button>
      </div>
      {error && <div className="finance-config-note"><span>{error}</span></div>}
      {result && (
        <>
          <AccountGroup title="Admins" hint="Owner role, every permission" accounts={result.admins} onCopy={copy} copied={copied} />
          <AccountGroup title="Practitioners" hint="verified · featured · online 24/7" accounts={result.practitioners} onCopy={copy} copied={copied} />
          <AccountGroup title="Members" hint="active Pro plan · ₹5,000 wallet" accounts={result.members} onCopy={copy} copied={copied} />
          <div className="review-moderation-list" style={{ padding: "0 22px 22px" }}>
            <article className="review-moderation-row">
              <div className="review-moderation-main">
                <div><strong>Shared password</strong></div>
                <p>{result.password}</p>
                <small>Same password for all 9 accounts. Change it before sharing this demo outside your team.</small>
              </div>
              <div className="row-actions">
                <button onClick={() => copy(result.password, "password")} aria-label="Copy password">{copied === "password" ? <Check size={16} /> : <Copy size={16} />}</button>
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
