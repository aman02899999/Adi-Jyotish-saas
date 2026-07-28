import { desc } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { AdminBookings } from "@/components/admin-bookings";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage() {
  await requireAdminPage("bookings");
  const rows = await db.select().from(bookings).orderBy(desc(bookings.scheduledAt));

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
