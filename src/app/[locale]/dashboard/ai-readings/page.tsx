import { MemberAppShell } from "@/components/member-app-shell";
import { MemberAiReadings } from "@/components/member-ai-readings";
import { getReadingsForMember } from "@/lib/ai-readings";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export default async function MemberAiReadingsPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  const readings = await getReadingsForMember(member.id);
  return (
    <MemberAppShell member={member} active="AiReadings">
      <MemberAiReadings initialReadings={readings} />
    </MemberAppShell>
  );
}
