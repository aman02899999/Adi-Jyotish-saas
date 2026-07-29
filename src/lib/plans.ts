import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { membershipPlans, type MembershipPlan, type NewMembershipPlan } from "@/db/schema";
import { getRazorpay } from "@/lib/razorpay";
import { getStudioSettings } from "@/lib/studio-settings";
import { toSlug } from "@/lib/services";

const starterPlans: Array<Omit<NewMembershipPlan, "currency">> = [
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

export async function seedMembershipPlans() {
  const settings = await getStudioSettings();
  await db.insert(membershipPlans).values(starterPlans.map((plan) => ({ ...plan, currency: settings.currency }))).onConflictDoNothing({ target: membershipPlans.key });
}

export async function getAllPlans(): Promise<MembershipPlan[]> {
  await seedMembershipPlans();
  return db.select().from(membershipPlans).orderBy(asc(membershipPlans.sortOrder), asc(membershipPlans.id));
}

export async function getPublicPlans(): Promise<MembershipPlan[]> {
  const rows = await getAllPlans();
  return rows.filter((plan) => plan.active);
}

export async function getPlanById(id: number) {
  const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, id)).limit(1);
  return plan ?? null;
}

export async function getPlanByKey(key: string) {
  const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.key, key)).limit(1);
  return plan ?? null;
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

export async function createPlan(payload: PlanPayload) {
  const name = payload.name?.trim();
  if (!name) throw new Error("Plan name is required.");
  const settings = await getStudioSettings();
  const key = payload.key?.trim() ? toSlug(payload.key) : toSlug(name);

  const [created] = await db.insert(membershipPlans).values({
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
  }).returning();

  const razorpayIds = await ensureRazorpayPlans(created);
  const [synced] = await db.update(membershipPlans).set(razorpayIds).where(eq(membershipPlans.id, created.id)).returning();
  return synced;
}

export async function updatePlan(id: number, payload: PlanPayload) {
  const existing = await getPlanById(id);
  if (!existing) throw new Error("Plan not found.");

  const [updated] = await db.update(membershipPlans).set({
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
    updatedAt: new Date(),
  }).where(eq(membershipPlans.id, id)).returning();

  const razorpayIds = await ensureRazorpayPlans(updated);
  const [synced] = await db.update(membershipPlans).set(razorpayIds).where(eq(membershipPlans.id, id)).returning();
  return synced;
}
