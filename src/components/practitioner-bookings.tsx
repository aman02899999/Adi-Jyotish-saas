"use client";

import { useState } from "react";
import { ChevronDown, FileText, LoaderCircle, ScrollText } from "lucide-react";

export type PractitionerBooking = {
  id: string;
  reference: string;
  clientName: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  serviceTitle: string;
  servicePrice: number;
  status: string;
  paymentStatus: string;
  scheduledAt: string | Date;
  kundliSummary: string | null;
};

export function PractitionerBookings({ initialBookings }: { initialBookings: PractitionerBooking[] }) {
  const [bookings, setBookings] = useState(initialBookings);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function generateKundli(id: string) {
    setLoadingId(id);
    setError("");
    try {
      const response = await fetch(`/api/practitioner/bookings/${id}/kundli`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The Kundli summary could not be generated.");
      setBookings((current) => current.map((booking) => (booking.id === id ? { ...booking, kundliSummary: data.kundliSummary } : booking)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Kundli summary could not be generated.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="member-invoice-card">
      <header><div><p>History</p><h2>Client sessions</h2></div><span>{bookings.length} total</span></header>
      <div className="member-invoice-list">
        {bookings.map((booking) => {
          const open = openId === booking.id;
          return (
            <div key={booking.id} className="practitioner-booking">
              <div className="practitioner-booking__row" onClick={() => setOpenId(open ? null : booking.id)}>
                <div className="member-invoice-icon"><FileText size={16} /></div>
                <div className="member-invoice-name">
                  <small>{new Date(booking.scheduledAt).toLocaleString("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</small>
                  <h3>{booking.clientName}</h3>
                  <p>{booking.serviceTitle} · {booking.status} · {booking.paymentStatus}</p>
                </div>
                <div className="member-invoice-amount"><strong>₹{booking.servicePrice}</strong></div>
                <ChevronDown size={16} className={`practitioner-booking__chevron${open ? " practitioner-booking__chevron--open" : ""}`} />
              </div>
              {open && (
                <div className="practitioner-booking__detail">
                  <div className="practitioner-booking__birth">
                    <span>Born {booking.birthDate} · {booking.birthTime}</span>
                    <span>{booking.birthPlace}</span>
                  </div>
                  {booking.kundliSummary ? (
                    <div className="kundli-report">
                      {booking.kundliSummary.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                    </div>
                  ) : (
                    <button type="button" className="button button--small" disabled={loadingId === booking.id} onClick={() => generateKundli(booking.id)}>
                      {loadingId === booking.id ? <><LoaderCircle size={14} className="spin" /> Generating…</> : <><ScrollText size={14} /> Generate Kundli summary</>}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!bookings.length && <div className="consultation-empty"><FileText size={26} /><h3>No bookings yet</h3><p>Client sessions will appear here once scheduled.</p></div>}
      </div>
      {error && <p className="admin-auth-error">{error}</p>}
    </section>
  );
}
