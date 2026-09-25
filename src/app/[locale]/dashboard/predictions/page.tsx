import { MemberAppShell } from "@/components/member-app-shell";
import { MemberPredictions } from "@/components/member-predictions";
import { listMemberBookings } from "@/lib/member-bookings";
import { getCurrentMember } from "@/lib/member-auth";
import { listMemberPredictions } from "@/lib/predictions";

export const dynamic = "force-dynamic";

export default async function MemberPredictionsPage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const [predictions, bookings] = await Promise.all([
    listMemberPredictions(member.id),
    // The same read as /dashboard/consultations; filtering to completed, practitioner-led bookings
    // happens here rather than via a new composite index.
    listMemberBookings(member.email),
  ]);
  const eligibleBookings = bookings
    .filter((booking) => booking.status === "completed" && booking.practitionerId)
    .map((booking) => ({ id: booking.id, serviceTitle: booking.serviceTitle, practitionerName: booking.practitionerName ?? "Your practitioner", scheduledAt: booking.scheduledAt.toISOString() }));

  return (
    <MemberAppShell member={member} active="Predictions">
      <MemberPredictions initialPredictions={predictions} eligibleBookings={eligibleBookings} />
    </MemberAppShell>
  );
}
