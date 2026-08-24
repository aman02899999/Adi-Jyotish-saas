import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";

export class CouponError extends Error {}

/** Doc ID = the normalized coupon code itself, so lookup-by-code at checkout is a single doc read
 * instead of a query. */
const couponsCol = db.collection("gemstoneCoupons");

export type GemstoneCoupon = {
  id: string;
  code: string;
  description: string;
  discountType: string;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function fromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): GemstoneCoupon {
  const data = doc.data() as Omit<GemstoneCoupon, "id" | "startsAt" | "expiresAt" | "createdAt" | "updatedAt"> & {
    startsAt?: Timestamp | null;
    expiresAt?: Timestamp | null;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
  };
  return {
    ...data,
    id: doc.id,
    startsAt: toDateOrNull(data.startsAt),
    expiresAt: toDateOrNull(data.expiresAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function getAllCouponsAdmin(): Promise<GemstoneCoupon[]> {
  const snap = await couponsCol.orderBy("createdAt", "desc").get();
  return snap.docs.map(fromDoc);
}

export async function getCouponById(id: string) {
  const snap = await couponsCol.doc(id).get();
  return snap.exists ? fromDoc(snap) : null;
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

  const ref = couponsCol.doc(code);
  const existing = await ref.get();
  if (existing.exists) throw new CouponError("A coupon with this code already exists.");

  const startsAt = payload.startsAt ? new Date(payload.startsAt) : null;
  const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
  if (startsAt && expiresAt && startsAt >= expiresAt) throw new CouponError("Start date must be before the expiry date.");

  await ref.set({
    code,
    description: (payload.description ?? "").trim().slice(0, 300),
    discountType,
    discountValue,
    minOrderAmount: Math.max(0, Number(payload.minOrderAmount) || 0),
    maxDiscountAmount: payload.maxDiscountAmount != null ? Math.max(0, Number(payload.maxDiscountAmount)) : null,
    usageLimit: payload.usageLimit != null ? Math.max(0, Number(payload.usageLimit)) : null,
    usageCount: 0,
    perCustomerLimit: payload.perCustomerLimit != null ? Math.max(0, Number(payload.perCustomerLimit)) : null,
    startsAt,
    expiresAt,
    active: payload.active ?? true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const created = await ref.get();
  return fromDoc(created);
}

export async function updateCoupon(id: string, payload: CouponPayload) {
  const ref = couponsCol.doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new CouponError("Coupon not found.");
  const existing = fromDoc(snap);

  const discountType = payload.discountType === "flat" || payload.discountType === "percent" ? payload.discountType : existing.discountType;
  const discountValue = payload.discountValue != null ? Math.max(0, Number(payload.discountValue) || 0) : existing.discountValue;
  if (discountType === "percent" && discountValue > 100) throw new CouponError("Percentage discounts cannot exceed 100.");

  const nextCode = payload.code ? normalizeCode(payload.code) : existing.code;
  const startsAt = payload.startsAt !== undefined ? (payload.startsAt ? new Date(payload.startsAt) : null) : existing.startsAt;
  const expiresAt = payload.expiresAt !== undefined ? (payload.expiresAt ? new Date(payload.expiresAt) : null) : existing.expiresAt;
  if (startsAt && expiresAt && startsAt >= expiresAt) throw new CouponError("Start date must be before the expiry date.");
  const fields = {
    code: nextCode,
    description: payload.description !== undefined ? payload.description.trim().slice(0, 300) : existing.description,
    discountType,
    discountValue,
    minOrderAmount: payload.minOrderAmount != null ? Math.max(0, Number(payload.minOrderAmount) || 0) : existing.minOrderAmount,
    maxDiscountAmount: payload.maxDiscountAmount !== undefined ? (payload.maxDiscountAmount != null ? Math.max(0, Number(payload.maxDiscountAmount)) : null) : existing.maxDiscountAmount,
    usageLimit: payload.usageLimit !== undefined ? (payload.usageLimit != null ? Math.max(0, Number(payload.usageLimit)) : null) : existing.usageLimit,
    perCustomerLimit: payload.perCustomerLimit !== undefined ? (payload.perCustomerLimit != null ? Math.max(0, Number(payload.perCustomerLimit)) : null) : existing.perCustomerLimit,
    startsAt,
    expiresAt,
    active: payload.active ?? existing.active,
  };

  if (nextCode !== existing.code) {
    // The doc ID is the code, so a code change means migrating to a new doc — keep usageCount/createdAt.
    // Transactional (not two plain calls): a checkout redeeming this coupon under its old code
    // between a separate set()+delete() could increment usageCount on the doc that's about to be
    // deleted, silently losing that redemption's count. Running both writes in one transaction
    // means Firestore serializes against the redemption's own transaction on the same doc instead.
    const nextRef = couponsCol.doc(nextCode);
    await db.runTransaction(async (tx) => {
      const [currentSnap, conflictSnap] = await Promise.all([tx.get(ref), tx.get(nextRef)]);
      if (!currentSnap.exists) throw new CouponError("Coupon not found.");
      if (conflictSnap.exists) throw new CouponError("A coupon with this code already exists.");
      const currentUsage = (currentSnap.data() as { usageCount: number }).usageCount;
      tx.set(nextRef, { ...fields, usageCount: currentUsage, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      tx.delete(ref);
    });
    const created = await nextRef.get();
    return fromDoc(created);
  }

  await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
  const updated = await ref.get();
  return fromDoc(updated);
}

/** Pure validation — does not consume usage. Usage is recorded once an order actually pays. */
export async function validateCoupon(code: string, subtotal: number): Promise<{ coupon: GemstoneCoupon; discountAmount: number }> {
  const normalized = normalizeCode(code);
  const snap = await couponsCol.doc(normalized).get();
  if (!snap.exists) throw new CouponError("This coupon code is not valid.");
  const coupon = fromDoc(snap);
  if (!coupon.active) throw new CouponError("This coupon code is not valid.");

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
