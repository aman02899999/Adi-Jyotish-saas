import { db } from "@/lib/firestore";
import { PractitionerShell } from "@/components/practitioner-shell";
import { PractitionerProfileForm } from "@/components/practitioner-profile-form";
import { PractitionerPayoutDetailsForm } from "@/components/practitioner-payout-details-form";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { requirePractitionerPage } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";

export default async function PractitionerProfilePage() {
  const practitioner = await requirePractitionerPage();
  const snap = await db.collection("practitioners").doc(practitioner.id).get();
  const data = snap.data() as {
    bio: string; specialties: string; languages: string; consultationModes: string; photoUrl: string | null; videoUrl: string | null;
    bankAccountName: string | null; bankIfsc: string | null; bankAccountNumberEnc: string | null; upiIdEnc: string | null;
    totpEnabled?: boolean;
  };
  const row = {
    bio: data.bio, specialties: data.specialties, languages: data.languages, consultationModes: data.consultationModes, photoUrl: data.photoUrl, videoUrl: data.videoUrl ?? null,
    bankAccountName: data.bankAccountName, bankIfsc: data.bankIfsc, hasBankAccount: data.bankAccountNumberEnc, hasUpi: data.upiIdEnc,
  };

  return (
    <PractitionerShell practitioner={practitioner} active="Profile">
      <div className="consultation-heading billing-heading"><div><p>Your workspace</p><h1>Profile</h1><span>What clients see on your public listing.</span></div></div>
      <PractitionerProfileForm initialProfile={row} />
      <div className="consultation-heading billing-heading"><div><p>Get paid</p><h1>Payout details</h1><span>Where your earnings are sent when you request a payout.</span></div></div>
      <PractitionerPayoutDetailsForm initialDetails={{ bankAccountName: row.bankAccountName, bankIfsc: row.bankIfsc, hasBankAccount: Boolean(row.hasBankAccount), hasUpi: Boolean(row.hasUpi) }} />
      <div className="consultation-heading billing-heading"><div><p>Stay protected</p><h1>Security</h1><span>Add a second sign-in step to your account.</span></div></div>
      <TwoFactorSettings apiPrefix="/api/practitioner/2fa" initialEnabled={data.totpEnabled === true} description="Two-factor authentication is protecting your sign-in." />
    </PractitionerShell>
  );
}
