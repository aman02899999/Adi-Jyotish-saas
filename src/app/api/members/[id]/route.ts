import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, normalizeEmail, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const plans = ["member", "premium", "concierge"];
type MemberPayload = { name?: string; email?: string; password?: string; phone?: string; birthDate?: string; birthTime?: string; birthPlace?: string; plan?: string; active?: boolean };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "members_manage")) return Response.json({ error: "Member management permission required." }, { status: 403 });
  const { id } = await params;
  const ref = db.collection("members").doc(id);
  const existingSnap = await ref.get();
  if (!existingSnap.exists) return Response.json({ error: "Member not found." }, { status: 404 });
  const existing = existingSnap.data() as { name: string; email: string; plan: string; active: boolean };

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
  const phone = body.phone?.trim().slice(0, 40) || null;

  try {
    const authUpdate: { email?: string; password?: string; disabled?: boolean } = {};
    if (email !== existing.email) authUpdate.email = email;
    if (body.password) authUpdate.password = body.password;
    if (active === false) authUpdate.disabled = true;
    else if (active === true) authUpdate.disabled = false;
    if (Object.keys(authUpdate).length) await getAuth().updateUser(id, authUpdate);
    if (active === false) await getAuth().revokeRefreshTokens(id);

    if (email !== existing.email) {
      const staleBookings = await db.collection("bookings").where("clientEmail", "==", existing.email).get();
      const batch = db.batch();
      for (const doc of staleBookings.docs) batch.update(doc.ref, { clientEmail: email, updatedAt: FieldValue.serverTimestamp() });
      if (staleBookings.size) await batch.commit();
    }

    const onboardingComplete = Boolean(birthDate && birthTime && birthPlace);
    await ref.update({ name, email, phone, birthDate, birthTime, birthPlace, plan, active, onboardingComplete, updatedAt: FieldValue.serverTimestamp() });

    const updated = { id, name, email, phone, birthDate, birthTime, birthPlace, plan, active, onboardingComplete };
    await recordAudit(admin, "member.updated", "member", id, { email, plan, active, passwordReset: Boolean(body.password) });
    return Response.json(updated);
  } catch {
    return Response.json({ error: "This email is already assigned to another member." }, { status: 409 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "members_manage")) return Response.json({ error: "Member management permission required." }, { status: 403 });
  const { id } = await params;
  const ref = db.collection("members").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ error: "Member not found." }, { status: 404 });
  const email = (snap.data() as { email: string }).email;

  await ref.delete();
  try {
    await getAuth().deleteUser(id);
  } catch {
    // Auth account already gone — Firestore doc removal is what matters for the app's own data.
  }
  await recordAudit(admin, "member.deleted", "member", id, { email });
  return Response.json({ ok: true, id });
}
