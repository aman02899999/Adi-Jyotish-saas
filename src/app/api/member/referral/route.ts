import { getCurrentMember } from "@/lib/member-auth";
import { getReferralStats, MIN_RECHARGE_FOR_REWARD, REFERRAL_REFEREE_REWARD, REFERRAL_REFERRER_REWARD } from "@/lib/referrals";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const stats = await getReferralStats(member.id);
  return Response.json({ ...stats, referrerReward: REFERRAL_REFERRER_REWARD, refereeReward: REFERRAL_REFEREE_REWARD, minRecharge: MIN_RECHARGE_FOR_REWARD });
}
