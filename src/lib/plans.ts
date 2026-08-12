import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { getRazorpay } from "@/lib/razorpay";
import { getStudioSettings } from "@/lib/studio-settings";
import { toSlug } from "@/lib/services";

export type MembershipPlan = {
  id: string; // == key
  key: string;
  name: string;
  tagline: string;
  description: string;
  priceMonthly: number;
  priceYearly: number | null;
  currency: string;
  features: string;
  sessionDiscountPercent: number;
  highlighted: boolean;
  active: boolean;
  sortOrder: number;
  razorpayPlanIdMonthly: string | null;
  razorpayPlanIdYearly: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDate(value: FirebaseFirestore.Timestamp | Date | undefined | null): Date {
  if (!value) return new Date();
  return value instanceof Date ? value : value.toDate();
}

function plansCollection() {
  return db.collection("membershipPlans");
}

function planFromSnap(snap: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot): MembershipPlan {
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    key: snap.id,
    name: data.name as string,
    tagline: (data.tagline as string) ?? "",
    description: (data.description as string) ?? "",
    priceMonthly: (data.priceMonthly as number) ?? 0,
    priceYearly: (data.priceYearly as number | null) ?? null,
    currency: (data.currency as string) ?? "INR",
    features: (data.features as string) ?? "",
    sessionDiscountPercent: (data.sessionDiscountPercent as number) ?? 0,
    highlighted: Boolean(data.highlighted),
    active: data.active !== false,
    sortOrder: (data.sortOrder as number) ?? 0,
    razorpayPlanIdMonthly: (data.razorpayPlanIdMonthly as string | null) ?? null,
    razorpayPlanIdYearly: (data.razorpayPlanIdYearly as string | null) ?? null,
    createdAt: toDate(data.createdAt as FirebaseFirestore.Timestamp),
    updatedAt: toDate(data.updatedAt as FirebaseFirestore.Timestamp),
  };
}

function isAlreadyExists(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: unknown }).code === 6);
}

const starterPlans: Array<Omit<MembershipPlan, "id" | "currency" | "razorpayPlanIdMonthly" | "razorpayPlanIdYearly" | "createdAt" | "updatedAt">> = [
  {
    key: "plus",
    name: "Plus",
    tagline: "For a steady personal cosmic practice",
    description: "Deeper daily guidance and priority access to your favorite practitioners.",
    priceMonthly: 299,
    priceYearly: 2999,
    features: "Full daily horoscope & panchang\n10% off every consultation\nPriority studio inbox replies\nUnlimited chart re-reads",
    sessionDiscountPercent: 10,
    highlighted: false,
    active: true,
    sortOrder: 1,
  },
  {
    key: "pro",
    name: "Pro",
    tagline: "For clients in an active life transition",
    description: "The full studio experience: deeper discounts, faster access, and concierge scheduling.",
    priceMonthly: 799,
    priceYearly: 7999,
    features: "Everything in Plus\n20% off every consultation\nMonthly complimentary 15-minute check-in\nConcierge scheduling with preferred practitioners",
    sessionDiscountPercent: 20,
    highlighted: true,
    active: true,
    sortOrder: 2,
  },
];

/** Doc id == plan key (unique tier slug), so seeding is idempotent the same way `ensureInvoiceForBooking`
 * is: `create()` fails silently (caught) if the plan already exists — no separate uniqueness check needed. */
