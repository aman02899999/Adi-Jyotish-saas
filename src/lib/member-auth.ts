import "server-only";

import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { locales, SIGNED_IN_DEFAULT_LOCALE } from "@/i18n/routing";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { verifyAuthToken } from "@/lib/auth-verify";
import { issueSessionCookieValue, revokeAllUserSessions, verifySessionCookieValue } from "@/lib/session-cookie";
import {
  createMemberProfileInSupabase,
  getActiveMemberInSupabase,
  getMemberLocaleInSupabase,
  setMemberLocaleInSupabase,
  touchMemberLastLoginInSupabase,
} from "@/lib/member-auth-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

const COOKIE_NAME = "jyotish_member_session";
const SESSION_DAYS = 14;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/** next-intl's own locale-detection cookie — the site reads this to pick a language. */
const LOCALE_COOKIE = "NEXT_LOCALE";

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
  /** QA-only: this member settles every paid flow at zero cost. See lib/payment-bypass.ts. */
  paymentBypass: boolean;
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
  paymentBypass?: boolean;
  /** The member's chosen interface language. Absent on accounts created before this existed,
   * which is why the sign-in path falls back to SIGNED_IN_DEFAULT_LOCALE rather than assuming. */
  locale?: string;
};

/** Verifies a client-obtained Firebase ID token, creates a long-lived session cookie, and
 * ensures a Firestore profile document exists for this member (created on first sign-in).
 * `referralCode`, if given, is only meaningful the moment the profile is first created — it's
 * how a signup started from someone else's invite link gets linked back to them. */
export async function createMemberSession(idToken: string, initialName?: string, referralCode?: string) {
  const decoded = await verifyAuthToken(idToken);
  const uid = decoded.uid;

  // Both branches resolve the member's stored language, which the cookie block
  // below needs, so it is hoisted rather than duplicated.
  let storedLocale: string | null = null;

  if (isSupabaseCutoverActive()) {
    // The primary key decides whether this sign-in creates the profile, which the
    // Firestore get-then-set below cannot: two concurrent first sign-ins would both
    // see "missing" and the second would overwrite the first.
    const created = await createMemberProfileInSupabase({
      id: uid,
      name: initialName || decoded.name || decoded.email?.split("@")[0] || "Member",
      email: decoded.email ?? "",
      locale: SIGNED_IN_DEFAULT_LOCALE,
    });
    if (created) {
      if (referralCode) {
        const { recordReferral } = await import("@/lib/referrals");
        await recordReferral({ refereeId: uid, code: referralCode });
      }
    } else {
      await touchMemberLastLoginInSupabase(uid);
      storedLocale = await getMemberLocaleInSupabase(uid);
    }
  } else {
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
        locale: SIGNED_IN_DEFAULT_LOCALE,
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
    storedLocale = (snap.exists ? (snap.data() as MemberDoc).locale : null) ?? null;
  }

  const sessionCookie = await issueSessionCookieValue({ uid, emailVerified: decoded.emailVerified }, idToken, SESSION_MS);
  const store = await cookies();
  store.set(COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });

  // Signed-in members land in Hinglish unless they have chosen otherwise. This is the audience's
  // own register — the readings themselves are already written that way — so English is the wrong
  // thing to greet someone with after they sign in. NEXT_LOCALE is next-intl's own detection
  // cookie, so setting it here steers the whole site, and the language switcher overwrites it the
  // moment a member picks something else. Their choice is stored on the member document too, so it
  // follows them to a new browser rather than living only in this cookie.
  const stored = storedLocale ?? SIGNED_IN_DEFAULT_LOCALE;
  const preferred = hasLocale(locales, stored) ? stored : SIGNED_IN_DEFAULT_LOCALE;
  store.set(LOCALE_COOKIE, preferred, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });

  return uid;
}

/** Records a member's language choice so it survives a new browser or device, and mirrors it into
 * the detection cookie the rest of the site reads. */
export async function setMemberLocale(memberId: string, locale: string) {
  if (!hasLocale(locales, locale)) return false;
  if (isSupabaseCutoverActive()) {
    await setMemberLocaleInSupabase(memberId, locale);
  } else {
    await db.collection("members").doc(memberId).update({ locale, updatedAt: FieldValue.serverTimestamp() });
  }
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
  return true;
}

export async function getCurrentMember(): Promise<MemberIdentity | null> {
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  if (!cookie) return null;

  let uid: string;
  let emailVerified: boolean;
  try {
    const decoded = await verifySessionCookieValue(cookie, true);
    uid = decoded.uid;
    emailVerified = decoded.emailVerified;
  } catch {
    return null;
  }

  if (isSupabaseCutoverActive()) {
    // `active` is inside this query, so a deactivated account and a missing one
    // both come back as null. emailVerified still comes from the session payload,
    // not from the row, exactly as the Firestore path below does it.
    const data = await getActiveMemberInSupabase(uid);
    if (!data) return null;

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
      totpEnabled: data.totpEnabled,
      paymentBypass: data.paymentBypass,
    };
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
    // Read straight off the member document, which only the Admin SDK can write — there is no
    // route that lets a member set this on themselves. See lib/payment-bypass.ts.
    paymentBypass: data.paymentBypass === true,
  };
}

export async function revokeMemberSession() {
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
