import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { PractitionerShell } from "@/components/practitioner-shell";
import { PractitionerProfileForm } from "@/components/practitioner-profile-form";
import { PractitionerPayoutDetailsForm } from "@/components/practitioner-payout-details-form";
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
    bankAccountName: practitioners.bankAccountName,
    bankIfsc: practitioners.bankIfsc,
    hasBankAccount: practitioners.bankAccountNumberEnc,
    hasUpi: practitioners.upiIdEnc,
  }).from(practitioners).where(eq(practitioners.id, practitioner.id)).limit(1);

  return (
    <PractitionerShell practitioner={practitioner} active="Profile">
      <div className="consultation-heading billing-heading"><div><p>Your workspace</p><h1>Profile</h1><span>What clients see on your public listing.</span></div></div>
      <PractitionerProfileForm initialProfile={row} />
      <div className="consultation-heading billing-heading"><div><p>Get paid</p><h1>Payout details</h1><span>Where your earnings are sent when you request a payout.</span></div></div>
      <PractitionerPayoutDetailsForm initialDetails={{ bankAccountName: row.bankAccountName, bankIfsc: row.bankIfsc, hasBankAccount: Boolean(row.hasBankAccount), hasUpi: Boolean(row.hasUpi) }} />
    </PractitionerShell>
  );
}