export async function seedMembershipPlans(): Promise<void> {
  const settings = await getStudioSettings();
  await Promise.all(starterPlans.map(async (plan) => {
    const ref = plansCollection().doc(plan.key);
    try {
      await ref.create({
        ...plan,
        currency: settings.currency,
        razorpayPlanIdMonthly: null,
        razorpayPlanIdYearly: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
  }));
}

/** Plans created by seedMembershipPlans() (or saved before Razorpay was configured) can be left
 * with null razorpayPlanId(Monthly|Yearly) forever — nothing else ever revisits them, which
 * silently disables their Subscribe button on /pricing with no explanation. Backfilling here,
 * on every read, makes that self-healing the moment Razorpay is configured, without requiring an
 * admin to manually re-save each plan. Cheap once synced: ensureRazorpayPlans() only calls the
 * Razorpay API for plans still missing an id. */
async function backfillRazorpayIds(plan: MembershipPlan): Promise<MembershipPlan> {
  const needsMonthly = !plan.razorpayPlanIdMonthly && plan.priceMonthly > 0;
  const needsYearly = !plan.razorpayPlanIdYearly && Boolean(plan.priceYearly && plan.priceYearly > 0);
  if (!needsMonthly && !needsYearly) return plan;

  try {
    const razorpayIds = await ensureRazorpayPlans(plan);
    if (razorpayIds.razorpayPlanIdMonthly === plan.razorpayPlanIdMonthly && razorpayIds.razorpayPlanIdYearly === plan.razorpayPlanIdYearly) {
      return plan;
    }
    await plansCollection().doc(plan.id).update({ ...razorpayIds, updatedAt: FieldValue.serverTimestamp() });
    return { ...plan, ...razorpayIds };
  } catch (error) {
    console.error(`Could not sync Razorpay plan ids for "${plan.key}":`, error instanceof Error ? error.message : error);
    return plan;
  }
}

export async function getAllPlans(): Promise<MembershipPlan[]> {
  await seedMembershipPlans();
  const snap = await plansCollection().orderBy("sortOrder", "asc").get();
  const plans = snap.docs.map((doc) => planFromSnap(doc));
  return Promise.all(plans.map(backfillRazorpayIds));
}

export async function getPublicPlans(): Promise<MembershipPlan[]> {
  const rows = await getAllPlans();
  return rows.filter((plan) => plan.active);
}

export async function getPlanById(id: string): Promise<MembershipPlan | null> {
  const snap = await plansCollection().doc(id).get();
  return snap.exists ? planFromSnap(snap) : null;
}

export async function getPlanByKey(key: string): Promise<MembershipPlan | null> {
  return getPlanById(key);
}

function toMinorUnits(amount: number) {
  return Math.round(amount * 100);
}

/** Creates (or reuses) the Razorpay Plan objects backing a membership plan's monthly/yearly prices. */
export async function ensureRazorpayPlans(plan: MembershipPlan): Promise<{ razorpayPlanIdMonthly: string | null; razorpayPlanIdYearly: string | null }> {
  const razorpay = getRazorpay();
  if (!razorpay) return { razorpayPlanIdMonthly: plan.razorpayPlanIdMonthly, razorpayPlanIdYearly: plan.razorpayPlanIdYearly };

  let monthlyId = plan.razorpayPlanIdMonthly;
  if (!monthlyId && plan.priceMonthly > 0) {
    const created = await razorpay.plans.create({
      period: "monthly",
      interval: 1,
      item: { name: `${plan.name} — Monthly`, amount: toMinorUnits(plan.priceMonthly), currency: plan.currency, description: plan.tagline },
      notes: { planKey: plan.key },
    });
    monthlyId = created.id;
  }

  let yearlyId = plan.razorpayPlanIdYearly;
  if (!yearlyId && plan.priceYearly && plan.priceYearly > 0) {
    const created = await razorpay.plans.create({
      period: "yearly",
      interval: 1,
      item: { name: `${plan.name} — Yearly`, amount: toMinorUnits(plan.priceYearly), currency: plan.currency, description: plan.tagline },
      notes: { planKey: plan.key },
    });
    yearlyId = created.id;
  }

  return { razorpayPlanIdMonthly: monthlyId ?? null, razorpayPlanIdYearly: yearlyId ?? null };
}

export type PlanPayload = {
  key?: string;
  name?: string;
  tagline?: string;
  description?: string;
  priceMonthly?: number;
  priceYearly?: number | null;
  features?: string;
  sessionDiscountPercent?: number;
  highlighted?: boolean;
  active?: boolean;
  sortOrder?: number;
};

export async function createPlan(payload: PlanPayload): Promise<MembershipPlan> {
  const name = payload.name?.trim();
  if (!name) throw new Error("Plan name is required.");
  const settings = await getStudioSettings();
  const key = payload.key?.trim() ? toSlug(payload.key) : toSlug(name);

  const ref = plansCollection().doc(key);
  const existing = await ref.get();
  if (existing.exists) throw new Error("A plan with this key already exists.");

  await ref.set({
    key,
    name,
    tagline: payload.tagline?.trim() ?? "",
    description: payload.description?.trim() ?? "",
    priceMonthly: Math.max(0, Number(payload.priceMonthly) || 0),
    priceYearly: payload.priceYearly != null && Number(payload.priceYearly) > 0 ? Math.max(0, Number(payload.priceYearly)) : null,
    currency: settings.currency,
    features: payload.features?.trim() ?? "",
    sessionDiscountPercent: Math.min(100, Math.max(0, Number(payload.sessionDiscountPercent) || 0)),
    highlighted: payload.highlighted ?? false,
    active: payload.active ?? true,
    sortOrder: Math.max(0, Number(payload.sortOrder) || 0),
    razorpayPlanIdMonthly: null,
    razorpayPlanIdYearly: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const created = planFromSnap(await ref.get());
  const razorpayIds = await ensureRazorpayPlans(created);
  await ref.update({ ...razorpayIds, updatedAt: FieldValue.serverTimestamp() });
  return planFromSnap(await ref.get());
}

export async function updatePlan(id: string, payload: PlanPayload): Promise<MembershipPlan> {
  const existing = await getPlanById(id);
  if (!existing) throw new Error("Plan not found.");
  const ref = plansCollection().doc(id);

  await ref.update({
    name: payload.name?.trim() || existing.name,
    tagline: payload.tagline?.trim() ?? existing.tagline,
    description: payload.description?.trim() ?? existing.description,
    priceMonthly: payload.priceMonthly != null ? Math.max(0, Number(payload.priceMonthly) || 0) : existing.priceMonthly,
    priceYearly: payload.priceYearly != null ? (Number(payload.priceYearly) > 0 ? Math.max(0, Number(payload.priceYearly)) : null) : existing.priceYearly,
    features: payload.features ?? existing.features,
    sessionDiscountPercent: payload.sessionDiscountPercent != null ? Math.min(100, Math.max(0, Number(payload.sessionDiscountPercent) || 0)) : existing.sessionDiscountPercent,
    highlighted: payload.highlighted ?? existing.highlighted,
    active: payload.active ?? existing.active,
    sortOrder: payload.sortOrder != null ? Math.max(0, Number(payload.sortOrder) || 0) : existing.sortOrder,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const updated = planFromSnap(await ref.get());
  const razorpayIds = await ensureRazorpayPlans(updated);
  await ref.update({ ...razorpayIds, updatedAt: FieldValue.serverTimestamp() });
  return planFromSnap(await ref.get());
}
