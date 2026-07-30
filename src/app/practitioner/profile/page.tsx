import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { PractitionerShell } from "@/components/practitioner-shell";
import { PractitionerProfileForm } from "@/components/practitioner-profile-form";
import { requirePractitionerPage } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";

export default async function PractitionerProfilePage() {
  const practitioner = await requirePractitionerPage();
  const [row] = await db.select({
    bio: practitioners.bio,
    specialties: practitioners.specialties,
    languages: practitioners.languages,
    consultationModes: practitioners.consultationModes,
    photoUrl: practitioners.photoUrl,
  }).from(practitioners).where(eq(practitioners.id, practitioner.id)).limit(1);

  return (
    <PractitionerShell practitioner={practitioner} active="Profile">
      <div className="consultation-heading billing-heading"><div><p>Your workspace</p><h1>Profile</h1><span>What clients see on your public listing.</span></div></div>
      <PractitionerProfileForm initialProfile={row} />
    </PractitionerShell>
  );
}
