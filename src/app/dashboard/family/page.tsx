import { MemberAppShell } from "@/components/member-app-shell";
import { MemberFamilyCharts } from "@/components/member-family-charts";
import { buildFamilyChart, chartSnapshot, listFamilyMembers } from "@/lib/family-members";
import { KundliEngineError } from "@/lib/kundli-engine";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export default async function MemberFamilyPage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const familyMembers = await listFamilyMembers(member.id);
  const withCharts = familyMembers.map((familyMember) => {
    try {
      return { ...familyMember, chart: chartSnapshot(buildFamilyChart(familyMember)) };
    } catch (error) {
      if (error instanceof KundliEngineError) return { ...familyMember, chart: null };
      throw error;
    }
  });

  return (
    <MemberAppShell member={member} active="Family">
      <MemberFamilyCharts initialFamilyMembers={withCharts} />
    </MemberAppShell>
  );
}
