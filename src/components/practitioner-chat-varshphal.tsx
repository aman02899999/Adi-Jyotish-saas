"use client";

import { useState } from "react";
import { CalendarClock, LoaderCircle } from "lucide-react";

export function PractitionerChatVarshphal({ sessionId }: { sessionId: string }) {
  const currentYear = new Date().getFullYear();
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/practitioner/chat/${sessionId}/varshphal`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The Varshphal summary could not be generated.");
      setSummary(data.varshphalSummary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Varshphal summary could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="chat-kundli-panel">
      <header><CalendarClock size={16} /><h3>Client Varshphal ({currentYear})</h3></header>
      {summary ? (
        <>
          <div className="kundli-report">
            {summary.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          <a href={`/api/practitioner/chat/${sessionId}/varshphal/pdf`} className="button button--small button--ghost">Download PDF</a>
        </>
      ) : (
        <>
          <p className="chat-kundli-panel__hint">Pull up this client&apos;s annual solar-return chart while you answer their question.</p>
          <button type="button" className="button button--small" disabled={loading} onClick={generate}>
            {loading ? <><LoaderCircle size={14} className="spin" /> Generating…</> : <><CalendarClock size={14} /> Generate Varshphal summary</>}
          </button>
        </>
      )}
      {error && <p className="chat-kundli-panel__error">{error}</p>}
    </section>
  );
}
