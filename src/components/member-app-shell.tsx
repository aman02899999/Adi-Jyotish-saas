import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  BookOpenText,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  Coins,
  Gem,
  Gift,
  Heart,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Search,
  Sparkles,
  SunMedium,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { FaqWidget } from "@/components/faq-widget";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileMenu } from "@/components/profile-menu";
import { MEMBER_FAQ } from "@/lib/faq-data";
import type { MemberIdentity } from "@/lib/member-auth";
import { getMemberUnreadCount } from "@/lib/messaging";

const navItems = [
  { label: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Family Charts", icon: Users, href: "/dashboard/family" },
  { label: "My Consultations", icon: BookOpenText, href: "/dashboard/consultations" },
  { label: "Predictions", icon: CircleCheck, href: "/dashboard/predictions" },
  { label: "Live Answers", icon: Sparkles, href: "/dashboard/ai-readings" },
  { label: "Gemstone Orders", icon: Gem, href: "/dashboard/gemstone-orders" },
  { label: "Wishlist", icon: Heart, href: "/dashboard/wishlist" },
  { label: "Studio Inbox", icon: MessageSquareText, href: "/dashboard/messages" },
  { label: "Wallet", icon: Coins, href: "/dashboard/wallet" },
  { label: "Billing & Receipts", icon: WalletCards, href: "/dashboard/billing" },
  { label: "Daily Horoscope", icon: SunMedium, href: "/dashboard#insights" },
  { label: "Panchang", icon: CalendarDays, href: "/dashboard#insights" },
  { label: "Connections", icon: HeartHandshake, href: "/dashboard#services-list" },
  { label: "Career & Dharma", icon: BriefcaseBusiness, href: "/book" },
  { label: "Invite & Earn", icon: Gift, href: "/dashboard/referrals" },
];

type ActiveSection = "Dashboard" | "Consultations" | "Messages" | "Billing" | "Wallet" | "AiReadings" | "GemOrders" | "Wishlist" | "Referrals" | "Family" | "Predictions";

function MemberNav({ member, active }: { member: MemberIdentity; active: ActiveSection }) {
  const initials = member.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <>
      <div className="dashboard-brand"><BrandMark /></div>
      <nav className="app-nav" aria-label="Member navigation">
        <p>My cosmos</p>
        {navItems.map(({ label, icon: Icon, href }) => {
          const selected = (active === "Messages" && label === "Studio Inbox") || (active === "Consultations" && label === "My Consultations") || (active === "Dashboard" && label === "Overview") || (active === "Wallet" && label === "Wallet") || (active === "AiReadings" && label === "Live Answers") || (active === "GemOrders" && label === "Gemstone Orders") || (active === "Wishlist" && label === "Wishlist") || (active === "Referrals" && label === "Invite & Earn") || (active === "Family" && label === "Family Charts") || (active === "Predictions" && label === "Predictions");
          return <Link className={selected ? "active" : ""} href={href} key={label}><Icon size={18} strokeWidth={1.5} /><span>{label}</span>{label === "Connections" && <ChevronDown size={13} />}</Link>;
        })}
        <p className="app-nav__lower">Account</p>
        <Link href="/onboarding"><UserRound size={18} strokeWidth={1.5} /><span>Birth profile</span></Link>
      </nav>
      <div className="profile-chip">
        <span className="profile-avatar">{initials}</span>
        <span><strong>{member.name}</strong><small>{member.plan} plan</small></span>
        <form action="/api/member/logout" method="post"><button aria-label="Sign out" title="Sign out"><LogOut size={16} /></button></form>
      </div>
    </>
  );
}

export async function MemberAppShell({ member, active, children }: { member: MemberIdentity; active: ActiveSection; children: ReactNode }) {
  const unreadCount = await getMemberUnreadCount(member.id);
  const initials = member.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return (
    <main className="app-background">
      <div className="app-frame">
        <aside className="app-sidebar"><MemberNav member={member} active={active} /></aside>
        <div className="mobile-app-nav">
          <BrandMark />
          <details><summary aria-label="Open member navigation"><Menu size={22} /></summary><div className="mobile-drawer"><MemberNav member={member} active={active} /></div></details>
        </div>
        <section className="app-content">
          <header className="app-topbar">
            <nav><Link className={active === "Dashboard" ? "active" : ""} href="/dashboard">Dashboard</Link><Link className={active === "Consultations" ? "active" : ""} href="/dashboard/consultations">My consultations</Link><Link className={active === "AiReadings" ? "active" : ""} href="/dashboard/ai-readings">Live Answers</Link><Link className={active === "GemOrders" ? "active" : ""} href="/dashboard/gemstone-orders">Gem orders</Link><Link className={active === "Messages" ? "active" : ""} href="/dashboard/messages">Inbox</Link><Link className={active === "Wallet" ? "active" : ""} href="/dashboard/wallet">Wallet</Link><Link className={active === "Billing" ? "active" : ""} href="/dashboard/billing">Billing</Link><Link className={active === "Referrals" ? "active" : ""} href="/dashboard/referrals">Invite & earn</Link></nav>
            <div className="topbar-tools">
              <label><Search size={16} /><input aria-label="Search dashboard" placeholder="Search" /></label>
              <Link className="notification-button" href="/dashboard/messages" aria-label={`${unreadCount} unread messages`}><Bell size={18} />{unreadCount > 0 && <span />}</Link>
              <NotificationBell apiBase="/api/member/notifications" />
              <ProfileMenu initials={initials} name={member.name} subtitle={`${member.plan} plan`} logoutAction="/api/member/logout" />
            </div>
          </header>
          <div className="dashboard-scroll">{children}</div>
        </section>
      </div>
      <FaqWidget faqs={MEMBER_FAQ} title="Help & FAQ" />
    </main>
  );
}
