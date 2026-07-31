import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, normalizeEmail, recordAudit } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const plans = ["member", "premium", "concierge"];

type MemberPayload = {
  name?: string; email?: string; password?: string; phone?: string;
  birthDate?: string; birthTime?: string; birthPlace?: string; plan?: string; active?: boolean;
};

function toDate(value: FirebaseFirestore.Timestamp | Date | undefined | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : value.toDate();
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "members_view")) return Response.json({ error: "Member access required." }, { status: 403 });
  const snap = await db.collection("members").orderBy("name", "asc").get();
  const rows = snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      name: data.name as string,
      email: data.email as string,
      phone: (data.phone as string | null) ?? null,
      birthDate: (data.birthDate as string | null) ?? null,
      birthTime: (data.birthTime as string | null) ?? null,
      birthPlace: (data.birthPlace as string | null) ?? null,
      plan: (data.plan as string) ?? "member",
      onboardingComplete: Boolean(data.onboardingComplete),
      active: data.active !== false,
      lastLoginAt: toDate(data.lastLoginAt as FirebaseFirestore.Timestamp | undefined),
      createdAt: toDate(data.createdAt as FirebaseFirestore.Timestamp | undefined) ?? new Date(),
      updatedAt: toDate(data.updatedAt as FirebaseFirestore.Timestamp | undefined) ?? new Date(),
    };
  });
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
  const active = body.active ?? true;
  const phone = body.phone?.trim().slice(0, 40) || null;

  let uid: string;
  try {
    const userRecord = await getAuth().createUser({ email, password, displayName: name });
    uid = userRecord.uid;
  } catch {
    return Response.json({ error: "A member with this email already exists." }, { status: 409 });
  }

  const ref = db.collection("members").doc(uid);
  await ref.set({
    name, email, phone, birthDate, birthTime, birthPlace, plan, active, onboardingComplete,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: null,
  });

  const created = { id: uid, name, email, phone, birthDate, birthTime, birthPlace, plan, active, onboardingComplete, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };
  await recordAudit(admin, "member.created", "member", uid, { email, plan });
  return Response.json(created, { status: 201 });
}
