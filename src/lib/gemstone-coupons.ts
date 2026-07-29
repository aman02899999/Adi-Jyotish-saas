import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gemstoneCoupons, type GemstoneCoupon } from "@/db/schema";

export class CouponError extends Error {}

export async function getAllCouponsAdmin(): Promise<GemstoneCoupon[]> {
  return db.select().from(gemstoneCoupons).orderBy(desc(gemstoneCoupons.createdAt));
}

export async function getCouponById(id: number) {
  const [coupon] = await db.select().from(gemstoneCoupons).where(eq(gemstoneCoupons.id, id)).limit(1);
  return coupon ?? null;
}

export type CouponPayload = {
  code?: string;
  description?: string;
  discountType?: string;
  discountValue?: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  active?: boolean;
};

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40);
}

export async function createCoupon(payload: CouponPayload) {
  const code = normalizeCode(payload.code ?? "");
  if (!code) throw new CouponError("Coupon code is required.");
  const discountType = payload.discountType === "flat" ? "flat" : "percent";
  const discountValue = Math.max(0, Number(payload.discountValue) || 0);
  if (discountValue <= 0) throw new CouponError("Discount value must be greater than zero.");
  if (discountType === "percent" && discountValue > 100) throw new CouponError("Percentage discounts cannot exceed 100.");

  const [created] = await db.insert(gemstoneCoupons).values({
    code,
    description: payload.description?.trim() ?? "",
    discountType,
    discountValue,
    minOrderAmount: Math.max(0, Number(payload.minOrderAmount) || 0),
    maxDiscountAmount: payload.maxDiscountAmount != null ? Math.max(0, Number(payload.maxDiscountAmount)) : null,
    usageLimit: payload.usageLimit != null ? Math.max(0, Number(payload.usageLimit)) : null,
    perCustomerLimit: payload.perCustomerLimit != null ? Math.max(0, Number(payload.perCustomerLimit)) : null,
    startsAt: payload.startsAt ? new Date(payload.startsAt) : null,
    expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
    active: payload.active ?? true,
  }).returning();
  return created;
}

export async function updateCoupon(id: number, payload: CouponPayload) {
  const existing = await getCouponById(id);
  if (!existing) throw new CouponError("Coupon not found.");

  const discountType = payload.discountType === "flat" || payload.discountType === "percent" ? payload.discountType : existing.discountType;
  const discountValue = payload.discountValue != null ? Math.max(0, Number(payload.discountValue) || 0) : existing.discountValue;
  if (discountType === "percent" && discountValue > 100) throw new CouponError("Percentage discounts cannot exceed 100.");

  const [updated] = await db.update(gemstoneCoupons).set({
    code: payload.code ? normalizeCode(payload.code) : existing.code,
    description: payload.description ?? existing.description,
    discountType,
    discountValue,
    minOrderAmount: payload.minOrderAmount != null ? Math.max(0, Number(payload.minOrderAmount) || 0) : existing.minOrderAmount,
    maxDiscountAmount: payload.maxDiscountAmount !== undefined ? (payload.maxDiscountAmount != null ? Math.max(0, Number(payload.maxDiscountAmount)) : null) : existing.maxDiscountAmount,
    usageLimit: payload.usageLimit !== undefined ? (payload.usageLimit != null ? Math.max(0, Number(payload.usageLimit)) : null) : existing.usageLimit,
    perCustomerLimit: payload.perCustomerLimit !== undefined ? (payload.perCustomerLimit != null ? Math.max(0, Number(payload.perCustomerLimit)) : null) : existing.perCustomerLimit,
    startsAt: payload.startsAt !== undefined ? (payload.startsAt ? new Date(payload.startsAt) : null) : existing.startsAt,
    expiresAt: payload.expiresAt !== undefined ? (payload.expiresAt ? new Date(payload.expiresAt) : null) : existing.expiresAt,
    active: payload.active ?? existing.active,
    updatedAt: new Date(),
  }).where(eq(gemstoneCoupons.id, id)).returning();
  return updated;
}

/** Pure validation — does not consume usage. Usage is recorded once an order actually pays. */
export async function validateCoupon(code: string, subtotal: number): Promise<{ coupon: GemstoneCoupon; discountAmount: number }> {
  const normalized = normalizeCode(code);
  const [coupon] = await db.select().from(gemstoneCoupons).where(eq(gemstoneCoupons.code, normalized)).limit(1);
  if (!coupon || !coupon.active) throw new CouponError("This coupon code is not valid.");

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) throw new CouponError("This coupon is not active yet.");
  if (coupon.expiresAt && now > coupon.expiresAt) throw new CouponError("This coupon has expired.");
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) throw new CouponError("This coupon has reached its usage limit.");
  if (subtotal < coupon.minOrderAmount) throw new CouponError(`Add ${coupon.minOrderAmount - subtotal} more to your cart to use this coupon.`);

  let discountAmount = coupon.discountType === "flat" ? coupon.discountValue : Math.round((subtotal * coupon.discountValue) / 100);
  if (coupon.maxDiscountAmount != null) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
  discountAmount = Math.min(discountAmount, subtotal);

  return { coupon, discountAmount };
}

export async function incrementCouponUsage(couponId: number) {
  await db.update(gemstoneCoupons).set({ usageCount: sql`${gemstoneCoupons.usageCount} + 1` }).where(eq(gemstoneCoupons.id, couponId));
}
