import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Gift, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GiftClaimButton } from "@/components/gift-claim-button";
import { getGiftCard } from "@/lib/gift-cards";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const gift = await getGiftCard(code);
  if (!gift) return {};
  return { title: "You have a gift waiting", description: "Claim your Adi Jyotish Guru gift credit." };
}

export default async function GiftRedeemPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [gift, member] = await Promise.all([getGiftCard(code), getCurrentMember()]);
  if (!gift) notFound();

  return (
    <main className="marketing-page">
      <SiteHeader />
      <section className="hero-cosmic">
        <div className="cosmic-card-hero shell">
          <p className="eyebrow"><span /> A gift from {gift.buyerName}</p>
          {gift.status === "claimed" ? (
            <>
              <h1>This gift has<br /><em>already been claimed.</em></h1>
              <p className="cosmic-card-blurb">If this was meant for you and something looks wrong, reach out to support.</p>
            </>
          ) : (
            <>
              <h1>You&rsquo;ve received<br /><em>₹{gift.amount} of wallet credit.</em></h1>
              {gift.message && <p className="cosmic-card-blurb">&ldquo;{gift.message}&rdquo;</p>}
              <div className="cosmic-card-signs">
                <div><Gift size={19} /><span>Amount</span><strong>₹{gift.amount}</strong></div>
                <div><CheckCircle2 size={19} /><span>Redeemable</span><strong>Once, any time</strong></div>
              </div>
              <GiftClaimButton code={gift.code} signedIn={Boolean(member)} />
            </>
          )}
        </div>
      </section>

      <section className="cosmic-card-cta shell">
        <Sparkles size={22} />
        <h2>Wondering what to spend it on?</h2>
        <p>Chat live with an astrologer, get an AI reading, or shop certified gemstones.</p>
      </section>
      <SiteFooter />
    </main>
  );
}
