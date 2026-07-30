import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberUsers } from "@/db/schema";
import { createMemberSession } from "@/lib/member-auth";
import { verifyFirebaseIdToken } from "@/lib/firebase-admin";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const throttle = await checkRateLimit("member-google-login", requestIp(request), 15, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { idToken?: string };
  const identity = body.idToken ? await verifyFirebaseIdToken(body.idToken) : null;
  if (!identity) return Response.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401 });

  const [byUid] = await db.select({ id: memberUsers.id, onboardingComplete: memberUsers.onboardingComplete, active: memberUsers.active })
    .from(memberUsers).where(eq(memberUsers.firebaseUid, identity.uid)).limit(1);

  if (byUid) {
    if (!byUid.active) return Response.json({ error: "This account is not active." }, { status: 403 });
    await db.update(memberUsers).set({ lastLoginAt: new Date() }).where(eq(memberUsers.id, byUid.id));
    await createMemberSession(byUid.id);
    return Response.json({ ok: true, onboardingComplete: byUid.onboardingComplete });
  }

  const [byEmail] = await db.select({ id: memberUsers.id, onboardingComplete: memberUsers.onboardingComplete, active: memberUsers.active })
    .from(memberUsers).where(eq(memberUsers.email, identity.email)).limit(1);

  if (byEmail) {
    if (!byEmail.active) return Response.json({ error: "This account is not active." }, { status: 403 });
    // A password account signing in with Google for the first time — link it, since Google already re-verified the same email address.
    await db.update(memberUsers).set({ firebaseUid: identity.uid, emailVerified: true, lastLoginAt: new Date() }).where(eq(memberUsers.id, byEmail.id));
    await createMemberSession(byEmail.id);
    return Response.json({ ok: true, onboardingComplete: byEmail.onboardingComplete });
  }

  const [created] = await db.insert(memberUsers).values({
    name: identity.name,
    email: identity.email,
    firebaseUid: identity.uid,
    emailVerified: true,
    lastLoginAt: new Date(),
  }).returning({ id: memberUsers.id, onboardingComplete: memberUsers.onboardingComplete });
  await createMemberSession(created.id);
  return Response.json({ ok: true, onboardingComplete: created.onboardingComplete });
}
