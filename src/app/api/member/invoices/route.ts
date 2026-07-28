import { getMemberBilling } from "@/lib/billing";
import { getCurrentMember } from "@/lib/member-auth";
import { isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });
  return Response.json({ invoices: await getMemberBilling(member.id, member.email), onlinePaymentsAvailable: isStripeConfigured() });
}
