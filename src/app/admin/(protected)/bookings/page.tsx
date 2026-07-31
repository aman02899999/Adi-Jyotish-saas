import { db } from "@/lib/firestore";
import { bookingFromDoc } from "@/app/api/bookings/route";
import { AdminBookings } from "@/components/admin-bookings";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage() {
  await requireAdminPage("bookings");
  const snap = await db.collection("bookings").orderBy("scheduledAt", "desc").get();
  const rows = snap.docs.map((doc) => bookingFromDoc(doc));

  return (
    <AdminShell active="Bookings">
      <div className="admin-content">
        <div className="admin-heading">
          <div><p>Jyotish / Operations</p><h1>Bookings</h1><span>Manage consultations from reservation through completion.</span></div>
          <div><small>Calendar status</small><strong>Live <i /></strong></div>
        </div>
        <AdminBookings initialBookings={rows} />
      </div>
    </AdminShell>
  );
}
