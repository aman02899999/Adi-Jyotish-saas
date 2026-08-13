"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { MessageCircle } from "lucide-react";

export function InstantChatButton({ practitionerId, online, memberSignedIn }: { practitionerId: string; online: boolean; memberSignedIn: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!online) return null;

  async function start() {
    if (!memberSignedIn) { window.location.assign("/account?mode=register"); return; }
    setLoading(true);
    setError("");
    const response = await fetch("/api/chat/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ practitionerId }) });
    const data = await response.json();
    if (response.ok) window.location.assign(`/dashboard/chat/${data.sessionId}`);
    else { setError(data.error || "Chat could not be started."); setLoading(false); }
  }

  return (
    <div className="instant-chat-cta">
      <button type="button" className="button button--light" onClick={start} disabled={loading}><MessageCircle size={16} />{loading ? "Connecting…" : "Chat now"}<span className="online-dot" /></button>
      {error && <p className="instant-chat-error">{error} {error.includes("wallet") && <Link href="/dashboard/wallet">Recharge wallet</Link>}</p>}
    </div>
  );
}
