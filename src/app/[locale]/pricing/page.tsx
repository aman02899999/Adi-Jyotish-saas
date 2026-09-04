import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { PricingPlans } from "@/components/pricing-plans";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCurrentMember } from "@/lib/member-auth";
import { getPublicPlans } from "@/lib/plans";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { getMemberSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pricing",
  description: "Choose a Jyotish membership for deeper daily guidance and discounted consultations, or explore the practitioner marketplace for free.",
  openGraph: { title: "Jyotish Pricing", description: "Free marketplace access, or a membership for deeper guidance and consultation savings.", url: "/pricing" },
};

export default async function PricingPage() {
  // A stale/invalid session cookie must never 500 a public marketing page. Without a
  // valid cookie getCurrentMember is a cheap null anyway; when Firebase is down it
  // simply renders as anonymous until the dependency recovers.
  const [plans, member] = await Promise.all([getPublicPlans(), getCurrentMember().catch(() => null)]);
  const subscription = member ? await getMemberSubscription(member.id) : null;

  return (
    <main className="marketing-page pricing-page">
      <SiteHeader />
      <section className="pricing-hero shell">
        <p className="eyebrow"><span />Membership</p>
        <h1>Choose the pace of<br /><em>your cosmic practice.</em></h1>
        <p>Every reading is available à la carte. A membership adds daily depth, priority access, and lower consultation prices — and that discount carries over when you book for anyone you&rsquo;ve linked in your <Link href="/dashboard/family">family charts</Link>, not just yourself.</p>
      </section>
      <section className="shell pricing-body">
        <PricingPlans
          plans={plans}
          memberSignedIn={Boolean(member)}
          member={member ? { name: member.name, email: member.email } : null}
          currentSubscription={subscription ? { planId: subscription.planId, status: subscription.status, billingInterval: subscription.billingInterval as "monthly" | "yearly" } : null}
          razorpayConfigured={isRazorpayConfigured()}
        />
      </section>
    <SiteFooter />
    </main>
  );
}
