import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
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

  const [updated] = await db.update(memberUsers).set({
    phone: phone || null,
    birthDate,
    birthTime,
    birthPlace,
    onboardingComplete: true,
    updatedAt: new Date(),
  }).where(eq(memberUsers.id, member.id)).returning({ id: memberUsers.id });

  return Response.json({ ok: true, member: updated });
}
