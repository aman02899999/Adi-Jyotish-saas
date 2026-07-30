import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, Coins, LayoutDashboard, LogOut, Menu, Star, UserRound } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { NotificationBell } from "@/components/notification-bell";
import type { PractitionerIdentity } from "@/lib/practitioner-auth";

type ActiveTab = "Overview" | "Schedule" | "Bookings" | "Earnings" | "Reviews" | "Profile";

const navItems: { label: string; icon: typeof LayoutDashboard; href: string; tab: ActiveTab }[] = [
  { label: "Overview", icon: LayoutDashboard, href: "/practitioner", tab: "Overview" },
  { label: "Schedule", icon: CalendarClock, href: "/practitioner/schedule", tab: "Schedule" },
  { label: "Bookings", icon: CalendarClock, href: "/practitioner/bookings", tab: "Bookings" },
  { label: "Earnings", icon: Coins, href: "/practitioner/earnings", tab: "Earnings" },
  { label: "Reviews", icon: Star, href: "/practitioner/reviews", tab: "Reviews" },
  { label: "Profile", icon: UserRound, href: "/practitioner/profile", tab: "Profile" },
];

function PractitionerNav({ practitioner, active }: { practitioner: PractitionerIdentity; active: ActiveTab }) {
  const initials = practitioner.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <>
      <div className="dashboard-brand"><BrandMark /></div>
      <nav className="app-nav" aria-label="Practitioner navigation">
        <p>Your workspace</p>
        {navItems.map(({ label, icon: Icon, href, tab }) => (
          <Link className={active === tab ? "active" : ""} href={href} key={label}><Icon size={18} strokeWidth={1.5} /><span>{label}</span></Link>
        ))}
      </nav>
      <div className="profile-chip">
        <span className="profile-avatar">{initials}</span>
        <span><strong>{practitioner.name}</strong><small>{practitioner.title}</small></span>
        <form action="/api/auth/practitioner-logout" method="post"><button aria-label="Sign out" title="Sign out"><LogOut size={16} /></button></form>
      </div>
    </>
  );
}

export async function PractitionerShell({ practitioner, active, children }: { practitioner: PractitionerIdentity; active: ActiveTab; children: ReactNode }) {
  const initials = practitioner.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <main className="app-background">
      <div className="app-frame">
        <aside className="app-sidebar"><PractitionerNav practitioner={practitioner} active={active} /></aside>
        <div className="mobile-app-nav">
          <BrandMark />
          <details><summary aria-label="Open practitioner navigation"><Menu size={22} /></summary><div className="mobile-drawer"><PractitionerNav practitioner={practitioner} active={active} /></div></details>
        </div>
        <section className="app-content">
          <header className="app-topbar">
            <nav>{navItems.map(({ label, href, tab }) => <Link key={label} className={active === tab ? "active" : ""} href={href}>{label}</Link>)}</nav>
            <div className="topbar-tools">
              <NotificationBell apiBase="/api/practitioner/notifications" />
              <span className="top-avatar">{initials}</span>
            </div>
          </header>
          <div className="dashboard-scroll">{children}</div>
        </section>
      </div>
    </main>
  );
}
