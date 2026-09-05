import { AccountPrivacyControls } from "@/components/account-privacy-controls";
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
        <div><p>Account</p><h1>Security &amp; privacy</h1><span>Protect your sign-in, download your data, or close your account.</span></div>
      </div>
      <TwoFactorSettings apiPrefix="/api/member/2fa" initialEnabled={member.totpEnabled} description="Two-factor authentication is protecting your sign-in." />
      <AccountPrivacyControls twoFactorEnabled={member.totpEnabled} />
    </MemberAppShell>
  );
}
