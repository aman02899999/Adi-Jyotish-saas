import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { MemberAppShell } from "@/components/member-app-shell";
import { MemberConsultations } from "@/components/member-consultations";
import { getCurrentMember } from "@/lib/member-auth";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

export default async function MemberConsultationsPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  const [rows, settings] = await Promise.all([
    db.select().from(bookings).where(eq(bookings.clientEmail, member.email)).orderBy(desc(bookings.scheduledAt)),
    getStudioSettings(),
  ]);

  return <MemberAppShell member={member} active="Consultations"><MemberConsultations initialBookings={rows} cancellationHours={settings.cancellationHours} /></MemberAppShell>;
}
