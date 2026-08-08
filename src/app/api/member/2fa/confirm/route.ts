import { db } from "@/lib/firestore";
import { getCurrentMember } from "@/lib/member-auth";
import { generateBackupCodes, verifyTotpCode } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return Response.json({ error: "Member sign-in required." }, { status: 401 });

  const ref = db.collection("members").doc(member.id);
  const snap = await ref.get();
  const secret = snap.data()?.totpSecret as string | undefined;
  if (!secret) return Response.json({ error: "Start enrollment before confirming a code." }, { status: 409 });

  const body = (await request.json()) as { code?: string };
  if (!(await verifyTotpCode(secret, (body.code ?? "").trim()))) {
    return Response.json({ error: "That code is incorrect." }, { status: 401 });
  }

  const { codes, hashed } = generateBackupCodes();
  await ref.update({ totpEnabled: true, totpBackupCodes: hashed });
  return Response.json({ ok: true, backupCodes: codes });
}
