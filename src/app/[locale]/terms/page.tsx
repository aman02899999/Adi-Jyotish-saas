import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Jyotish — readings, the practitioner marketplace, memberships, and gemstone orders.",
  openGraph: { title: "Jyotish Terms of Service", description: "The terms that govern your use of Jyotish.", url: "/terms" },
};

export default async function TermsPage() {
  const settings = await getStudioSettings();
  return (
    <main className="marketing-page legal-page">
      <SiteHeader />
      <section className="legal-hero shell">
        <p className="eyebrow"><span /> Legal</p>
        <h1>Terms of Service</h1>
        <p>The agreement between you and Jyotish Studio covering readings, the practitioner marketplace, memberships, gemstone orders, and everything else on this site.</p>
        <span className="legal-updated">Last updated 30 July 2026</span>
      </section>

      <section className="shell legal-body">
        <p>By creating an account, booking a consultation, purchasing a membership, ordering a gemstone, or otherwise using Jyotish (&ldquo;the Service&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), you agree to these Terms. If you do not agree, please do not use the Service.</p>

        <h2>1. Who can use Jyotish</h2>
        <p>You must be at least 18 years old, or the age of majority in your jurisdiction, to create an account or make a purchase. By using the Service you confirm the information you provide — including your name, contact details, and birth details used for readings — is accurate.</p>

        <h2>2. Your account</h2>
        <p>You are responsible for keeping your password and account access secure, and for all activity that happens under your account. Tell us immediately at <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a> if you suspect unauthorized access.</p>

        <h2>3. Astrological guidance, not a guarantee</h2>
        <p>Vedic astrology, numerology, Panchang, Kundli matching, and Live-generated readings offered through Jyotish are provided for guidance, reflection, and entertainment. They are <strong>not a substitute for professional medical, legal, financial, or psychological advice</strong>, and we do not guarantee any specific outcome, event, or result from following a reading, remedy, or recommendation. Decisions about your health, finances, relationships, or legal matters remain entirely your own responsibility.</p>

        <h2>4. The practitioner marketplace</h2>
        <p>Practitioners listed on Jyotish are independent professionals, not employees of Jyotish Studio. We review credentials and experience before a practitioner is published, and we moderate reviews, but we do not control the content of an individual consultation. Any dispute about the quality or content of a specific reading should first be raised with us at <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a> so we can help mediate.</p>

        <h2>5. Payments, wallet, and memberships</h2>
        <p>Payments are processed securely through Razorpay; we never see or store your full card, UPI, or bank details. Wallet balances are used to pay for chat/call consultations by the minute. Memberships renew automatically at the interval you select until you cancel from your dashboard. See our <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link> for how refunds and cancellations work for each type of purchase.</p>

        <h2>6. Gemstone orders</h2>
        <p>Gemstones and related products are sold as described on their product pages. Natural gemstones vary in inclusion, tone, and cut — minor natural variation from photographs is expected and is not a defect. See our <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link> for returns.</p>

        <h2>7. Acceptable use</h2>
        <p>You agree not to misuse the Service — including attempting to circumvent rate limits or security controls, scraping content, impersonating another person, submitting false birth details to abuse free tools, or using the Service for any unlawful purpose.</p>

        <h2>8. Intellectual property</h2>
        <p>The Jyotish name, design, calculation engines, and written content are owned by Jyotish Studio or its licensors. Your own birth details and the readings generated for you are yours to keep and use personally; you may not resell or redistribute Service content commercially without our written permission.</p>

        <h2>9. Limitation of liability</h2>
        <p>To the fullest extent permitted by law, Jyotish Studio is not liable for indirect, incidental, or consequential damages arising from your use of the Service, including decisions made in reliance on a reading. Our total liability for any claim is limited to the amount you paid us for the specific service giving rise to the claim in the preceding twelve months.</p>

        <h2>10. Termination</h2>
        <p>You may close your account at any time from your dashboard. We may suspend or terminate accounts that violate these Terms, engage in fraud, or abuse the platform, with notice where practical.</p>

        <h2>11. Governing law</h2>
        <p>These Terms are governed by the laws of India. Any dispute not resolved informally is subject to the exclusive jurisdiction of the courts where Jyotish Studio is registered.</p>

        <h2>12. Changes to these Terms</h2>
        <p>We may update these Terms as the Service evolves. Material changes will be reflected by the &ldquo;Last updated&rdquo; date above; continued use after a change means you accept the updated Terms.</p>

        <h2>13. Contact</h2>
        <p>Questions about these Terms can be sent to <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a>.</p>

        <div className="legal-note">This document is a general template appropriate for an early-stage consultation and e-commerce platform. It has not been reviewed by a lawyer — please have it checked against your specific business registration and jurisdiction before relying on it commercially.</div>
      </section>
      <SiteFooter />
    </main>
  );
}
