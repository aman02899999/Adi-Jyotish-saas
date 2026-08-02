import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { rechargeWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";

const DEMO_PASSWORD = "Demo@Jyotish2026";
const MEMBER_EMAIL = "demo.member@adijyotishgurus.com";
const PRACTITIONER_EMAIL = "demo.astrologer@adijyotishgurus.com";
const PRACTITIONER_SLUG = "demo-astrologer";

/** Creates (or resets) two fixed-credential demo accounts an admin can hand out for a walkthrough:
 * a member with a funded wallet, and an online practitioner ready for instant chat. Safe to call
 * repeatedly — every step is create-or-update, so re-running just resets the password and topsup
 * the wallet again rather than erroring or duplicating anything. Direct Firebase Admin SDK calls
 * (not the public self-serve/invite HTTP routes) since this is an admin-privileged shortcut that
 * intentionally skips the normal invite-link flow. */
export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "settings")) return Response.json({ error: "Settings permission required." }, { status: 403 });

  async function upsertAuthUser(email: string, displayName: string) {
    try {
      const existing = await getAuth().getUserByEmail(email);
      await getAuth().updateUser(existing.uid, { password: DEMO_PASSWORD, displayName, emailVerified: true });
      return existing.uid;
    } catch {
      const created = await getAuth().createUser({ email, password: DEMO_PASSWORD, displayName, emailVerified: true });
      return created.uid;
    }
  }

  // --- Demo member -------------------------------------------------------------------------
  const memberUid = await upsertAuthUser(MEMBER_EMAIL, "Demo Member");
  const memberRef = db.collection("members").doc(memberUid);
  const memberSnap = await memberRef.get();
  const now = FieldValue.serverTimestamp();
  if (memberSnap.exists) {
    await memberRef.update({ name: "Demo Member", email: MEMBER_EMAIL, active: true, updatedAt: now });
  } else {
    await memberRef.set({
      name: "Demo Member",
      email: MEMBER_EMAIL,
      phone: null,
      birthDate: "1994-06-15",
      birthTime: "07:45",
      birthPlace: "Jaipur, India",
      plan: "member",
      active: true,
      onboardingComplete: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    });
  }
  // Idempotent per razorpayPaymentId — reruns won't keep stacking balance.
  await rechargeWallet({ memberId: memberUid, amount: 1000, razorpayPaymentId: "demo-seed-topup" });

  // --- Demo practitioner ---------------------------------------------------------------------
  const practitionerUid = await upsertAuthUser(PRACTITIONER_EMAIL, "Demo Astrologer");
  const practitionerRef = db.collection("practitioners").doc(PRACTITIONER_SLUG);
  const practitionerSnap = await practitionerRef.get();
  if (practitionerSnap.exists) {
    await practitionerRef.update({ firebaseUid: practitionerUid, online: true, active: true, updatedAt: now });
  } else {
    await practitionerRef.set({
      name: "Demo Astrologer",
      slug: PRACTITIONER_SLUG,
      email: PRACTITIONER_EMAIL,
      title: "Vedic Astrologer",
      bio: "A demo practitioner profile for walkthroughs — bookings, chat, and payouts all behave exactly like a real profile.",
      specialties: "Birth charts, Career, Relationships",
      languages: "English, Hindi",
      consultationModes: "Video, Audio, Chat",
      experienceYears: 5,
      verified: true,
      verificationLevel: "reviewed",
      photoUrl: null,
      online: true,
      chatRatePerMinute: 10,
      active: true,
      featured: false,
      firebaseUid: practitionerUid,
      createdAt: now,
      updatedAt: now,
    });
    const batch = db.batch();
    for (const weekday of [1, 2, 3, 4, 5]) {
      batch.set(practitionerRef.collection("availabilityRules").doc(), { weekday, startTime: "09:30", endTime: "17:30", active: true });
    }
    await batch.commit();
  }

  await recordAudit(admin, "demo_accounts.seeded", "admin", admin.id, { memberEmail: MEMBER_EMAIL, practitionerEmail: PRACTITIONER_EMAIL });

  return Response.json({
    password: DEMO_PASSWORD,
    member: { email: MEMBER_EMAIL, url: "/onboarding" },
    practitioner: { email: PRACTITIONER_EMAIL, url: "/practitioner/login" },
  });
}
