import type { Metadata } from "next";
import { ArrowUpRight, Gift, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GiftPurchaseForm } from "@/components/gift-purchase-form";
import { getCurrentMember } from "@/lib/member-auth";
import { isRazorpayConfigured } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gift a Reading",
  description: "Send someone wallet credit they can spend on any reading, live chat, or gemstone on Adi Jyotish Guru — a real astrology gift, not a generic voucher.",
  openGraph: { title: "Gift a Reading", description: "Send someone a real astrology gift.", url: "/gift" },
};

export default async function GiftPage() {
  const member = await getCurrentMember();

  return (
    <main className="marketing-page">
      <SiteHeader />

      <section className="ask-hero shell">
        <div className="ask-hero__copy reveal">
          <p className="eyebrow"><span /> Gift a reading</p>
          <h1>Give the gift<br /><em>of clarity.</em></h1>
          <p className="ask-hero__lead">Send someone wallet credit they can put toward any reading, live chat, or gemstone here — no guessing what they&rsquo;d actually want.</p>
          <ul className="ask-hero__points">
            <li><Gift size={15} /> ₹500 to ₹5,000, their choice how to spend it</li>
            <li><Sparkles size={15} /> A shareable link, ready in seconds</li>
            <li><ShieldCheck size={15} /> Never expires, redeemable once</li>
          </ul>
        </div>
        <div className="ask-hero__persona reveal reveal--delay">
          {member ? (
            <GiftPurchaseForm onlinePaymentsAvailable={isRazorpayConfigured()} member={{ name: member.name, email: member.email }} />
          ) : (
            <div className="ask-persona-card">
              <div className="ask-persona-avatar"><Gift size={26} /></div>
              <strong>Sign in to send a gift</strong>
              <span>You&rsquo;ll need an account to purchase — the recipient doesn&rsquo;t.</span>
              <Link href="/account?mode=register" className="button button--small">Sign in <ArrowUpRight size={14} /></Link>
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
