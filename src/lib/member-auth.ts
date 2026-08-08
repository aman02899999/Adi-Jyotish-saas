import "server-only";

import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

const COOKIE_NAME = "jyotish_member_session";
const SESSION_DAYS = 14;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export type MemberIdentity = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  plan: string;
  onboardingComplete: boolean;
  emailVerified: boolean;
  totpEnabled: boolean;
};

type MemberDoc = {
  name: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  plan: string;
  onboardingComplete: boolean;
  active: boolean;
  totpEnabled?: boolean;
};

/** Verifies a client-obtained Firebase ID token, creates a long-lived session cookie, and
 * ensures a Firestore profile document exists for this member (created on first sign-in).
 * `referralCode`, if given, is only meaningful the moment the profile is first created — it's
 * how a signup started from someone else's invite link gets linked back to them. */
export async function createMemberSession(idToken: string, initialName?: string, referralCode?: string) {
  const decoded = await getAuth().verifyIdToken(idToken, true);
  const uid = decoded.uid;

  const ref = db.collection("members").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      name: initialName || decoded.name || decoded.email?.split("@")[0] || "Member",
      email: decoded.email ?? "",
      phone: null,
      birthDate: null,
      birthTime: null,
      birthPlace: null,
      plan: "member",
      onboardingComplete: false,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp(),
    } satisfies MemberDoc & Record<string, unknown>);
    if (referralCode) {
      const { recordReferral } = await import("@/lib/referrals");
      await recordReferral({ refereeId: uid, code: referralCode });
    }
  } else {
    await ref.update({ lastLoginAt: FieldValue.serverTimestamp() });
  }

  const sessionCookie = await getAuth().createSessionCookie(idToken, { expiresIn: SESSION_MS });
  const store = await cookies();
  store.set(COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });

  return uid;
}

export async function getCurrentMember(): Promise<MemberIdentity | null> {
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  if (!cookie) return null;

  let uid: string;
  let emailVerified: boolean;
  try {
    const decoded = await getAuth().verifySessionCookie(cookie, true);
    uid = decoded.uid;
    emailVerified = decoded.email_verified === true;
  } catch {
    return null;
  }

  const snap = await db.collection("members").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as MemberDoc;
  if (!data.active) return null;

  return {
    id: uid,
    name: data.name,
    email: data.email,
    phone: data.phone,
    birthDate: data.birthDate,
    birthTime: data.birthTime,
    birthPlace: data.birthPlace,
    plan: data.plan,
    onboardingComplete: data.onboardingComplete,
    emailVerified,
    totpEnabled: data.totpEnabled === true,
  };
}

export async function revokeMemberSession() {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME)?.value;
  if (cookie) {
    try {
      const decoded = await getAuth().verifySessionCookie(cookie);
      await getAuth().revokeRefreshTokens(decoded.uid);
    } catch {
      // Cookie already invalid/expired — nothing to revoke.
    }
  }
  store.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}
