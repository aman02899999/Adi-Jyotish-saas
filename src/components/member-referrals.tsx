"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Gift, Users, Wallet } from "lucide-react";
import { ShareButtons } from "@/components/share-buttons";

type ReferralStats = {
  code: string;
  invited: number;
  rewarded: number;
  totalEarned: number;
  referrerReward: number;
  refereeReward: number;
};

export function MemberReferrals() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    Promise.resolve().then(() => setOrigin(window.location.origin));
    fetch("/api/member/referral")
      .then((response) => response.json())
      .then((data) => (data.error ? setError(data.error) : setStats(data)))
      .catch(() => setError("Could not load your referral details."));
  }, []);

  if (error) return <div className="finance-config-note"><span>{error}</span></div>;
  if (!stats) return <div className="empty-state">Loading your referral link…</div>;

  const link = `${origin}/account?mode=register&ref=${stats.code}`;

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="referral-page">
      <section className="glass-card referral-hero">
        <Gift size={22} />
        <h2>Invite friends, earn wallet credit</h2>
        <p>Share your personal link. When a friend joins and makes their first recharge, you get ₹{stats.referrerReward} and they get ₹{stats.refereeReward} — both straight into your wallets.</p>
        <div className="referral-link-row">
          <code>{link}</code>
          <button type="button" onClick={copyLink}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}</button>
        </div>
        <ShareButtons url={link} title="Join me on Adi Jyotish Gurus" text={`I'm using Adi Jyotish Gurus for real Vedic astrology guidance — join with my link and we both get wallet credit.`} />
      </section>
      <div className="cosmic-grid">
        <section className="glass-card referral-stat">
          <Users size={18} /><strong>{stats.invited}</strong><span>Friends invited</span>
        </section>
        <section className="glass-card referral-stat">
          <Gift size={18} /><strong>{stats.rewarded}</strong><span>Rewarded so far</span>
        </section>
        <section className="glass-card referral-stat">
          <Wallet size={18} /><strong>₹{stats.totalEarned}</strong><span>Total earned</span>
        </section>
      </div>
    </div>
  );
}
