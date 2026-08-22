import type { Metadata } from "next";
import { Mail, MessageCircleQuestion, ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getStudioSettings } from "@/lib/studio-settings";

// Same content for every visitor (admin settings, no auth check) — see about/page.tsx.
export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Contact Us",
  description: "How to reach Adi Jyotish Guru support, report a security issue, or get help with a booking, order, or account.",
  openGraph: { title: "Contact Adi Jyotish Guru", description: "How to reach our support team.", url: "/contact" },
};

export default async function ContactPage() {
  const settings = await getStudioSettings();

  return (
    <main className="marketing-page legal-page">
      <SiteHeader />
      <section className="legal-hero shell">
        <p className="eyebrow"><span /> Contact</p>
        <h1>Get in touch</h1>
        <p>Questions about a booking, order, payment, or your account — reach our support team directly. We aim to reply within {settings.replySlaHours} hours.</p>
      </section>

      <section className="shell legal-body">
        <div className="contact-cards">
          <div className="contact-card">
            <Mail size={20} />
            <h3>General support</h3>
            <p>Bookings, orders, payments, refunds, or account access.</p>
            <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a>
          </div>
          <div className="contact-card">
            <MessageCircleQuestion size={20} />
            <h3>Already a member?</h3>
            <p>Sign in and use the in-dashboard support chat for the fastest response — it&rsquo;s tied to your account and order history.</p>
            <Link href="/dashboard">Go to dashboard</Link>
          </div>
          <div className="contact-card">
            <ShieldAlert size={20} />
            <h3>Security issue</h3>
            <p>Found a vulnerability? We take reports seriously and ask that you report privately rather than publicly, per our <a href="/.well-known/security.txt">security.txt</a>.</p>
            <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a>
          </div>
        </div>

        <h2>Before you write in</h2>
        <p>For faster answers, check the <Link href="/pricing">pricing page</Link> for membership questions, the <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link> for order and booking cancellations, or the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link> for anything about how the Service works.</p>
        <p>We operate on {settings.timezone.replace("_", " ")} time. Response times may run longer around major Indian festivals — we&rsquo;ll always get back to you.</p>
      </section>
      <SiteFooter />
    </main>
  );
}
