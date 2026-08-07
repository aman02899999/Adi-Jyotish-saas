import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";

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

  await db.collection("members").doc(member.id).update({
    phone: phone || null,
    birthDate,
    birthTime,
    birthPlace,
    onboardingComplete: true,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ ok: true, member: { id: member.id } });
}
