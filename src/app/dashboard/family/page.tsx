import { MemberAppShell } from "@/components/member-app-shell";
import { MemberFamilyCharts } from "@/components/member-family-charts";
import { listFamilyMembersWithCharts } from "@/lib/family-members";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export default async function MemberFamilyPage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const familyMembers = await listFamilyMembersWithCharts(member.id);

  return (
    <MemberAppShell member={member} active="Family">
      <MemberFamilyCharts initialFamilyMembers={familyMembers} />
    </MemberAppShell>
  );
}
