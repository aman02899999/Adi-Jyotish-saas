import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import {
  BarChart3,
  Bell,
  BookOpenText,
  Bot,
  CalendarRange,
  Coins,
  Crown,
  ExternalLink,
  Gem,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquareText,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  UserRoundPlus,
  Users,
  WalletCards,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { NotificationBell } from "@/components/notification-bell";
import { ProfileMenu } from "@/components/profile-menu";
import { QuickNavSearch } from "@/components/quick-nav-search";
import { getCurrentAdmin, hasAdminPermission, type AdminIdentity, type AdminPermission } from "@/lib/admin-auth";
import { getAdminUnreadCount } from "@/lib/messaging";

const adminLinks: Array<{ label: string; icon: typeof LayoutDashboard; href: string; permission: AdminPermission }> = [
  { label: "Overview", icon: LayoutDashboard, href: "/admin", permission: "overview" },
  { label: "Services", icon: Sparkles, href: "/admin/services", permission: "services" },
  { label: "Practitioners", icon: UserRoundPlus, href: "/admin/practitioners", permission: "practitioners" },
  { label: "AI Personas", icon: Bot, href: "/admin/ai-personas", permission: "ai_personas" },
  { label: "Website", icon: LayoutTemplate, href: "/admin/website", permission: "website" },
  { label: "Plans", icon: Crown, href: "/admin/plans", permission: "plans" },
  { label: "Gemstones", icon: Gem, href: "/admin/gemstones", permission: "gemstones" },
  { label: "Members", icon: Users, href: "/admin/members", permission: "members_view" },
  { label: "Bookings", icon: BookOpenText, href: "/admin/bookings", permission: "bookings" },
  { label: "Schedule", icon: CalendarRange, href: "/admin/schedule", permission: "schedule" },
  { label: "Reviews", icon: Star, href: "/admin/reviews", permission: "reviews" },
  { label: "Chat", icon: MessageCircle, href: "/admin/chat", permission: "messages" },
  { label: "Billing", icon: WalletCards, href: "/admin/billing", permission: "billing" },
  { label: "Wallets", icon: Coins, href: "/admin/wallets", permission: "billing" },
  { label: "Payouts", icon: WalletCards, href: "/admin/payouts", permission: "billing" },
  { label: "Messages", icon: MessageSquareText, href: "/admin/messages", permission: "messages" },
  { label: "Insights", icon: BarChart3, href: "/admin/insights", permission: "insights" },
  { label: "Activity", icon: ScrollText, href: "/admin/activity", permission: "activity" },
];

type ActiveSection = "Overview" | "Services" | "Practitioners" | "AI Personas" | "Website" | "Plans" | "Gemstones" | "Bookings" | "Members" | "Insights" | "Activity" | "Messages" | "Schedule" | "Billing" | "Reviews" | "Chat" | "Wallets" | "Payouts" | "Settings";

/** Shared between the always-visible desktop sidebar and the mobile <details> drawer below —
 * kept as one function (not a separate component) since both call sites need the exact same
 * server-rendered markup, and this never needs its own client-side state. */
function AdminSidebarNav({ admin, active, unreadCount, initials }: { admin: AdminIdentity | null; active: ActiveSection; unreadCount: number; initials: string }) {
  return (
    <>
      <div className="admin-logo"><BrandMark /></div>
      <div className="admin-role"><ShieldCheck size={14} /> {admin?.role ?? "administrator"}</div>
      <nav>
        <p>Workspace</p>
        {adminLinks.filter(({ permission }) => hasAdminPermission(admin, permission)).map(({ label, icon: Icon, href }) => (
          <Link key={label} className={label === active ? "active" : ""} href={href}>
            <Icon size={18} strokeWidth={1.5} />{label}{label === "Messages" && unreadCount > 0 && <span>{Math.min(unreadCount, 99)}</span>}
          </Link>
        ))}
        {hasAdminPermission(admin, "settings") && <><p>System</p><Link className={active === "Settings" ? "active" : ""} href="/admin/settings"><Settings size={18} strokeWidth={1.5} />Settings</Link></>}
      </nav>
      <div className="admin-sidebar__bottom">
        <Link href="/dashboard"><ExternalLink size={16} />View live dashboard</Link>
        <div><span className="top-avatar">{initials}</span><span><strong>{admin?.name ?? "Administrator"}</strong><small>{admin?.role ?? "admin"}</small></span><form action="/api/auth/logout" method="post"><button aria-label="Sign out" title="Sign out"><LogOut size={14} /></button></form></div>
      </div>
    </>
  );
}

export async function AdminShell({ active, children }: { active: ActiveSection; children: ReactNode }) {
  const [admin, unreadCount] = await Promise.all([getCurrentAdmin(), getAdminUnreadCount()]);
  const initials = admin?.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AD";
  const searchItems = adminLinks.filter(({ permission }) => hasAdminPermission(admin, permission)).map(({ label, href }) => ({ label, href }));
  if (hasAdminPermission(admin, "settings")) searchItems.push({ label: "Settings", href: "/admin/settings" });

  return (
    <main className="admin-background">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <AdminSidebarNav admin={admin} active={active} unreadCount={unreadCount} initials={initials} />
        </aside>

        <section className="admin-main">
          <header className="admin-topbar">
            <div className="admin-mobile-brand">
              <BrandMark compact />
              {/* Native <details>/<summary> disclosure — no client component needed, matches the
                  same mobile-nav pattern already used by MemberAppShell/PractitionerShell. */}
              <details className="admin-mobile-nav">
                <summary aria-label="Open admin navigation"><Menu size={21} /></summary>
                <div className="mobile-drawer admin-mobile-drawer">
                  <AdminSidebarNav admin={admin} active={active} unreadCount={unreadCount} initials={initials} />
                </div>
              </details>
            </div>
            <QuickNavSearch items={searchItems} placeholder="Search anything…" ariaLabel="Search admin" showShortcutHint />
            <div><Link href="/dashboard">Preview site <ExternalLink size={14} /></Link><Link className="notification-button" href="/admin/messages" aria-label={`${unreadCount} unread messages`}><Bell size={18} />{unreadCount > 0 && <i />}</Link><NotificationBell apiBase="/api/admin/notifications" /><ProfileMenu initials={initials} name={admin?.name ?? "Administrator"} subtitle={admin?.email ?? admin?.role ?? "admin"} logoutAction="/api/auth/logout" redirectTo="/admin/login" /></div>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
