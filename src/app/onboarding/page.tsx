import Image from "next/image";
import { redirect } from "next/navigation";
import { Check, Orbit, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { MemberOnboardingForm } from "@/components/member-onboarding-form";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/account?mode=register");
  const editing = member.onboardingComplete;

  return (
    <main className="onboarding-page">
      <header><BrandMark /><span>Step 2 of 2 · Birth profile</span></header>
      <div className="onboarding-layout">
        <section className="onboarding-copy">
          <p className="eyebrow"><span /> Welcome, {member.name.split(" ")[0]}</p>
          <h1>Let’s find the sky<br /><em>you arrived beneath.</em></h1>
          <p>These three details anchor every Vedic calculation—from your moon sign and houses to dashas, transits, and auspicious timing.</p>
          <MemberOnboardingForm member={member} />
        </section>
        <aside className="onboarding-art">
          <Image src="/images/orbital-system.png" fill priority sizes="(max-width: 800px) 90vw, 44vw" alt="Planetary birth chart system" />
          <div className="onboarding-art__label onboarding-art__label--one"><Orbit size={16} /><span><small>Sidereal zodiac</small><strong>Precise planetary positions</strong></span></div>
          <div className="onboarding-art__label onboarding-art__label--two"><Sparkles size={16} /><span><small>Personal guidance</small><strong>Calculated only for you</strong></span></div>
          <div className="onboarding-checks"><span><Check size={13} /> Private profile</span><span><Check size={13} /> Editable later</span></div>
        </aside>
      </div>
    </main>
  );
}
