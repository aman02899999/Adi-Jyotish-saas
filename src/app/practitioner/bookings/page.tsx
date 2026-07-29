import { FileText } from "lucide-react";
import { PractitionerShell } from "@/components/practitioner-shell";
import { requirePractitionerPage } from "@/lib/practitioner-auth";
import { getPractitionerBookings } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export default async function PractitionerBookingsPage() {
  const practitioner = await requirePractitionerPage();
  const bookings = await getPractitionerBookings(practitioner.id);

  return (
    <PractitionerShell practitioner={practitioner} active="Bookings">
      <div className="consultation-heading billing-heading"><div><p>Your workspace</p><h1>Bookings</h1><span>Every client session, past and upcoming.</span></div></div>
      <section className="member-invoice-card">
        <header><div><p>History</p><h2>Client sessions</h2></div><span>{bookings.length} total</span></header>
        <div className="member-invoice-list">
          {bookings.map((booking) => (
            <article key={booking.id}>
              <div className="member-invoice-icon"><FileText size={16} /></div>
              <div className="member-invoice-name">
                <small>{new Date(booking.scheduledAt).toLocaleString("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</small>
                <h3>{booking.clientName}</h3>
                <p>{booking.serviceTitle} · {booking.status} · {booking.paymentStatus}</p>
              </div>
              <div className="member-invoice-amount"><strong>₹{booking.servicePrice}</strong></div>
            </article>
          ))}
          {!bookings.length && <div className="consultation-empty"><FileText size={26} /><h3>No bookings yet</h3><p>Client sessions will appear here once scheduled.</p></div>}
        </div>
      </section>
    </PractitionerShell>
  );
}
