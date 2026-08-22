"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { Check, Gift, LoaderCircle, X } from "lucide-react";

export function GiftClaimButton({ code, signedIn }: { code: string; signedIn: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [claimed, setClaimed] = useState(false);

  async function claim() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/gift/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "This gift could not be claimed.");
      setClaimed(true);
      setTimeout(() => router.push("/dashboard/wallet"), 1600);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This gift could not be claimed.");
    } finally {
      setLoading(false);
    }
  }

  if (claimed) return <p className="gift-claimed-note"><Check size={15} /> Claimed! Redirecting to your wallet…</p>;

  if (!signedIn) {
    return <Link href="/account?mode=register" className="button">Sign in to claim this gift</Link>;
  }

  return (
    <>
      <button type="button" className="button" disabled={loading} onClick={claim}>
        {loading ? <><LoaderCircle size={16} className="spin" /> Claiming…</> : <><Gift size={16} /> Claim this gift</>}
      </button>
      {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
    </>
  );
}
