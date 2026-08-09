"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

export function PractitionerOnlineToggle({ initialOnline }: { initialOnline: boolean }) {
  const [online, setOnline] = useState(initialOnline);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const next = !online;
    try {
      const response = await fetch("/api/practitioner/online", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: next }),
      });
      if (response.ok) setOnline(next);
    } finally {
      setSaving(false);
    }
  }

  return (
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
  );
}
