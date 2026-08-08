import Link from "next/link";
import { CalendarClock, CalendarDays, Coins, Star, Users } from "lucide-react";
import { PractitionerShell } from "@/components/practitioner-shell";
import { requirePractitionerPage } from "@/lib/practitioner-auth";
import { getPractitionerBookings, getPractitionerStats } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export default async function PractitionerOverviewPage() {
  const practitioner = await requirePractitionerPage();
  const [stats, bookings] = await Promise.all([
    getPractitionerStats(practitioner.id),
    getPractitionerBookings(practitioner.id),
  ]);
  const upcoming = bookings.filter((booking) => ["pending", "confirmed"].includes(booking.status) && new Date(booking.scheduledAt) >= new Date()).slice(0, 5);

  return (
    <PractitionerShell practitioner={practitioner} active="Overview">
      <div className="dashboard-welcome"><h1>Welcome back, {practitioner.name.split(" ")[0]}.</h1><p>Here&apos;s how your practice is doing.</p></div>

      <section className="overview-kpis">
        <article><span><Coins size={18} /></span><div><small>Available to withdraw</small><strong>₹{stats.availableBalance}</strong></div></article>
        <article><span><CalendarClock size={18} /></span><div><small>Upcoming sessions</small><strong>{stats.upcomingCount}</strong></div></article>
        <article><span><Users size={18} /></span><div><small>Completed sessions</small><strong>{stats.completedCount}</strong></div></article>
        <article><span><Star size={18} /></span><div><small>Average rating</small><strong>{stats.avgRating || "—"} <small>({stats.reviewCount})</small></strong></div></article>
      </section>

      <section className="strip-heading"><h2>Upcoming consultations</h2><Link href="/practitioner/bookings" className="text-arrow">View all</Link></section>
      <div className="member-invoice-card">
        <div className="member-invoice-list">
          {upcoming.map((booking) => (
            <article key={booking.id}>
              <div className="member-invoice-icon"><CalendarDays size={16} /></div>
              <div className="member-invoice-name">
                <small>{new Date(booking.scheduledAt).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</small>
                <h3>{booking.serviceTitle}</h3>
                <p>{booking.clientName}</p>
              </div>
              <div className="member-invoice-amount"><strong>{booking.status}</strong></div>
            </article>
          ))}
          {!upcoming.length && <div className="consultation-empty"><CalendarClock size={26} /><h3>No upcoming sessions</h3><p>New bookings will show up here.</p></div>}
        </div>
      </div>
    </PractitionerShell>
  );
}
