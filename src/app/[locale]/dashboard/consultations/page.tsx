import { MemberAppShell } from "@/components/member-app-shell";
import { MemberConsultations } from "@/components/member-consultations";
import { getCurrentMember } from "@/lib/member-auth";
import { getStudioSettings } from "@/lib/studio-settings";
import { listMemberBookings } from "@/lib/member-bookings";

export const dynamic = "force-dynamic";

export default async function MemberConsultationsPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  const [rows, settings] = await Promise.all([listMemberBookings(member.email), getStudioSettings()]);

  return <MemberAppShell member={member} active="Consultations"><MemberConsultations initialBookings={rows} cancellationHours={settings.cancellationHours} /></MemberAppShell>;
}
