import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { signInProviderIsGoogle, verifyAuthToken } from "@/lib/auth-verify";
import { createPractitionerSession } from "@/lib/practitioner-auth";
import { checkRateLimit, rateLimitResponse, requestIp } from "@/lib/rate-limit";
import { checkTwoFactorGate } from "@/lib/two-factor";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import {
  findPractitionerByEmailInSupabase,
  findPractitionerForLinkInSupabase,
  linkPractitionerGoogleUidInSupabase,
  type PractitionerLinkRow,
} from "@/lib/practitioner-auth-supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const throttle = await checkRateLimit("practitioner-google-login", requestIp(request), 15, 3600);
  if (!throttle.allowed) return rateLimitResponse(throttle.retryAfter);

  const body = await request.json() as { idToken?: string };
  if (!body.idToken) return Response.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401 });

  let decoded;
  try {
    decoded = await verifyAuthToken(body.idToken);
  } catch {
    return Response.json({ error: "Google sign-in could not be verified. Please try again." }, { status: 401 });
  }

  let linked: PractitionerLinkRow | null;
  if (isSupabaseCutoverActive()) {
    linked = await findPractitionerForLinkInSupabase(decoded.uid);
  } else {
    const byUid = await db.collection("practitioners").where("firebaseUid", "==", decoded.uid).limit(1).get();
    linked = byUid.empty ? null : { id: byUid.docs[0].id, active: byUid.docs[0].data().active === true };
  }
  if (!linked) {
    // Practitioners are onboarded by invite, not self-registration — Google can only link an
    // email an admin already added, never create a new practitioner. That only holds if this
    // really was a Google-verified sign-in: verifyIdToken proves the token is genuine, not which
    // provider issued it or that the email was ever confirmed. Before this check, anyone could
    // self-register the same email via password auth (email_verified defaults false there) in the
    // window before the real practitioner accepts their invite, then hit this route to hijack the
    // still-unlinked practitioner record.
    // signInProviderIsGoogle() accepts both spellings: Firebase stamps
    // "google.com", Supabase stamps "google". Comparing to the Firebase string
    // alone would reject every migrated account here.
    if (!decoded.emailVerified || !signInProviderIsGoogle(decoded.signInProvider)) {
      return Response.json({ error: "No practitioner account was found for this Google email. Ask your studio admin for an invite first." }, { status: 404 });
    }
    let byEmail: PractitionerLinkRow | null;
    if (isSupabaseCutoverActive()) {
      byEmail = await findPractitionerByEmailInSupabase(decoded.email ?? "");
    } else {
      // Firestore string comparison is case-sensitive, hence the explicit lowercase;
      // practitioners.email is citext on Postgres and matches case-insensitively.
      const byEmailSnap = await db.collection("practitioners").where("email", "==", (decoded.email ?? "").toLowerCase()).limit(1).get();
      byEmail = byEmailSnap.empty ? null : { id: byEmailSnap.docs[0].id, active: byEmailSnap.docs[0].data().active === true };
    }
    if (!byEmail) return Response.json({ error: "No practitioner account was found for this Google email. Ask your studio admin for an invite first." }, { status: 404 });
    if (!byEmail.active) return Response.json({ error: "This account is not active." }, { status: 403 });
    if (isSupabaseCutoverActive()) {
      await linkPractitionerGoogleUidInSupabase(byEmail.id, decoded.uid);
    } else {
      await db.collection("practitioners").doc(byEmail.id).update({ firebaseUid: decoded.uid, emailVerified: true, updatedAt: FieldValue.serverTimestamp() });
    }
  } else if (!linked.active) {
    return Response.json({ error: "This account is not active." }, { status: 403 });
  }

  const challengeToken = await checkTwoFactorGate("practitioner", decoded.uid, body.idToken);
  if (challengeToken) return Response.json({ requiresTotp: true, challengeToken });

  await createPractitionerSession(body.idToken);
  return Response.json({ ok: true });
}
