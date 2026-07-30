import { MemberAppShell } from "@/components/member-app-shell";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export default async function MemberSecurityPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  return (
    <MemberAppShell member={member} active="Security">
      <TwoFactorSettings apiPrefix="/api/member/2fa" initialEnabled={member.totpEnabled} description="Two-factor authentication is protecting your sign-in." />
    </MemberAppShell>
  );
}
