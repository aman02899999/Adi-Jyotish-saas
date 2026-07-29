import type { Metadata } from "next";
import { Suspense } from "react";
import { GemstoneCheckoutForm } from "@/components/gemstone-checkout-form";
import { SiteHeader } from "@/components/site-header";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout · Buy Gemstones" };

export default async function GemstoneCheckoutPage() {
  const member = await getCurrentMember();
  return (
    <main className="marketing-page gem-store">
      <SiteHeader />
      <section className="shop-header shell">
        <p className="eyebrow"><span /> Secure checkout</p>
        <h1>Complete your<br /><em>order.</em></h1>
      </section>
      <Suspense fallback={null}>
        <GemstoneCheckoutForm member={member ? { name: member.name, email: member.email, phone: member.phone } : null} />
      </Suspense>
    </main>
  );
}
