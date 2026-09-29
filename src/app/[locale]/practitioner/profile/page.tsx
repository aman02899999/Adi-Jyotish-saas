import { PractitionerShell } from "@/components/practitioner-shell";
import { PractitionerProfileForm } from "@/components/practitioner-profile-form";
import { PractitionerPayoutDetailsForm } from "@/components/practitioner-payout-details-form";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { requirePractitionerPage } from "@/lib/practitioner-auth";
import { getPractitionerPortalProfile } from "@/lib/practitioner-portal";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PractitionerProfilePage() {
  const practitioner = await requirePractitionerPage();
  const row = await getPractitionerPortalProfile(practitioner.id);
  if (!row) notFound();

  return (
    <PractitionerShell practitioner={practitioner} active="Profile">
      <div className="consultation-heading billing-heading"><div><p>Your workspace</p><h1>Profile</h1><span>What clients see on your public listing.</span></div></div>
      <PractitionerProfileForm initialProfile={row} />
      <div className="consultation-heading billing-heading"><div><p>Get paid</p><h1>Payout details</h1><span>Where your earnings are sent when you request a payout.</span></div></div>
      <PractitionerPayoutDetailsForm initialDetails={{ bankAccountName: row.bankAccountName, bankIfsc: row.bankIfsc, hasBankAccount: row.hasBankAccount, hasUpi: row.hasUpi }} />
      <div className="consultation-heading billing-heading"><div><p>Stay protected</p><h1>Security</h1><span>Add a second sign-in step to your account.</span></div></div>
      <TwoFactorSettings apiPrefix="/api/practitioner/2fa" initialEnabled={row.totpEnabled} description="Two-factor authentication is protecting your sign-in." />
    </PractitionerShell>
  );
}
