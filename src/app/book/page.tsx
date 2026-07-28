import { BookingFlow } from "@/components/booking-flow";
import { SiteHeader } from "@/components/site-header";
import { getPublishedServices } from "@/lib/services";
import { getCurrentMember } from "@/lib/member-auth";
import { getStudioSettings } from "@/lib/studio-settings";

export const dynamic = "force-dynamic";

export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string; practitioner?: string }> }) {
  const [services, query, member, settings] = await Promise.all([getPublishedServices(), searchParams, getCurrentMember(), getStudioSettings()]);
  const initialServiceId = query.service ? Number(query.service) : undefined;
  const initialPractitionerId = query.practitioner ? Number(query.practitioner) : undefined;

  return (
    <main className="booking-page">
      <SiteHeader />
      <div className="booking-page__intro">
        <p><span /> Personal Vedic consultation <span /></p>
        <small>Three thoughtful steps · about two minutes</small>
      </div>
      <div className="booking-shell">
        <BookingFlow services={services} initialServiceId={initialServiceId} initialPractitionerId={initialPractitionerId} member={member} cancellationHours={settings.cancellationHours} />
      </div>
    </main>
  );
}
