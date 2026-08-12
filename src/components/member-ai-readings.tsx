"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Clock3, RefreshCw, Sparkles, X } from "lucide-react";

export type MemberAiReading = {
  id: string;
  readingType: string;
  clientName: string;
  personaName?: string | null;
  question: string | null;
  answer: string | null;
  status: string;
  price: number;
  currency: string;
  createdAt: string | Date;
  answeredAt: string | Date | null;
};

export function MemberAiReadings({ initialReadings }: { initialReadings: MemberAiReading[] }) {
  const [readings, setReadings] = useState(initialReadings);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const answered = readings.filter((r) => r.status === "answered").length;

  async function retry(id: string) {
    setRetrying(id);
    setNotice("");
    try {
      const response = await fetch(`/api/ai-readings/${id}/retry`, { method: "POST" });
      const data = await response.json();
      if (response.ok && data.answer) {
        setReadings((current) => current.map((item) => item.id === id ? { ...item, status: "answered", answer: data.answer } : item));
      } else {
        setNotice(data.error || "Your reading is still being prepared. Try again shortly.");
      }
    } finally {
      setRetrying(null);
    }
  }

  return (
    <>
      <div className="consultation-heading billing-heading"><div><p>Ask Shree Santram Shashtri</p><h1>Live Answers</h1><span>Every reading you&apos;ve requested — questions, Kundli, palm, tarot, face, Vastu, and Lal Kitab.</span></div><div className="hero-actions"><Link href="/ask" className="button button--small"><Sparkles size={14} /> Ask a new question</Link><Link href="/kundli" className="button button--ghost button--small">Full Kundli report</Link><Link href="/palm-reading" className="button button--ghost button--small">Palm reading</Link><Link href="/tarot-reading" className="button button--ghost button--small">Tarot reading</Link><Link href="/face-reading" className="button button--ghost button--small">Face reading</Link><Link href="/vastu-consultation" className="button button--ghost button--small">Vastu consultation</Link><Link href="/lal-kitab-reading" className="button button--ghost button--small">Lal Kitab reading</Link></div></div>
      <section className="member-billing-summary">
        <article><span><Sparkles size={19} /></span><div><small>Readings answered</small><strong>{answered} of {readings.length}</strong></div></article>
      </section>
      <section className="member-invoice-card">
        <header><div><p>History</p><h2>Your questions</h2></div><span>{readings.length} total</span></header>
        <div className="member-invoice-list ai-reading-list">
          {readings.map((reading) => (
            <article key={reading.id} className="ai-reading-item">
              <div className="member-invoice-icon"><Sparkles size={16} /></div>
              <div className="member-invoice-name ai-reading-item__body">
                <small>{new Date(reading.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}{reading.readingType === "kundli" && <> · Full Kundli report</>}{reading.readingType === "palm" && <> · Palm reading (Pandit Trilochan Shashtri)</>}{reading.readingType === "tarot" && <> · Tarot reading (Tarot Mystic Divya)</>}{reading.readingType === "face" && <> · Face reading (Acharya Devraj Bhardwaj)</>}{reading.readingType === "vastu" && <> · Vastu consultation (Vastu Shastri Ramesh Chaturvedi)</>}{reading.readingType === "lalkitab" && <> · Lal Kitab reading (Pandit Girish Trivedi)</>}{reading.readingType === "persona" && reading.personaName && <> · {reading.personaName}</>}</small>
                <h3>{reading.question ?? (reading.readingType === "palm" ? "Hast Rekha Palm Reading" : reading.readingType === "face" ? "Mukh Samudrik Face Reading" : "Full Kundli Report")}</h3>
                {reading.status === "answered" && reading.answer
                  ? <p className="ai-reading-item__answer">{reading.answer}</p>
                  : <p className="ai-reading-item__pending"><Clock3 size={13} /> Your payment is confirmed — the reading is still being prepared.</p>}
              </div>
              <div className="member-invoice-amount">
                <strong>{reading.currency} {reading.price}</strong>
                {reading.status === "answered"
                  ? <span className="invoice-status invoice-status--paid">answered</span>
                  : <button type="button" className="ai-reading-item__retry" disabled={retrying === reading.id} onClick={() => retry(reading.id)}><RefreshCw size={13} className={retrying === reading.id ? "spin" : ""} /> {retrying === reading.id ? "Checking…" : "Check again"}</button>}
              </div>
            </article>
          ))}
          {!readings.length && <div className="consultation-empty"><Sparkles size={26} /><h3>No Live readings yet</h3><p>Ask your first question to receive an instant, personal answer.</p><Link href="/ask" className="button button--small">Ask now</Link></div>}
        </div>
      </section>
      {notice && <div className="toast"><Check size={15} />{notice}<button onClick={() => setNotice("")}><X size={14} /></button></div>}
    </>
  );
}
