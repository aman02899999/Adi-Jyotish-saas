import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarCheck2,
  CircleDollarSign,
  Clock3,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserRoundPlus,
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { getAnalytics } from "@/lib/analytics";
import { requireAdminPage } from "@/lib/admin-page";

export const dynamic = "force-dynamic";

function Change({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const positive = value >= 0;
  return <span className={`metric-change ${positive ? "positive" : "negative"}`}>{positive ? <TrendingUp size={11}/> : <TrendingDown size={11}/>} {positive?"+":""}{value}{suffix}</span>;
}

export default async function AdminOverviewPage() {
  const [analytics, admin] = await Promise.all([getAnalytics("30d"), requireAdminPage("overview")]);
  const { metrics } = analytics;
  const maxRevenue = Math.max(1, ...analytics.timeline.map((point) => point.revenue));
  const maxService = Math.max(1, ...analytics.topServices.map((service) => service.bookings));

  return <AdminShell active="Overview"><div className="admin-content admin-overview-content">
    <div className="overview-welcome"><div><p>Studio intelligence</p><h1>Welcome back, {admin?.name.split(" ")[0] ?? "administrator"}.</h1><span>Here is what is happening across Jyotish this month.</span></div><div><small>{new Date().toLocaleDateString("en",{weekday:"long",month:"long",day:"numeric"})}</small><Link href="/admin/insights">Open full report <ArrowUpRight size={14}/></Link></div></div>

    <section className="overview-kpis">
      <article><div><span><CircleDollarSign size={19}/></span><small>Collected revenue</small></div><strong>₹{metrics.revenue.toLocaleString()}</strong><footer><Change value={metrics.revenueChange}/><small>vs previous 30 days</small></footer></article>
      <article><div><span><CalendarCheck2 size={19}/></span><small>New bookings</small></div><strong>{metrics.bookings}</strong><footer><Change value={metrics.bookingsChange}/><small>vs previous period</small></footer></article>
      <article><div><span><UserRoundPlus size={19}/></span><small>New members</small></div><strong>{metrics.newMembers}</strong><footer><Change value={metrics.membersChange}/><small>{metrics.activeMembers} total active</small></footer></article>
      <article><div><span><Sparkles size={19}/></span><small>Completion rate</small></div><strong>{metrics.completion}%</strong><footer><Change value={metrics.completionChange} suffix=" pts"/><small>session quality</small></footer></article>
    </section>

    <div className="overview-grid">
      <section className="overview-card revenue-overview">
        <header><div><p>Financial pulse</p><h2>Revenue movement</h2></div><div><span><i/> Revenue</span><Link href="/admin/insights">Details <ArrowRight size={13}/></Link></div></header>
        <div className="overview-revenue-total"><strong>₹{metrics.revenue.toLocaleString()}</strong><span>Last 30 days</span></div>
        <div className="revenue-bars" aria-label="Revenue trend chart">{analytics.timeline.map((point,index)=><div key={`${point.label}-${index}`}><span className="revenue-bar-value">{point.revenue?`$${point.revenue}`:""}</span><i style={{height:`${Math.max(3,point.revenue/maxRevenue*100)}%`}}/><small>{index%2===0?point.label:""}</small></div>)}</div>
      </section>

      <section className="overview-card pulse-card">
        <header><div><p>Forward view</p><h2>Operational pulse</h2></div><BarChart3 size={18}/></header>
        <div className="pulse-metric"><div className="pulse-ring" style={{background:`conic-gradient(var(--copper) ${metrics.completion}%,rgba(126,94,72,.1) 0)`}}><span>{metrics.completion}%</span></div><div><small>Completion rate</small><strong>{metrics.bookings} consultations</strong><p>{analytics.statuses.find(x=>x.status==="cancelled")?.count??0} cancelled in this period</p></div></div>
        <div className="pulse-row"><span><small>Expected revenue</small><strong>₹{metrics.forecast.toLocaleString()}</strong></span><span><small>Average order</small><strong>₹{metrics.averageOrder}</strong></span></div>
      </section>

      <section className="overview-card upcoming-overview">
        <header><div><p>Next on the calendar</p><h2>Upcoming readings</h2></div><Link href="/admin/bookings">View calendar <ArrowRight size={13}/></Link></header>
        <div className="overview-appointments">{analytics.upcomingBookings.map((booking)=><article key={booking.id}><div><small>{booking.scheduledAt.toLocaleDateString("en",{month:"short"})}</small><strong>{booking.scheduledAt.getDate()}</strong></div><span><strong>{booking.clientName}</strong><small>{booking.serviceTitle}</small></span><time>{booking.scheduledAt.toLocaleTimeString("en",{hour:"numeric",minute:"2-digit"})}</time></article>)}{!analytics.upcomingBookings.length&&<div className="overview-empty"><Clock3 size={21}/><span><strong>No upcoming readings</strong><small>The studio calendar is open.</small></span></div>}</div>
      </section>

      <section className="overview-card services-overview">
        <header><div><p>Catalogue performance</p><h2>Top services</h2></div><Link href="/admin/services">Manage <ArrowRight size={13}/></Link></header>
        <div className="overview-service-list">{analytics.topServices.map((service,index)=><article key={service.title}><span>0{index+1}</span><div><strong>{service.title}</strong><i><b style={{width:`${service.bookings/maxService*100}%`}}/></i></div><small>{service.bookings} bookings</small><em>₹{service.revenue}</em></article>)}{!analytics.topServices.length&&<div className="overview-empty"><Sparkles size={21}/><span><strong>Performance is gathering</strong><small>Booked services will rank here.</small></span></div>}</div>
      </section>
    </div>

    <section className="overview-card recent-overview">
      <header><div><p>Most recent activity</p><h2>Latest reservations</h2></div><Link href="/admin/bookings">All bookings <ArrowRight size={13}/></Link></header>
      <div className="overview-bookings-head"><span>Customer</span><span>Reading</span><span>Created</span><span>Value</span><span>Status</span></div>
      {analytics.recentBookings.map((booking)=><div className="overview-booking-row" key={booking.id}><div><span>{booking.clientName.split(" ").map(x=>x[0]).join("").slice(0,2)}</span><strong>{booking.clientName}</strong></div><span>{booking.serviceTitle}</span><time>{booking.createdAt.toLocaleDateString("en",{month:"short",day:"numeric"})}</time><strong>₹{booking.servicePrice}</strong><em className={`admin-status admin-status--${booking.status}`}>{booking.status}</em></div>)}
      {!analytics.recentBookings.length&&<div className="overview-empty overview-empty--large"><CalendarCheck2 size={23}/><span><strong>No reservations yet</strong><small>New bookings will appear here in real time.</small></span></div>}
    </section>
  </div></AdminShell>;
}
