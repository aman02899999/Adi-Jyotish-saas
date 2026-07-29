import { PractitionerShell } from "@/components/practitioner-shell";
import { PractitionerEarnings } from "@/components/practitioner-earnings";
import { requirePractitionerPage } from "@/lib/practitioner-auth";
import { getPractitionerPayouts, getPractitionerStats } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export default async function PractitionerEarningsPage() {
  const practitioner = await requirePractitionerPage();
  const [stats, payouts] = await Promise.all([
    getPractitionerStats(practitioner.id),
    getPractitionerPayouts(practitioner.id),
  ]);

  return (
    <PractitionerShell practitioner={practitioner} active="Earnings">
      <div className="consultation-heading billing-heading"><div><p>Your workspace</p><h1>Earnings</h1><span>Track what you&apos;ve earned and request payouts.</span></div></div>
      <PractitionerEarnings initialStats={stats} initialPayouts={payouts.map((payout) => ({ ...payout, requestedAt: payout.requestedAt.toString() }))} />
    </PractitionerShell>
  );
}
