import Link from "next/link";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { PractitionerShell } from "@/components/practitioner-shell";
import { requirePractitionerPage } from "@/lib/practitioner-auth";
import { listSessionsForPractitioner } from "@/lib/chat";

export const dynamic = "force-dynamic";

export default async function PractitionerChatPage() {
  const practitioner = await requirePractitionerPage();
  const sessions = await listSessionsForPractitioner(practitioner.id);
  const activeCount = sessions.filter((session) => session.status === "active").length;

  return (
    <PractitionerShell practitioner={practitioner} active="Chat">
      <div className="consultation-heading billing-heading"><div><p>Your workspace</p><h1>Live chat</h1><span>Instant chats clients have started with you, metered by the minute from their wallet.</span></div><div><small>Active now</small><strong>{activeCount} <i /></strong></div></div>

      <section className="admin-table-card">
        <div className="admin-table-header"><div><h2>Conversations</h2><p>Open a session to reply live and pull up the client&apos;s Kundli.</p></div></div>
        <div className="wallet-table wallet-table--chat">
          <div className="wallet-table__head"><span>Client</span><span>Status</span><span>Rate</span><span>Started</span><span /></div>
          {sessions.map((session) => (
            <div className="wallet-table__row" key={session.id}>
              <div className="finance-customer"><strong>{session.memberName}</strong></div>
              <span className={session.status === "active" ? "invoice-status invoice-status--paid" : "invoice-status"}>{session.status}</span>
              <span className="payment-provider">{session.ratePerMinute}/min</span>
              <div className="finance-date"><strong>{new Date(session.startedAt).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</strong></div>
              <Link className="button button--small" href={`/practitioner/chat/${session.id}`}>Open <ArrowUpRight size={14} /></Link>
            </div>
          ))}
          {!sessions.length && <div className="empty-state"><MessageCircle size={25} /><h3>No chats yet</h3><p>When a client starts an instant chat with you, it&apos;ll show up here.</p></div>}
        </div>
      </section>
    </PractitionerShell>
  );
}
