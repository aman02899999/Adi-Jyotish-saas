import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practitioners } from "@/db/schema";
import { createPractitionerSession } from "@/lib/practitioner-auth";
import { verifyFirebaseIdToken } from "@/lib/firebase-admin";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const throttle = await checkRateLimit("practitioner-google-login", requestIp(request), 15, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { idToken?: string };
  const identity = body.idToken ? await verifyFirebaseIdToken(body.idToken) : null;
  if (!identity) return Response.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401 });

  const [byUid] = await db.select({ id: practitioners.id, active: practitioners.active }).from(practitioners).where(eq(practitioners.firebaseUid, identity.uid)).limit(1);
  if (byUid) {
    if (!byUid.active) return Response.json({ error: "This account is not active." }, { status: 403 });
    await db.update(practitioners).set({ lastLoginAt: new Date() }).where(eq(practitioners.id, byUid.id));
    await createPractitionerSession(byUid.id);
    return Response.json({ ok: true });
  }

  // Practitioners are onboarded by invite, not self-registration — Google can only link an email an admin already added, never create a new practitioner.
  const [byEmail] = await db.select({ id: practitioners.id, active: practitioners.active }).from(practitioners).where(eq(practitioners.email, identity.email)).limit(1);
  if (!byEmail) return Response.json({ error: "No practitioner account was found for this Google email. Ask your studio admin for an invite first." }, { status: 404 });
  if (!byEmail.active) return Response.json({ error: "This account is not active." }, { status: 403 });

  await db.update(practitioners).set({ firebaseUid: identity.uid, emailVerified: true, lastLoginAt: new Date() }).where(eq(practitioners.id, byEmail.id));
  await createPractitionerSession(byEmail.id);
  return Response.json({ ok: true });
}
