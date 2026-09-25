import "server-only";

import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { verifyAuthToken } from "@/lib/auth-verify";
import { issueSessionCookieValue, revokeAllUserSessions, verifySessionCookieValue } from "@/lib/session-cookie";
import {
  findPractitionerIdByUidInSupabase,
  getActivePractitionerByUidInSupabase,
  touchPractitionerLastLoginInSupabase,
} from "@/lib/practitioner-auth-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

const COOKIE_NAME = "jyotish_practitioner_session";
const SESSION_DAYS = 14;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export type PractitionerIdentity = {
  id: string;
  name: string;
  slug: string;
  email: string;
  title: string;
  photoUrl: string | null;
  online: boolean;
};

type PractitionerDoc = {
  name: string;
  slug: string;
  email: string;
  title: string;
  photoUrl: string | null;
  active: boolean;
  firebaseUid: string | null;
  online: boolean;
};

/** Practitioner docs are keyed by slug (stable, human-readable, used in /astrologers/[slug]
 * routing) rather than Firebase UID, because a practitioner record can exist — created by an
 * admin invite, or seeded demo data — before any Firebase Auth account is linked to it. The
 * `firebaseUid` field is the linkage, set once the practitioner actually signs in. */
async function findPractitionerDocByUid(uid: string) {
  const snap = await db.collection("practitioners").where("firebaseUid", "==", uid).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

/**
 * Whether a practitioner record is linked to this uid — what the sign-in routes ask before deciding
 * to demand a 2FA code. It must read the live provider: after cutover, a practitioner linked in
 * Postgres is absent from Firestore, and a Firestore-only answer of "no such practitioner" would
 * skip their 2FA challenge entirely.
 */
export async function hasPractitionerForUid(uid: string): Promise<boolean> {
  if (isSupabaseCutoverActive()) return (await findPractitionerIdByUidInSupabase(uid)) !== null;
  return (await findPractitionerDocByUid(uid)) !== null;
}

/** Verifies a client-obtained Firebase ID token and creates a session cookie. Unlike members,
 * practitioner accounts are never auto-created here — they must already exist (created by an
 * admin invite) with this UID linked, or the sign-in is rejected by the caller before this runs. */
export async function createPractitionerSession(idToken: string) {
  const decoded = await verifyAuthToken(idToken);
  if (isSupabaseCutoverActive()) {
    const id = await findPractitionerIdByUidInSupabase(decoded.uid);
    if (id) await touchPractitionerLastLoginInSupabase(id);
  } else {
    const doc = await findPractitionerDocByUid(decoded.uid);
    if (doc) await doc.ref.update({ lastLoginAt: FieldValue.serverTimestamp() });
  }

  const sessionCookie = await issueSessionCookieValue({ uid: decoded.uid }, idToken, SESSION_MS);
  const store = await cookies();
  store.set(COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });

  return decoded.uid;
}

export async function getCurrentPractitioner(): Promise<PractitionerIdentity | null> {
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  if (!cookie) return null;

  let uid: string;
  try {
    uid = (await verifySessionCookieValue(cookie, true)).uid;
  } catch {
    return null;
  }

  if (isSupabaseCutoverActive()) {
    // `active` is inside the query, so a deactivated practitioner and one with no
    // linked account both come back as null.
    const data = await getActivePractitionerByUidInSupabase(uid);
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      email: data.email,
      title: data.title,
      photoUrl: data.photoUrl,
      online: data.online ?? false,
    };
  }

  const doc = await findPractitionerDocByUid(uid);
  if (!doc) return null;
  const data = doc.data() as PractitionerDoc;
  if (!data.active) return null;

  return {
    id: doc.id,
    name: data.name,
    slug: data.slug,
    email: data.email,
    title: data.title,
    photoUrl: data.photoUrl,
    online: data.online ?? false,
  };
}

export async function requirePractitionerPage() {
  const practitioner = await getCurrentPractitioner();
  if (!practitioner) redirect({ href: "/practitioner/login", locale: await getLocale() });
  return practitioner;
}

export async function revokePractitionerSession() {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME)?.value;
  if (cookie) {
    try {
      const decoded = await verifySessionCookieValue(cookie, false);
      await revokeAllUserSessions(decoded.uid);
    } catch {
      // Cookie already invalid/expired — nothing to revoke.
    }
  }
  store.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}
