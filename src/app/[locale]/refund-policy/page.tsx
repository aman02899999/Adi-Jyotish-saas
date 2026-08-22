import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getStudioSettings } from "@/lib/studio-settings";

// Same content for every visitor (admin settings, no auth check) — see about/page.tsx.
export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: "How cancellations and refunds work for consultations, wallet recharges, memberships, and gemstone orders on Jyotish.",
  openGraph: { title: "Jyotish Refund & Cancellation Policy", description: "How cancellations and refunds work.", url: "/refund-policy" },
};

export default async function RefundPolicyPage() {
  const settings = await getStudioSettings();
  return (
    <main className="marketing-page legal-page">
      <SiteHeader />
      <section className="legal-hero shell">
        <p className="eyebrow"><span /> Legal</p>
        <h1>Refund &amp; Cancellation Policy</h1>
        <p>Different purchases on Jyotish work differently — scheduled consultations, wallet minutes, memberships, and physical gemstones each have their own rule below.</p>
        <span className="legal-updated">Last updated 30 July 2026</span>
      </section>

      <section className="shell legal-body">
        <h2>1. Scheduled consultation bookings</h2>
        <p>You can reschedule or cancel a booked consultation free of charge from your dashboard up to <strong>{settings.cancellationHours} hours</strong> before the scheduled time. Cancellations made within {settings.cancellationHours} hours of the appointment are not eligible for self-service cancellation — please contact us at <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a> and we will review it, including cases where the practitioner was unavailable or the session could not proceed for reasons on our side.</p>
        <p>If a practitioner cancels or does not join a confirmed session, you receive a full refund to your original payment method or wallet, your choice.</p>

        <h2>2. Wallet recharges &amp; instant chat/call minutes</h2>
        <p>Wallet balance is deducted only for the minutes you actually use in a chat or call session. Unused wallet balance is refundable to your original payment method on request, within a reasonable processing time, provided it has not already been spent. Once minutes have been consumed in a session, that portion is not refundable except in the case of a verified technical failure on our side.</p>

        <h2>3. Memberships</h2>
        <p>You can cancel a membership at any time from your dashboard — this stops future renewals immediately. We do not provide partial or prorated refunds for the remainder of a billing cycle already paid for, but you keep full membership benefits until the end of that paid period. If you were charged in error (for example, a duplicate renewal), contact <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a> for a review.</p>

        <h2>4. Live readings &amp; digital reports</h2>
        <p>Live-generated readings, Kundli reports, Panchang, numerology, and matching results are delivered instantly and are non-refundable once generated, since the content has already been produced and delivered. If a reading fails to generate due to a technical error on our side, it is automatically retried or refunded — you will not be charged for a failed generation.</p>

        <h2>5. Gemstone orders</h2>
        <p>Unused, undamaged gemstones and accessories can be returned within 7 days of delivery for a refund to your original payment method, minus any return shipping cost. To start a return, contact <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a> with your order number. Because natural gemstones vary slightly from listing photos in tone and inclusion, minor natural variation is not grounds for return — visible damage or an incorrect item is. Items that have been custom-energized or ritually prepared at your request cannot be returned once that process has begun.</p>

        <h2>6. How refunds are processed</h2>
        <p>Approved refunds are issued to your original Razorpay payment method (card, UPI, or netbanking) and typically appear within 5&ndash;7 business days, depending on your bank. Wallet refunds, where applicable, are credited immediately.</p>

        <h2>7. How to request a refund or cancellation</h2>
        <p>Most cancellations can be done directly from your dashboard. For anything else, email <a href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a> with your order or booking reference and what happened — we aim to respond within {settings.replySlaHours} hours.</p>

        <div className="legal-note">This document is a general template appropriate for an early-stage consultation and e-commerce platform. It has not been reviewed by a lawyer — please have it checked against your specific business registration and consumer-protection obligations before relying on it commercially.</div>
      </section>
      <SiteFooter />
    </main>
  );
}
