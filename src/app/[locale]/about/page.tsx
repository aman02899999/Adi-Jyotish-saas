import type { Metadata } from "next";
import { ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getStudioSettings } from "@/lib/studio-settings";
import { getHomepageStats } from "@/lib/homepage";

// Tried ISR here (only reads admin settings, same for every visitor) but getStudioSettings()
// reads Firestore, and FIREBASE_SERVICE_ACCOUNT_KEY is RUNTIME-only in apphosting.yaml — build-time
// prerendering has no credentials to read it with, which breaks both CI's build (no Firebase env
// at all) and the real deploy build. Back to force-dynamic until build-time credentials exist.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "About Us",
  description: "Who runs Adi Jyotish Guru, how our practitioners are reviewed before going live, and how we protect your birth details and payments.",
  openGraph: { title: "About Adi Jyotish Guru", description: "Who we are and how we protect your data.", url: "/about" },
};

export default async function AboutPage() {
  const [settings, stats] = await Promise.all([getStudioSettings(), getHomepageStats()]);

  return (
    <main className="marketing-page legal-page">
      <SiteHeader />
      <section className="legal-hero shell">
        <p className="eyebrow"><span /> About us</p>
        <h1>Vedic astrology, calculated properly and delivered by real people</h1>
        <p>{settings.studioName} pairs a genuine sidereal (Lahiri ayanamsha) astrology engine with a marketplace of practitioners our team reviews before they go live — not a chatbot pretending to be one.</p>
      </section>

      <section className="shell legal-body">
        <h2>What we actually do</h2>
        <p>Every chart on this site — Kundli, Panchang, Kundli matching, numerology, horoscopes, Varshphal — is computed from real astronomical positions, not templated copy. Where we do use AI (palm, tarot, face, Vastu, and Lal Kitab readings, and the free-form Ask a Question tool), we say so plainly on that page; we don&rsquo;t dress up generated text as a live human when it isn&rsquo;t.</p>

        <h2>How practitioners get listed</h2>
        <p>Practitioner profiles are added to the marketplace by our team, not by open self-signup — we review credentials and experience before a profile is published, and every review left on a completed session is moderated before it appears publicly. If you ever have a concern about a specific consultation, reach us at <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a> and we&rsquo;ll help mediate.</p>

        <h2>How we handle your details</h2>
        <ul>
          <li><strong>Birth data</strong> — used only to compute the chart, match, or reading you asked for. See our <Link href="/privacy">Privacy Policy</Link> for exactly what we collect and who it&rsquo;s shared with.</li>
          <li><strong>Payments</strong> — processed by Razorpay; we never see or store your full card, UPI, or bank number.</li>
          <li><strong>Accounts</strong> — protected with rate-limited login, optional two-factor authentication, and session cookies that are never exposed to page scripts.</li>
        </ul>

        <h2>The numbers, as they stand today</h2>
        <div className="about-stats">
          <div><strong>{stats.consultationsDelivered.toLocaleString("en-IN")}</strong><span>Consultations completed</span></div>
          <div><strong>{stats.practitionerCount}</strong><span>Active practitioners</span></div>
          <div><strong>{stats.averageRating ? stats.averageRating.toFixed(1) : "—"}/5</strong><span>Average practitioner rating</span></div>
        </div>
        <p>These figures come straight from our own booking and review records and update as the platform grows — we don&rsquo;t round them up.</p>

        <h2>Questions?</h2>
        <p>Read the <Link href="/terms">Terms of Service</Link> and <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link> for the specifics, or <Link href="/contact">contact us</Link> directly.</p>
      </section>

      <section className="shell about-trust-strip">
        <div><ShieldCheck size={20} /><span>Encrypted payments via Razorpay</span></div>
        <div><UserCheck size={20} /><span>Team-reviewed practitioner profiles</span></div>
        <div><Sparkles size={20} /><span>Real sidereal chart calculations</span></div>
      </section>
      <SiteFooter />
    </main>
  );
}
