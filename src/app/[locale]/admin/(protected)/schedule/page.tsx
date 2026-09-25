import { countUpcomingBookingsByPractitioner } from "@/lib/admin-directory";
import { AdminSchedule } from "@/components/admin-schedule";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getPractitionerDirectory } from "@/lib/scheduling";

export const dynamic = "force-dynamic";

export default async function AdminSchedulePage() {
  await requireAdminPage("schedule");
  const [people, counts] = await Promise.all([
    getPractitionerDirectory(false, true),
    countUpcomingBookingsByPractitioner(),
  ]);
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
