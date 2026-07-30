import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { practitionerInvites, practitioners } from "@/db/schema";
import { hashPassword } from "@/lib/admin-auth";
import { createPractitionerSession } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { token?: string; password?: string };
  const token = body.token ?? "";
  const password = body.password ?? "";
  if (!token || password.length < 10 || password.length > 128) {
    return Response.json({ error: "Use a password of at least 10 characters." }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [invite] = await db.select().from(practitionerInvites)
    .where(and(eq(practitionerInvites.tokenHash, tokenHash), isNull(practitionerInvites.acceptedAt), gt(practitionerInvites.expiresAt, new Date())))
    .limit(1);
  if (!invite) return Response.json({ error: "This invitation is invalid or has expired." }, { status: 410 });

  const practitioner = await db.transaction(async (tx) => {
    const [updated] = await tx.update(practitioners)
      .set({ passwordHash: hashPassword(password), lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(practitioners.id, invite.practitionerId))
      .returning({ id: practitioners.id, name: practitioners.name, email: practitioners.email });
    await tx.update(practitionerInvites).set({ acceptedAt: new Date() }).where(eq(practitionerInvites.id, invite.id));
    return updated;
  });

  await createPractitionerSession(practitioner.id);
  return Response.json({ ok: true, practitioner }, { status: 201 });
}
