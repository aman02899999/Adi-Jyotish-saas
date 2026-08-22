import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { getVariant, recordExperimentConversion } from "@/lib/experiments";
import { buildKundliChart, KundliEngineError } from "@/lib/kundli-engine";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const body = await request.json() as { phone?: string; birthDate?: string; birthTime?: string; birthPlace?: string };
  const phone = body.phone?.trim().slice(0, 40) ?? "";
  const birthDate = body.birthDate?.trim().slice(0, 10) ?? "";
  const birthTime = body.birthTime?.trim().slice(0, 8) ?? "";
  const birthPlace = body.birthPlace?.trim().slice(0, 180) ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !/^\d{2}:\d{2}$/.test(birthTime) || birthPlace.length < 2) {
    return Response.json({ error: "Complete your exact birth date, time, and place." }, { status: 400 });
  }

  // The regex above only checks shape. Date.UTC (used downstream to resolve the birth moment)
  // silently rolls an impossible date like Feb 30 into Mar 2 instead of rejecting it, so this
  // round-trips the parsed parts through Date.UTC and checks they land back on the same date —
  // catching what the regex and the downstream engine would otherwise both miss.
  const [y, m, d] = birthDate.split("-").map(Number);
  const roundTrip = new Date(Date.UTC(y, m - 1, d));
  if (roundTrip.getUTCFullYear() !== y || roundTrip.getUTCMonth() !== m - 1 || roundTrip.getUTCDate() !== d) {
    return Response.json({ error: "That birth date doesn't exist. Double-check the day and month." }, { status: 400 });
  }

  // A real moment and location are required too — without this, a member could save an
  // unrecognized place and still get onboardingComplete: true with data that can never produce a
  // real chart.
  try {
    buildKundliChart({ name: member.name, birthDate, birthTime, birthPlace });
  } catch (error) {
    if (error instanceof KundliEngineError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }

  await db.collection("members").doc(member.id).update({
    phone: phone || null,
    birthDate,
    birthTime,
    birthPlace,
    onboardingComplete: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Only the transition into onboardingComplete counts as a conversion — a later edit to an
  // already-complete profile isn't a new "completed onboarding" event.
  if (!member.onboardingComplete) {
    const ctaVariant = getVariant("dashboard-onboarding-cta", member.id);
    await recordExperimentConversion("dashboard-onboarding-cta", ctaVariant).catch((error) => console.error("Experiment conversion tracking failed", error));
  }

  return Response.json({ ok: true, member: { id: member.id } });
}
