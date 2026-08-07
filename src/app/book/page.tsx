import type { Metadata } from "next";
import { BookingFlow } from "@/components/booking-flow";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getPublishedServices } from "@/lib/services";
import { getCurrentMember } from "@/lib/member-auth";
import { getStudioSettings } from "@/lib/studio-settings";
import { getMemberDiscountPercent } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Book a Reading",
  description: "Choose a Vedic astrology reading, pick your astrologer, and book an available time.",
  openGraph: { title: "Book a Reading · Jyotish", description: "Choose a reading, pick your astrologer, and book an available time.", url: "/book" },
};

export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string; practitioner?: string }> }) {
  const [services, query, member, settings] = await Promise.all([getPublishedServices(), searchParams, getCurrentMember(), getStudioSettings()]);
  const discountPercent = member ? await getMemberDiscountPercent(member.id) : 0;
  const initialServiceId = query.service || undefined;
  const initialPractitionerId = query.practitioner || undefined;

  return (
    <main className="booking-page">
      <SiteHeader />
      <div className="booking-page__intro">
        <p><span /> Personal Vedic consultation <span /></p>
        <small>Three thoughtful steps · about two minutes</small>
      </div>
      <div className="booking-shell">
        <BookingFlow services={services} initialServiceId={initialServiceId} initialPractitionerId={initialPractitionerId} member={member} cancellationHours={settings.cancellationHours} discountPercent={discountPercent} />
      </div>
    <SiteFooter />
    </main>
  );
}
