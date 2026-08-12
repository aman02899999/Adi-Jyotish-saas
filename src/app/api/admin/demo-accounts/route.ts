import { randomBytes } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getCurrentAdmin, hasAdminPermission, recordAudit } from "@/lib/admin-auth";
import { rechargeWallet } from "@/lib/wallet";
import { getAllPlans } from "@/lib/plans";

export const dynamic = "force-dynamic";

const ADMIN_SEEDS = [1, 2, 3].map((n) => ({ email: `demo.admin${n}@adijyotishgurus.com`, name: `Demo Admin ${n}` }));
const PRACTITIONER_SEEDS = [1, 2, 3].map((n) => ({
  email: `demo.astrologer${n}@adijyotishgurus.com`,
  name: `Demo Astrologer ${n}`,
  slug: `demo-astrologer-${n}`,
}));
const MEMBER_SEEDS = [1, 2, 3].map((n) => ({ email: `demo.member${n}@adijyotishgurus.com`, name: `Demo Member ${n}` }));

/** Creates (or resets) 9 full-access demo accounts an admin can hand out for a walkthrough — 3
 * admins (Owner role, every permission), 3 practitioners (verified, featured, online, unlimited
 * availability), and 3 members (active Pro subscription + a funded wallet). Safe to call
 * repeatedly — every step is create-or-update, so re-running just issues a fresh shared password
 * and re-tops everything up rather than erroring or duplicating anything. The password is
 * randomly generated on every call (not a fixed constant) so a previously-shared demo login stops
 * working the moment someone regenerates it, and every account is flagged `isDemoAccount` so real
 * money can't leave the system through them (checked in requestPayout — see
 * practitioner-portal.ts). Direct Firebase Admin SDK calls (not the public self-serve/invite HTTP
 * routes) since this is an admin-privileged shortcut that intentionally skips the normal
 * invite-link flow. */
export async function POST() {
  const admin = await getCurrentAdmin();
  if (!admin) return Response.json({ error: "Administrator access required." }, { status: 401 });
  if (!hasAdminPermission(admin, "settings")) return Response.json({ error: "Settings permission required." }, { status: 403 });

  const password = `Demo${randomBytes(9).toString("base64url")}!1`;
  const now = FieldValue.serverTimestamp();

  async function upsertAuthUser(email: string, displayName: string) {
    try {
      const existing = await getAuth().getUserByEmail(email);
      await getAuth().updateUser(existing.uid, { password, displayName, emailVerified: true });
      return existing.uid;
    } catch {
      const created = await getAuth().createUser({ email, password, displayName, emailVerified: true });
      return created.uid;
    }
  }

  // --- Demo admins (Owner role — every permission) --------------------------------------------
  const admins = await Promise.all(ADMIN_SEEDS.map(async (seed) => {
    const uid = await upsertAuthUser(seed.email, seed.name);
    await db.collection("adminUsers").doc(uid).set({
      name: seed.name,
      email: seed.email,
      role: "owner",
      active: true,
      isDemoAccount: true,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    }, { merge: true });
    return { email: seed.email, url: "/admin/login" };
  }));

  // --- Demo practitioners (verified, featured, online, always available) ----------------------
  const practitioners = await Promise.all(PRACTITIONER_SEEDS.map(async (seed) => {
    const uid = await upsertAuthUser(seed.email, seed.name);
    const ref = db.collection("practitioners").doc(seed.slug);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.update({ firebaseUid: uid, online: true, active: true, verified: true, featured: true, hasPortalAccess: true, isDemoAccount: true, updatedAt: now });
    } else {
      await ref.set({
        name: seed.name,
        slug: seed.slug,
        email: seed.email,
        title: "Vedic Astrologer",
        bio: "A demo practitioner profile for walkthroughs — bookings and chat behave exactly like a real profile (payouts are disabled for this account).",
        specialties: "Birth charts, Career, Relationships, Gemstones",
        languages: "English, Hindi",
        consultationModes: "Video, Audio, Chat",
        experienceYears: 10,
        verified: true,
        verificationLevel: "senior-panel",
        photoUrl: null,
        online: true,
        chatRatePerMinute: 15,
        active: true,
        featured: true,
        hasPortalAccess: true,
        isDemoAccount: true,
        firebaseUid: uid,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
      });
      const batch = db.batch();
      for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
        batch.set(ref.collection("availabilityRules").doc(), { weekday, startTime: "00:00", endTime: "23:59", active: true });
      }
      await batch.commit();
    }
    return { email: seed.email, url: "/practitioner/login" };
  }));

  // --- Demo members (active Pro subscription + funded wallet) ---------------------------------
  const plans = await getAllPlans();
  const proPlan = plans.find((plan) => plan.key === "pro") ?? plans[plans.length - 1];
  const members = await Promise.all(MEMBER_SEEDS.map(async (seed) => {
    const uid = await upsertAuthUser(seed.email, seed.name);
    const memberRef = db.collection("members").doc(uid);
    const memberSnap = await memberRef.get();
    if (memberSnap.exists) {
      await memberRef.update({ name: seed.name, email: seed.email, active: true, isDemoAccount: true, plan: proPlan?.key ?? "member", updatedAt: now });
    } else {
      await memberRef.set({
        name: seed.name,
        email: seed.email,
        phone: null,
        birthDate: "1994-06-15",
        birthTime: "07:45",
        birthPlace: "Jaipur, India",
        plan: proPlan?.key ?? "member",
        active: true,
        isDemoAccount: true,
        onboardingComplete: true,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
      });
    }

    if (proPlan) {
      await db.collection("memberSubscriptions").doc(uid).set({
        planId: proPlan.id,
        billingInterval: "yearly",
        status: "active",
        razorpaySubscriptionId: null,
        razorpayCustomerId: null,
        currentPeriodStart: Timestamp.now(),
        currentPeriodEnd: Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
    }

    // Idempotent per razorpayPaymentId — reruns won't keep stacking balance.
    await rechargeWallet({ memberId: uid, amount: 5000, razorpayPaymentId: "demo-seed-topup" });
    return { email: seed.email, url: "/account" };
  }));

  await recordAudit(admin, "demo_accounts.seeded", "admin", admin.id, {
    admins: admins.map((entry) => entry.email),
    practitioners: practitioners.map((entry) => entry.email),
    members: members.map((entry) => entry.email),
  });

  return Response.json({ password, admins, practitioners, members });
}
