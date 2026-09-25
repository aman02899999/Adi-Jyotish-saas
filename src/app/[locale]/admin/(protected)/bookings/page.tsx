import { db } from "@/lib/firestore";
import { bookingFromDoc } from "@/app/api/bookings/route";
import { AdminBookings } from "@/components/admin-bookings";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { listBookingsInSupabase } from "@/lib/bookings-supabase";
import { getPractitionerDirectory } from "@/lib/scheduling";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage() {
  await requireAdminPage("bookings");
  // Read from the same provider as GET /api/bookings, which this page's edits go through.
  const [rows, directory] = await Promise.all([
    isSupabaseCutoverActive()
      ? listBookingsInSupabase()
      : db.collection("bookings").orderBy("scheduledAt", "desc").get().then((snap) => snap.docs.map((doc) => bookingFromDoc(doc))),
    getPractitionerDirectory(false),
  ]);
  const practitioners = directory.map(({ id, name, active, isAiPowered }) => ({ id, name, active, isAiPowered }));

  return (
    <AdminShell active="Bookings">
      <div className="admin-content">
        <div className="admin-heading">
          <div><p>Jyotish / Operations</p><h1>Bookings</h1><span>Manage consultations from reservation through completion.</span></div>
          <div><small>Calendar status</small><strong>Live <i /></strong></div>
        </div>
        <AdminBookings initialBookings={rows} practitioners={practitioners} />
      </div>
    </AdminShell>
  );
}
