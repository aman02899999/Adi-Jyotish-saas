"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

export function PractitionerOnlineToggle({ initialOnline }: { initialOnline: boolean }) {
  const [online, setOnline] = useState(initialOnline);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setSaving(true);
    setError("");
    const next = !online;
    try {
      const response = await fetch("/api/practitioner/online", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Status could not be updated.");
      setOnline(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <button
        type="button"
        className={`status-toggle online-toggle ${online ? "is-active" : ""}`}
        onClick={toggle}
        disabled={saving}
        aria-label={online ? "Go offline for instant chat" : "Go online for instant chat"}
        title={online ? "You're online — members can start an instant chat with you" : "You're offline — go online to accept instant chats"}
      >
        <i><MessageCircle size={10} /></i>
        {online ? "Online for chat" : "Offline"}
      </button>
      {error && <small className="admin-auth-error" role="alert" style={{ fontSize: 11 }}>{error}</small>}
    </span>
  );
}
