import { bookingFromDoc } from "@/app/api/bookings/route";
import { MemberAppShell } from "@/components/member-app-shell";
import { MemberPredictions } from "@/components/member-predictions";
import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { listMemberPredictions } from "@/lib/predictions";

export const dynamic = "force-dynamic";

export default async function MemberPredictionsPage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const [predictions, bookingsSnap] = await Promise.all([
    listMemberPredictions(member.id),
    // Reuses the same indexed query as /dashboard/consultations — filtering to completed,
    // practitioner-led bookings happens here rather than via a new composite index.
    db.collection("bookings").where("clientEmail", "==", member.email).orderBy("scheduledAt", "desc").get(),
  ]);
  const eligibleBookings = bookingsSnap.docs
    .map(bookingFromDoc)
    .filter((booking) => booking.status === "completed" && booking.practitionerId)
    .map((booking) => ({ id: booking.id, serviceTitle: booking.serviceTitle, practitionerName: booking.practitionerName ?? "Your practitioner", scheduledAt: booking.scheduledAt.toISOString() }));

  return (
    <MemberAppShell member={member} active="Predictions">
      <MemberPredictions initialPredictions={predictions} eligibleBookings={eligibleBookings} />
    </MemberAppShell>
  );
}
