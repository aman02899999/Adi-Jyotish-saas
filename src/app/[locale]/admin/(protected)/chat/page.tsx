import { Link } from "@/i18n/navigation";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { listActiveSessionsForAdmin } from "@/lib/chat";

export const dynamic = "force-dynamic";

export default async function AdminChatPage() {
  await requireAdminPage("messages");
  const sessions = await listActiveSessionsForAdmin();

  return (
    <AdminShell active="Chat">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Operations</p><h1>Live chat</h1><span>Reply on behalf of practitioners in active instant chats.</span></div><div><small>Active now</small><strong>{sessions.length} <i /></strong></div></div>

        <section className="admin-table-card">
          <div className="admin-table-header"><div><h2>Active sessions</h2><p>Instant chats currently metering against a member&apos;s wallet.</p></div></div>
          <div className="wallet-table wallet-table--chat">
            <div className="wallet-table__head"><span>Member</span><span>Practitioner</span><span>Rate</span><span>Started</span><span /></div>
            {sessions.map((session) => (
              <div className="wallet-table__row" key={session.id}>
                <div className="finance-customer"><strong>{session.memberName}</strong><small>{session.memberEmail}</small></div>
                <strong>{session.practitionerName}</strong>
                <span className="payment-provider">{session.ratePerMinute}/min</span>
                <div className="finance-date"><strong>{new Date(session.startedAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</strong></div>
                <Link className="button button--small" href={`/admin/chat/${session.id}`}>Open <ArrowUpRight size={14} /></Link>
              </div>
            ))}
            {!sessions.length && <div className="empty-state"><MessageCircle size={25} /><h3>No active chats</h3><p>Instant chats will appear here while they&apos;re live.</p></div>}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
