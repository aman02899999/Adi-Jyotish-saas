import { MemberAppShell } from "@/components/member-app-shell";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export default async function MemberSecurityPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  return (
    <MemberAppShell member={member} active="Security">
      <div className="consultation-heading billing-heading">
        <div><p>Account</p><h1>Security</h1><span>Keep your account protected with a second sign-in step.</span></div>
      </div>
      <TwoFactorSettings apiPrefix="/api/member/2fa" initialEnabled={member.totpEnabled} description="Two-factor authentication is protecting your sign-in." />
    </MemberAppShell>
  );
}
