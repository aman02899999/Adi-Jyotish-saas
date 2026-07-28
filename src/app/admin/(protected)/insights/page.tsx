import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  Download,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAnalytics, parseReportRange } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const ranges = [{key:"30d",label:"30 days"},{key:"90d",label:"90 days"},{key:"365d",label:"12 months"},{key:"all",label:"All time"}] as const;

export default async function AdminInsightsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdminPage("insights");
  const query = await searchParams;
  const range = parseReportRange(query.range);
  const analytics = await getAnalytics(range);
  const { metrics } = analytics;
  const maxRevenue = Math.max(1,...analytics.timeline.map(point=>point.revenue));
  const maxBookings = Math.max(1,...analytics.timeline.map(point=>point.bookings));
  const statusTotal = Math.max(1,analytics.statuses.reduce((sum,item)=>sum+item.count,0));
  const planMax = Math.max(1,...analytics.plans.map(item=>item.count));
  const points = analytics.timeline.map((point,index)=>`${index/(analytics.timeline.length-1)*600},${145-point.bookings/maxBookings*120}`).join(" ");

  return <AdminShell active="Insights"><div className="admin-content insights-content">
    <div className="admin-heading insights-heading"><div><p>Jyotish / Intelligence</p><h1>Insights</h1><span>Understand growth, demand, and the health of your studio.</span></div><div className="insight-actions"><nav>{ranges.map(item=><Link className={range===item.key?"active":""} href={`/admin/insights?range=${item.key}`} key={item.key}>{item.label}</Link>)}</nav><a className="button button--small" href={`/api/reports/bookings?range=${range}`}><Download size={14}/> Export CSV</a></div></div>

    <section className="insight-metrics">
      <article><span><CircleDollarSign size={19}/></span><div><small>Revenue · {analytics.rangeLabel}</small><strong>${metrics.revenue.toLocaleString()}</strong><em className={metrics.revenueChange>=0?"up":"down"}>{metrics.revenueChange>=0?<ArrowUpRight size={12}/>:<ArrowDownRight size={12}/>} {Math.abs(metrics.revenueChange)}%</em></div></article>
      <article><span><Target size={19}/></span><div><small>Average order</small><strong>${metrics.averageOrder}</strong><em>Paid consultations</em></div></article>
      <article><span><CalendarClock size={19}/></span><div><small>Open forecast</small><strong>${metrics.forecast.toLocaleString()}</strong><em>Upcoming unpaid value</em></div></article>
      <article><span><Users size={19}/></span><div><small>Active members</small><strong>{metrics.activeMembers}</strong><em>{metrics.onboardingRate}% chart complete</em></div></article>
      <article><span><Sparkles size={19}/></span><div><small>Lifetime revenue</small><strong>${metrics.lifetimeRevenue.toLocaleString()}</strong><em>{metrics.publishedServices} services live</em></div></article>
    </section>

    <div className="insights-grid">
      <section className="insight-card-large trend-report">
        <header><div><p>Growth over time</p><h2>Revenue & reservations</h2></div><div><span><i className="revenue-key"/>Revenue</span><span><i className="booking-key"/>Bookings</span></div></header>
        <div className="trend-chart">
          <div className="trend-bars">{analytics.timeline.map((point,index)=><div key={`${point.label}-${index}`}><i style={{height:`${Math.max(2,point.revenue/maxRevenue*100)}%`}}/><small>{index%2===0?point.label:""}</small></div>)}</div>
          <svg viewBox="0 0 600 160" preserveAspectRatio="none" aria-label="Booking volume"><polyline points={points}/>{analytics.timeline.map((point,index)=><circle key={index} cx={index/(analytics.timeline.length-1)*600} cy={145-point.bookings/maxBookings*120} r="3"/>)}</svg>
        </div>
        <footer><span><small>Total bookings</small><strong>{metrics.bookings}</strong></span><span><small>Completion</small><strong>{metrics.completion}%</strong></span><span><small>New members</small><strong>{metrics.newMembers}</strong></span></footer>
      </section>

      <section className="insight-card-large status-report">
        <header><div><p>Booking funnel</p><h2>Consultation status</h2></div></header>
        <div className="status-donut" style={{background:`conic-gradient(var(--copper) 0 ${analytics.statuses[0].count/statusTotal*100}%,#b88a62 0 ${(analytics.statuses[0].count+analytics.statuses[1].count)/statusTotal*100}%,#77866a 0 ${(analytics.statuses[0].count+analytics.statuses[1].count+analytics.statuses[2].count)/statusTotal*100}%,#9b7770 0)`}}><div><strong>{metrics.bookings}</strong><small>Total</small></div></div>
        <div className="status-legend">{analytics.statuses.map((item,index)=><div key={item.status}><i className={`status-dot status-dot--${index}`}/><span><small>{item.status}</small><strong>{item.count}</strong></span><em>{Math.round(item.count/statusTotal*100)}%</em></div>)}</div>
      </section>

      <section className="insight-card-large service-report">
        <header><div><p>Demand & quality</p><h2>Service performance</h2></div><Link href="/admin/services">Catalogue <ArrowRightIcon/></Link></header>
        <div className="service-report-head"><span>Service</span><span>Bookings</span><span>Revenue</span><span>Completion</span></div>
        {analytics.topServices.map((service,index)=><div className="service-report-row" key={service.title}><div><span>0{index+1}</span><strong>{service.title}</strong></div><span>{service.bookings}</span><strong>${service.revenue}</strong><div><i><b style={{width:`${service.completion}%`}}/></i><small>{service.completion}%</small></div></div>)}
        {!analytics.topServices.length&&<div className="overview-empty overview-empty--large"><Sparkles size={21}/><span><strong>No service data in this range</strong><small>Try a longer reporting period.</small></span></div>}
      </section>

      <section className="insight-card-large plan-report">
        <header><div><p>Customer mix</p><h2>Membership plans</h2></div></header>
        <div className="plan-chart">{analytics.plans.map(item=><div key={item.plan}><span><small>{item.plan}</small><strong>{item.count}</strong></span><i><b style={{width:`${item.count/planMax*100}%`}}/></i></div>)}</div>
        <div className="plan-highlight"><span>{metrics.onboardingRate}%</span><p><strong>Natal onboarding complete</strong><small>Members with a calculation-ready birth profile.</small></p></div>
      </section>
    </div>
    <p className="report-generated">Generated {analytics.generatedAt.toLocaleString("en",{month:"long",day:"numeric",hour:"numeric",minute:"2-digit"})} · Payment revenue includes bookings marked paid.</p>
  </div></AdminShell>;
}

function ArrowRightIcon(){return <ArrowUpRight size={13}/>;}
