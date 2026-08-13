"use client";

import { useState } from "react";
import { ArrowUpRight, LoaderCircle, Share2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

export function CosmicProfileShareCard({ sunRashi, moonRashi, risingRashi }: {
  sunRashi: string; moonRashi: string; risingRashi: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/cosmic-profile-card", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create your cosmic profile card.");
      router.push(`/cosmic-profile/${data.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <article className="glass-card cosmic-share-card">
      <div className="card-heading"><div><p>Share your chart</p><h2>Cosmic Profile</h2></div><Share2 size={18} /></div>
      <p className="cosmic-share-summary">Sun in <strong>{sunRashi}</strong> · Moon in <strong>{moonRashi}</strong> · <strong>{risingRashi}</strong> rising</p>
      <button type="button" className="button button--small" disabled={loading} onClick={generate}>
        {loading ? <><LoaderCircle size={14} className="spin" /> Preparing…</> : <>Get my shareable card <ArrowUpRight size={14} /></>}
      </button>
      {error && <p className="cosmic-share-error">{error}</p>}
    </article>
  );
}
