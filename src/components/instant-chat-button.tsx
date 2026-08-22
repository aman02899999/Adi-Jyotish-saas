"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { MessageCircle } from "lucide-react";

type OnlineAlternative = { id: string; name: string; slug: string; title: string; chatRatePerMinute: number };

export function InstantChatButton({ practitionerId, online, memberSignedIn }: { practitionerId: string; online: boolean; memberSignedIn: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alternatives, setAlternatives] = useState<OnlineAlternative[]>([]);

  if (!online) return null;

  async function start() {
    if (!memberSignedIn) { window.location.assign("/account?mode=register"); return; }
    setLoading(true);
    setError("");
    setAlternatives([]);
    const response = await fetch("/api/chat/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ practitionerId }) });
    const data = await response.json();
    if (response.ok) window.location.assign(`/dashboard/chat/${data.sessionId}`);
    else {
      setError(data.error || "Chat could not be started.");
      // Only meaningful for the "practitioner just went offline" race — the button itself is
      // already hidden for practitioners already known to be offline (see the `online` check
      // above), so this only fires in that narrow window.
      if (Array.isArray(data.onlineAlternatives)) setAlternatives(data.onlineAlternatives);
      setLoading(false);
    }
  }

  return (
    <div className="instant-chat-cta">
      <button type="button" className="button button--light" onClick={start} disabled={loading}><MessageCircle size={16} />{loading ? "Connecting…" : "Chat now"}<span className="online-dot" /></button>
      {error && <p className="instant-chat-error">{error} {error.includes("wallet") && <Link href="/dashboard/wallet">Recharge wallet</Link>}</p>}
      {alternatives.length > 0 && (
        <div className="instant-chat-alternatives">
          <p>Online right now instead:</p>
          <ul>
            {alternatives.map((alt) => (
              <li key={alt.id}>
                <Link href={`/astrologers/${alt.slug}`}>{alt.name}<small>{alt.title} · ₹{alt.chatRatePerMinute}/min</small></Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
