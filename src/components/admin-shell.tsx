import type { ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  BookOpenText,
  CalendarRange,
  Coins,
  Crown,
  ExternalLink,
  Gem,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MessageSquareText,
  Search,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  WalletCards,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentAdmin, hasAdminPermission, type AdminPermission } from "@/lib/admin-auth";
import { getAdminUnreadCount } from "@/lib/messaging";

const adminLinks: Array<{ label: string; icon: typeof LayoutDashboard; href: string; permission: AdminPermission }> = [
  { label: "Overview", icon: LayoutDashboard, href: "/admin", permission: "overview" },
  { label: "Services", icon: Sparkles, href: "/admin/services", permission: "services" },
  { label: "Plans", icon: Crown, href: "/admin/plans", permission: "plans" },
  { label: "Gemstones", icon: Gem, href: "/admin/gemstones", permission: "gemstones" },
  { label: "Members", icon: Users, href: "/admin/members", permission: "members_view" },
  { label: "Bookings", icon: BookOpenText, href: "/admin/bookings", permission: "bookings" },
  { label: "Schedule", icon: CalendarRange, href: "/admin/schedule", permission: "schedule" },
  { label: "Reviews", icon: Star, href: "/admin/reviews", permission: "reviews" },
  { label: "Chat", icon: MessageCircle, href: "/admin/chat", permission: "messages" },
  { label: "Billing", icon: WalletCards, href: "/admin/billing", permission: "billing" },
  { label: "Wallets", icon: Coins, href: "/admin/wallets", permission: "billing" },
  { label: "Messages", icon: MessageSquareText, href: "/admin/messages", permission: "messages" },
  { label: "Insights", icon: BarChart3, href: "/admin/insights", permission: "insights" },
  { label: "Activity", icon: ScrollText, href: "/admin/activity", permission: "activity" },
];

export async function AdminShell({ active, children }: { active: "Overview" | "Services" | "Plans" | "Gemstones" | "Bookings" | "Members" | "Insights" | "Activity" | "Messages" | "Schedule" | "Billing" | "Reviews" | "Chat" | "Wallets" | "Settings"; children: ReactNode }) {
  const [admin, unreadCount] = await Promise.all([getCurrentAdmin(), getAdminUnreadCount()]);
  const initials = admin?.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AD";

  return (
    <main className="admin-background">
      <div className="admin-shell">
        <aside className="admin-sidebar">
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
        </aside>

        <section className="admin-main">
          <header className="admin-topbar">
            <div className="admin-mobile-brand"><BrandMark compact /><Menu size={21} /></div>
            <label><Search size={16} /><input placeholder="Search anything…" aria-label="Search admin" /><kbd>⌘ K</kbd></label>
            <div><Link href="/dashboard">Preview site <ExternalLink size={14} /></Link><Link className="notification-button" href="/admin/messages" aria-label={`${unreadCount} unread messages`}><Bell size={18} />{unreadCount > 0 && <i />}</Link><span className="top-avatar" title={admin?.email}>{initials}</span></div>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
