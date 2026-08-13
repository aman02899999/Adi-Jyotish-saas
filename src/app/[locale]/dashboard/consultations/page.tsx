import { db } from "@/lib/firestore";
import { MemberAppShell } from "@/components/member-app-shell";
import { MemberConsultations } from "@/components/member-consultations";
import { getCurrentMember } from "@/lib/member-auth";
import { getStudioSettings } from "@/lib/studio-settings";
import { bookingFromDoc } from "@/app/api/bookings/route";

export const dynamic = "force-dynamic";

export default async function MemberConsultationsPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  const [snap, settings] = await Promise.all([
    db.collection("bookings").where("clientEmail", "==", member.email).orderBy("scheduledAt", "desc").get(),
    getStudioSettings(),
  ]);
  const rows = snap.docs.map(bookingFromDoc);

  return <MemberAppShell member={member} active="Consultations"><MemberConsultations initialBookings={rows} cancellationHours={settings.cancellationHours} /></MemberAppShell>;
}
