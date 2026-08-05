import type { Metadata } from "next";
import { MemberAppShell } from "@/components/member-app-shell";
import { MemberReferrals } from "@/components/member-referrals";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invite & earn", robots: { index: false, follow: false } };

export default async function MemberReferralsPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  return (
    <MemberAppShell member={member} active="Referrals">
      <MemberReferrals />
    </MemberAppShell>
  );
}
