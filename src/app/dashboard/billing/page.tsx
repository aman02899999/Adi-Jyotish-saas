import { MemberAppShell } from "@/components/member-app-shell";
import { MemberBilling } from "@/components/member-billing";
import { MembershipCard } from "@/components/membership-card";
import { getMemberBilling } from "@/lib/billing";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { getMemberSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export default async function MemberBillingPage({searchParams}:{searchParams:Promise<{checkout?:string}>}){
  const [member, query] = await Promise.all([getCurrentMember(), searchParams]);
  if (!member) return null;
  const [rows, subscription] = await Promise.all([getMemberBilling(member.id, member.email), getMemberSubscription(member.id)]);
  return (
    <MemberAppShell member={member} active="Billing">
      <MembershipCard subscription={subscription ? {
        planName: subscription.plan.name,
        status: subscription.status,
        billingInterval: subscription.billingInterval as "monthly" | "yearly",
        currentPeriodEnd: subscription.currentPeriodEnd ? subscription.currentPeriodEnd.toISOString() : null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        sessionDiscountPercent: subscription.plan.sessionDiscountPercent,
      } : null} />
      <MemberBilling invoices={rows} onlinePaymentsAvailable={isRazorpayConfigured()} checkoutState={query.checkout} member={{ name: member.name, email: member.email }} />
    </MemberAppShell>
  );
}
