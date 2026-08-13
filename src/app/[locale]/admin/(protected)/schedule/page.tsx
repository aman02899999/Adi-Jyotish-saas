import { db } from "@/lib/firestore";
import { AdminSchedule } from "@/components/admin-schedule";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getPractitionerDirectory } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

export default async function AdminSchedulePage() {
  await requireAdminPage("schedule");
  const [people, upcomingSnap] = await Promise.all([
    getPractitionerDirectory(false, true),
    db.collection("bookings").where("scheduledAt", ">", new Date()).get(),
  ]);
  const counts: Record<string, number> = {};
  for (const doc of upcomingSnap.docs) {
    const data = doc.data() as { practitionerId?: string; status?: string };
    if (data.practitionerId && data.status !== "cancelled") counts[data.practitionerId] = (counts[data.practitionerId] ?? 0) + 1;
  }
  return (
    <AdminShell active="Schedule">
      <div className="admin-content">
        <div className="admin-heading">
          <div><p>Jyotish / Operations</p><h1>Schedule</h1><span>Manage practitioners, working hours, and time away.</span></div>
          <div><small>Availability</small><strong>Live <i /></strong></div>
        </div>
        <AdminSchedule initialPractitioners={people} upcomingCounts={counts} />
      </div>
    </AdminShell>
  );
}
