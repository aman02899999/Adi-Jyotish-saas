import { PractitionerBookings } from "@/components/practitioner-bookings";
import { PractitionerShell } from "@/components/practitioner-shell";
import { requirePractitionerPage } from "@/lib/practitioner-auth";
import { getPractitionerBookings } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export default async function PractitionerBookingsPage() {
  const practitioner = await requirePractitionerPage();
  const bookings = await getPractitionerBookings(practitioner.id);

  return (
    <PractitionerShell practitioner={practitioner} active="Bookings">
      <div className="consultation-heading billing-heading"><div><p>Your workspace</p><h1>Bookings</h1><span>Every client session, past and upcoming. Expand a session for an AI-generated Kundli summary.</span></div></div>
      <PractitionerBookings initialBookings={bookings} />
    </PractitionerShell>
  );
}
