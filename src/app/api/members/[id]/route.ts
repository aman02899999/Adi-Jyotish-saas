import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, memberSessions, memberUsers } from "@/db/schema";
import { getCurrentAdmin, hasAdminPermission, hashPassword, normalizeEmail, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const plans = ["member", "premium", "concierge"];
type MemberPayload = { name?: string; email?: string; password?: string; phone?: string; birthDate?: string; birthTime?: string; birthPlace?: string; plan?: string; active?: boolean };
function parseId(value: string) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "members_manage")) return Response.json({ error: "Member management permission required." }, { status: 403 });
  const { id: rawId } = await params; const id = parseId(rawId);
  if (!id) return Response.json({ error: "Invalid member id." }, { status: 400 });
  const [existing] = await db.select().from(memberUsers).where(eq(memberUsers.id, id)).limit(1);
  if (!existing) return Response.json({ error: "Member not found." }, { status: 404 });

  const body = await request.json() as MemberPayload;
  const name = body.name?.trim().slice(0, 120) ?? "";
  const email = normalizeEmail(body.email ?? "");
  const plan = plans.includes(body.plan ?? "") ? body.plan! : existing.plan;
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "A name and valid email are required." }, { status: 400 });
  if (body.password && (body.password.length < 10 || body.password.length > 128)) return Response.json({ error: "New password must be 10–128 characters." }, { status: 400 });
  const birthDate = body.birthDate?.trim().slice(0, 10) || null;
  const birthTime = body.birthTime?.trim().slice(0, 8) || null;
  const birthPlace = body.birthPlace?.trim().slice(0, 180) || null;
  const active = body.active ?? existing.active;

  try {
    const updated = await db.transaction(async (tx) => {
      if (email !== existing.email) await tx.update(bookings).set({ clientEmail: email, updatedAt: new Date() }).where(eq(bookings.clientEmail, existing.email));
      if (!active) await tx.delete(memberSessions).where(eq(memberSessions.memberId, id));
      const [row] = await tx.update(memberUsers).set({
        name, email, phone: body.phone?.trim().slice(0, 40) || null, birthDate, birthTime, birthPlace,
        plan, active, onboardingComplete: Boolean(birthDate && birthTime && birthPlace),
        ...(body.password ? { passwordHash: hashPassword(body.password) } : {}), updatedAt: new Date(),
      }).where(eq(memberUsers.id, id)).returning({
        id: memberUsers.id, name: memberUsers.name, email: memberUsers.email, phone: memberUsers.phone,
        birthDate: memberUsers.birthDate, birthTime: memberUsers.birthTime, birthPlace: memberUsers.birthPlace,
        plan: memberUsers.plan, onboardingComplete: memberUsers.onboardingComplete, active: memberUsers.active,
        lastLoginAt: memberUsers.lastLoginAt, createdAt: memberUsers.createdAt, updatedAt: memberUsers.updatedAt,
      });
      return row;
    });
    await recordAudit(admin, "member.updated", "member", updated.id, { email: updated.email, plan: updated.plan, active: updated.active, passwordReset: Boolean(body.password) });
    return Response.json(updated);
  } catch {
    return Response.json({ error: "This email is already assigned to another member." }, { status: 409 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "members_manage")) return Response.json({ error: "Member management permission required." }, { status: 403 });
  const { id: rawId } = await params; const id = parseId(rawId);
  if (!id) return Response.json({ error: "Invalid member id." }, { status: 400 });
  const [deleted] = await db.delete(memberUsers).where(eq(memberUsers.id, id)).returning({ id: memberUsers.id, email: memberUsers.email });
  if (!deleted) return Response.json({ error: "Member not found." }, { status: 404 });
  await recordAudit(admin, "member.deleted", "member", deleted.id, { email: deleted.email });
  return Response.json({ ok: true, id: deleted.id });
}
