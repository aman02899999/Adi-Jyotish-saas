import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight } from "lucide-react";
import { MemberAppShell } from "@/components/member-app-shell";
import { KundliDetail } from "@/components/kundli-detail";
import { buildDetailedKundli, buildKundliChart, KundliEngineError } from "@/lib/kundli-engine";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your full Kundli",
  description: "Your complete Vedic birth chart — Panchang, divisional charts, Vimshottari dasha, yogas, Ashtakavarga, and doshas, computed from your exact birth moment.",
};

export default async function MemberKundliPage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const hasBirthProfile = Boolean(member.birthDate && member.birthTime && member.birthPlace);
  let detailed = null;
  let error: string | null = null;

  if (hasBirthProfile) {
    try {
      const chart = buildKundliChart({
        name: member.name,
        birthDate: member.birthDate!,
        birthTime: member.birthTime!,
        birthPlace: member.birthPlace!,
      });
      detailed = buildDetailedKundli(chart);
    } catch (caught) {
      // A birth place that no longer resolves shouldn't 500 the whole page — the member needs to
      // be told which field to fix, which is exactly what KundliEngineError's message carries.
      if (caught instanceof KundliEngineError) error = caught.message;
      else throw caught;
    }
  }

  return (
    <MemberAppShell member={member} active="Kundli">
      {detailed ? (
        <KundliDetail data={detailed} />
      ) : (
        <section className="glass-card kundli-empty-page">
          <h1>Your full Kundli</h1>
          <p>{error ?? "Add your exact birth date, time, and place to generate your complete Vedic birth chart — planetary positions, Panchang, all sixteen divisional charts, your Vimshottari dasha timeline, yogas, and Ashtakavarga, all computed from real astronomical data."}</p>
          <Link href="/onboarding" className="button">Complete birth profile <ArrowUpRight size={15} /></Link>
        </section>
      )}
    </MemberAppShell>
  );
}
