import { AdminPractitioners } from "@/components/admin-practitioners";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getPractitionerDirectory } from "@/lib/scheduling";
import { computeVerificationFlags } from "@/lib/practitioner-portal";

export const dynamic = "force-dynamic";

export default async function AdminPractitionersPage() {
  await requireAdminPage("practitioners");
  const [directory, verificationFlags] = await Promise.all([getPractitionerDirectory(false, true), computeVerificationFlags()]);
  const practitioners = directory.map(({ rules, timeOff, ...person }) => ({ ...person, verificationFlag: verificationFlags.get(person.id) ?? null }));
  return (
    <AdminShell active="Practitioners">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Roster</p><h1>Practitioners</h1><span>Onboard new practitioners and manage every profile on the marketplace.</span></div><div><small>Last synced</small><strong>Just now <i /></strong></div></div>
        <AdminPractitioners initialPractitioners={practitioners} />
      </div>
    </AdminShell>
  );
}
