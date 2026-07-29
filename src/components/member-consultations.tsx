"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  FileText,
  Sparkles,
  Video,
  X,
} from "lucide-react";

export type MemberBooking = {
  id: number;
  reference: string;
  serviceId: number | null;
  serviceTitle: string;
  servicePrice: number;
  practitionerName: string | null;
  scheduledAt: string | Date;
  notes: string | null;
  status: string;
  paymentStatus: string;
  createdAt: string | Date;
};

export function MemberConsultations({ initialBookings, cancellationHours = 24 }: { initialBookings: MemberBooking[]; cancellationHours?: number }) {
  const [items, setItems] = useState(initialBookings);
  const [view, setView] = useState<"upcoming" | "history">("upcoming");
  const [cancelling, setCancelling] = useState<MemberBooking | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [now] = useState(() => new Date());

  const visible = useMemo(() => items.filter((item) => view === "upcoming"
    ? new Date(item.scheduledAt) > now && item.status !== "cancelled"
    : new Date(item.scheduledAt) <= now || item.status === "cancelled"), [items, view, now]);
  const next = items.filter((item) => new Date(item.scheduledAt) > now && item.status !== "cancelled").sort((a,b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0];
  const completed = items.filter(({ status }) => status === "completed").length;
  const invested = items.filter(({ paymentStatus }) => paymentStatus === "paid").reduce((sum, item) => sum + item.servicePrice, 0);

  async function cancelBooking() {
    if (!cancelling) return;
    setSaving(true); setNotice("");
    try {
      const response = await fetch(`/api/member/bookings/${cancelling.id}`, { method: "PUT" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "This consultation could not be cancelled.");
      setItems((current) => current.map((item) => item.id === data.id ? data : item));
      setCancelling(null); setNotice("Your consultation has been cancelled.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
      setCancelling(null);
    } finally { setSaving(false); }
  }

  return (
    <>
      <div className="consultation-heading">
        <div><p>Your journey</p><h1>My consultations</h1><span>Every reading, reservation, and reflection in one place.</span></div>
        <Link href="/book" className="button button--small"><Sparkles size={15} /> Book a reading</Link>
      </div>

      <section className="member-consultation-stats">
        <article><CalendarCheck2 size={19} /><span><small>All readings</small><strong>{items.length}</strong></span></article>
        <article><Clock3 size={19} /><span><small>Upcoming</small><strong>{items.filter((item) => new Date(item.scheduledAt) > now && item.status !== "cancelled").length}</strong></span></article>
        <article><Check size={19} /><span><small>Completed</small><strong>{completed}</strong></span></article>
        <article><CreditCard size={19} /><span><small>Invested in clarity</small><strong>₹{invested}</strong></span></article>
      </section>

      {next && <section className="next-consultation glass-card">
        <div className="next-consultation__date"><small>{new Date(next.scheduledAt).toLocaleDateString("en", { month: "short" })}</small><strong>{new Date(next.scheduledAt).getDate()}</strong><span>{new Date(next.scheduledAt).toLocaleDateString("en", { weekday: "short" })}</span></div>
        <div className="next-consultation__copy"><p>Next consultation</p><h2>{next.serviceTitle}</h2><span><Clock3 size={13} /> {new Date(next.scheduledAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })} · Private video call</span></div>
        <div className="next-consultation__actions"><span className={`consultation-status consultation-status--${next.status}`}>{next.status}</span><button onClick={() => setCancelling(next)}>Manage</button></div>
        <Video className="next-consultation__watermark" size={120} strokeWidth={.5} />
      </section>}

      <section className="consultation-list-card">
        <div className="consultation-tabs"><button className={view === "upcoming" ? "active" : ""} onClick={() => setView("upcoming")}>Upcoming</button><button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>History</button></div>
        <div className="consultation-list">
          {visible.map((item) => {
            const date = new Date(item.scheduledAt);
            const canCancel = ["pending","confirmed"].includes(item.status) && date.getTime() - Date.now() >= cancellationHours * 60 * 60 * 1000;
            return <article key={item.id}>
              <div className="consultation-list__icon"><FileText size={18} /></div>
              <div className="consultation-list__name"><small>{item.reference}</small><h3>{item.serviceTitle}</h3><p>{item.practitionerName ?? "Jyotish Studio"} · {date.toLocaleDateString("en", { weekday: "short", month: "long", day: "numeric", year: "numeric" })} · {date.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</p></div>
              <div className="consultation-list__meta"><span className={`consultation-status consultation-status--${item.status}`}>{item.status}</span><small>{item.paymentStatus} · ${item.servicePrice}</small></div>
              <div className="consultation-list__actions">{canCancel && <button onClick={() => setCancelling(item)}>Cancel</button>}<Link href={item.serviceId ? `/book?service=${item.serviceId}` : "/book"}>Book again <ArrowRight size={13} /></Link></div>
            </article>;
          })}
          {visible.length === 0 && <div className="consultation-empty"><CalendarDays size={26} /><h3>{view === "upcoming" ? "Your calendar is open" : "No past readings yet"}</h3><p>{view === "upcoming" ? "Choose a reading when you are ready for your next moment of clarity." : "Completed and cancelled consultations will appear here."}</p><Link href="/book" className="button button--small">Explore readings</Link></div>}
        </div>
      </section>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
      {cancelling && <div className="modal-backdrop" role="presentation" onMouseDown={() => setCancelling(null)}><section className="cancel-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title" onMouseDown={(event) => event.stopPropagation()}><div className="cancel-dialog__icon"><CalendarDays size={22} /></div><h2 id="cancel-title">Cancel this consultation?</h2><p>Your <strong>{cancelling.serviceTitle}</strong> is scheduled for {new Date(cancelling.scheduledAt).toLocaleDateString("en", { month: "long", day: "numeric" })}. Payment adjustments, when applicable, are reviewed by the studio.</p><div><button className="button button--ghost" onClick={() => setCancelling(null)}>Keep appointment</button><button className="button cancel-button" disabled={saving} onClick={cancelBooking}>{saving ? "Cancelling…" : "Yes, cancel"}</button></div></section></div>}
    </>
  );
}
