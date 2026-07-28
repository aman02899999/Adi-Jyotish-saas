import { asc } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission, hashPassword, normalizeEmail, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const plans = ["member", "premium", "concierge"];

type MemberPayload = {
  name?: string; email?: string; password?: string; phone?: string;
  birthDate?: string; birthTime?: string; birthPlace?: string; plan?: string; active?: boolean;
};

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "members_view")) return Response.json({ error: "Member access required." }, { status: 403 });
  const rows = await db.select({
    id: memberUsers.id, name: memberUsers.name, email: memberUsers.email, phone: memberUsers.phone,
    birthDate: memberUsers.birthDate, birthTime: memberUsers.birthTime, birthPlace: memberUsers.birthPlace,
    plan: memberUsers.plan, onboardingComplete: memberUsers.onboardingComplete, active: memberUsers.active,
    lastLoginAt: memberUsers.lastLoginAt, createdAt: memberUsers.createdAt, updatedAt: memberUsers.updatedAt,
  }).from(memberUsers).orderBy(asc(memberUsers.name));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "members_manage")) return Response.json({ error: "Member management permission required." }, { status: 403 });
  const body = await request.json() as MemberPayload;
  const name = body.name?.trim().slice(0, 120) ?? "";
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";
  const plan = plans.includes(body.plan ?? "") ? body.plan! : "member";
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "A name and valid email are required." }, { status: 400 });
  if (password.length < 10 || password.length > 128) return Response.json({ error: "Temporary password must be 10–128 characters." }, { status: 400 });

  const birthDate = body.birthDate?.trim().slice(0, 10) || null;
  const birthTime = body.birthTime?.trim().slice(0, 8) || null;
  const birthPlace = body.birthPlace?.trim().slice(0, 180) || null;
  const onboardingComplete = Boolean(birthDate && birthTime && birthPlace);
  try {
    const [created] = await db.insert(memberUsers).values({
      name, email, passwordHash: hashPassword(password), phone: body.phone?.trim().slice(0, 40) || null,
      birthDate, birthTime, birthPlace, plan, active: body.active ?? true, onboardingComplete,
    }).returning({
      id: memberUsers.id, name: memberUsers.name, email: memberUsers.email, phone: memberUsers.phone,
      birthDate: memberUsers.birthDate, birthTime: memberUsers.birthTime, birthPlace: memberUsers.birthPlace,
      plan: memberUsers.plan, onboardingComplete: memberUsers.onboardingComplete, active: memberUsers.active,
      lastLoginAt: memberUsers.lastLoginAt, createdAt: memberUsers.createdAt, updatedAt: memberUsers.updatedAt,
    });
    await recordAudit(admin, "member.created", "member", created.id, { email: created.email, plan: created.plan });
    return Response.json(created, { status: 201 });
  } catch {
    return Response.json({ error: "A member with this email already exists." }, { status: 409 });
  }
}
