import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { createPractitionerSession } from "@/lib/practitioner-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { checkTwoFactorGate } from "@/lib/two-factor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const throttle = await checkRateLimit("practitioner-google-login", requestIp(request), 15, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401 });

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(body.idToken, true);
  } catch {
    return Response.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401 });
  }

  const byUid = await db.collection("practitioners").where("firebaseUid", "==", decoded.uid).limit(1).get();
  let practitionerRef = byUid.empty ? null : byUid.docs[0].ref;
  if (byUid.empty) {
    // Practitioners are onboarded by invite, not self-registration — Google can only link an
    // email an admin already added, never create a new practitioner.
    const byEmail = await db.collection("practitioners").where("email", "==", (decoded.email ?? "").toLowerCase()).limit(1).get();
    if (byEmail.empty) return Response.json({ error: "No practitioner account was found for this Google email. Ask your studio admin for an invite first." }, { status: 404 });
    const doc = byEmail.docs[0];
    if (doc.data().active !== true) return Response.json({ error: "This account is not active." }, { status: 403 });
    await doc.ref.update({ firebaseUid: decoded.uid, emailVerified: true, updatedAt: FieldValue.serverTimestamp() });
    practitionerRef = doc.ref;
  } else if (byUid.docs[0].data().active !== true) {
    return Response.json({ error: "This account is not active." }, { status: 403 });
  }

  const challengeToken = await checkTwoFactorGate("practitioner", decoded.uid, body.idToken, practitionerRef!);
  if (challengeToken) return Response.json({ requiresTotp: true, challengeToken });

  await createPractitionerSession(body.idToken);
  return Response.json({ ok: true });
}
