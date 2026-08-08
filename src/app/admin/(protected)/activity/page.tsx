import { Activity, KeyRound, ShieldCheck } from "lucide-react";
import { db } from "@/lib/firestore";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";

export const dynamic = "force-dynamic";

function formatAction(action: string) {
  return action.split(/[._]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export default async function AdminActivityPage() {
  await requireAdminPage("activity");
  const snap = await db.collection("auditLogs").orderBy("createdAt", "desc").limit(150).get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() as { adminId: string | null; adminName: string; action: string; entityType: string; entityId: string | null; details: string | null; createdAt: FirebaseFirestore.Timestamp };
    return { id: doc.id, ...data, createdAt: data.createdAt?.toDate() ?? new Date() };
  });

  return (
    <AdminShell active="Activity">
      <div className="admin-content">
        <div className="admin-heading">
          <div><p>Jyotish / Governance</p><h1>Activity</h1><span>A permanent record of security and operational changes.</span></div>
          <div><small>Audit status</small><strong>Recording <i /></strong></div>
        </div>
        <section className="audit-summary">
          <div><ShieldCheck size={20} /><span><strong>Protected workspace</strong><small>Every mutation requires an active session.</small></span></div>
          <div><KeyRound size={20} /><span><strong>Revocable access</strong><small>Sessions are hashed and expire automatically.</small></span></div>
          <div><Activity size={20} /><span><strong>{rows.length} recent events</strong><small>Newest activity appears first.</small></span></div>
        </section>
        <section className="admin-table-card audit-card">
          <div className="admin-table-header"><div><h2>Audit ledger</h2><p>Authentication, catalogue, booking, and payment events.</p></div><span className="audit-live"><i /> Live</span></div>
          <div className="audit-table">
            <div className="audit-table__head"><span>Event</span><span>Administrator</span><span>Entity</span><span>Details</span><span>Timestamp</span></div>
            {rows.map((entry) => {
              let details = "—";
              try {
                if (entry.details) details = Object.entries(JSON.parse(entry.details) as Record<string, unknown>).map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
              } catch { details = "Recorded change"; }
              return <div className="audit-table__row" key={entry.id}>
                <span className={`audit-event audit-event--${entry.action.split(".")[0]}`}>{formatAction(entry.action)}</span>
                <strong>{entry.adminName}</strong>
                <span>{entry.entityType}{entry.entityId ? ` · ${entry.entityId}` : ""}</span>
                <small title={details}>{details}</small>
                <time dateTime={entry.createdAt.toISOString()}>{entry.createdAt.toLocaleDateString("en", { month: "short", day: "numeric" })} · {entry.createdAt.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</time>
              </div>;
            })}
            {rows.length === 0 && <div className="empty-state"><Activity size={25} /><h3>No activity recorded yet</h3><p>Security and admin changes will appear here.</p></div>}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
