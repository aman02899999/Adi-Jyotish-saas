import { getCurrentMember } from "@/lib/member-auth";
import { upsertCosmicProfileCard } from "@/lib/cosmic-profile-card";
import { KundliEngineError } from "@/lib/kundli-engine";

export const dynamic = "force-dynamic";

export async function POST() {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!member.birthDate || !member.birthTime || !member.birthPlace) {
    return Response.json({ error: "Complete your birth profile first to generate your cosmic profile card." }, { status: 400 });
  }

  try {
    await upsertCosmicProfileCard({
      memberId: member.id, name: member.name,
      birthDate: member.birthDate, birthTime: member.birthTime, birthPlace: member.birthPlace,
    });
    return Response.json({ id: member.id }, { status: 201 });
  } catch (error) {
    if (error instanceof KundliEngineError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Cosmic profile card generation failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Could not create your cosmic profile card. Please try again shortly." }, { status: 502 });
  }
}
