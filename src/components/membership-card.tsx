"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Crown, X } from "lucide-react";

export type MembershipCardData = {
  planName: string;
  status: string;
  billingInterval: "monthly" | "yearly";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  sessionDiscountPercent: number;
};

export function MembershipCard({ subscription }: { subscription: MembershipCardData | null }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [current, setCurrent] = useState(subscription);

  async function cancel() {
    if (!window.confirm("Cancel your membership at the end of the current billing period?")) return;
    setBusy(true);
    const response = await fetch("/api/member/subscription/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ immediately: false }) });
    const data = await response.json();
    if (response.ok) {
      setCurrent((value) => value ? { ...value, cancelAtPeriodEnd: true } : value);
      setNotice("Your membership will end at the close of the current billing period.");
    } else {
      setNotice(data.error || "Membership could not be cancelled.");
    }
    setBusy(false);
  }

  if (!current || !["active", "authenticated", "created", "pending", "halted"].includes(current.status)) {
    return (
      <div className="membership-card">
        <div className="membership-card__info">
          <span className="membership-card__icon"><Crown size={19} /></span>
          <div><h3>Free plan</h3><p>Pay-as-you-go consultations, no monthly commitment.</p></div>
        </div>
        <div className="membership-card__actions"><Link href="/pricing" className="button button--small">Upgrade membership</Link></div>
      </div>
    );
  }

  return (
    <>
      <div className="membership-card">
        <div className="membership-card__info">
          <span className="membership-card__icon"><Crown size={19} /></span>
          <div>
            <h3>{current.planName} membership</h3>
            <p>
              {current.sessionDiscountPercent > 0 ? `${current.sessionDiscountPercent}% off consultations · ` : ""}
              Billed {current.billingInterval}
              {current.currentPeriodEnd ? ` · ${current.cancelAtPeriodEnd ? "ends" : "renews"} ${new Date(current.currentPeriodEnd).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}` : ""}
            </p>
          </div>
        </div>
        <div className="membership-card__actions">
          <span className={`membership-status membership-status--${current.status}`}>{current.status.replace("_", " ")}</span>
          {!current.cancelAtPeriodEnd && <button className="button button--ghost button--small" disabled={busy} onClick={cancel}>Cancel</button>}
        </div>
      </div>
      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
    </>
  );
}
