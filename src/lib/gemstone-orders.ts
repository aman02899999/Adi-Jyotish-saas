import "server-only";

import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gemstoneCoupons, gemstoneOrderItems, gemstoneOrders, gemstoneProductVariants, gemstoneProducts, type GemstoneOrder } from "@/db/schema";
import { validateCoupon } from "@/lib/gemstone-coupons";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { createNotification, notifyAdmins } from "@/lib/notifications";
import { getStudioSettings } from "@/lib/studio-settings";
import { splitGstInclusive } from "@/lib/gst";

export class CartValidationError extends Error {}
export class OrderNotFoundError extends Error {}

const VARIANT_LOCK_OFFSET = 4_000_000_000;
const FREE_SHIPPING_THRESHOLD = 2000;
const FLAT_SHIPPING_FEE = 99;

export type CartLineInput = { variantId: number; quantity: number };

export type ShippingAddressInput = {
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
};

function generateOrderNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(2).toString("hex").toUpperCase();
  return `GEM-${stamp}-${rand}`;
}

export function computeShippingFee(subtotal: number) {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
}

async function lockVariant(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], variantId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(${VARIANT_LOCK_OFFSET + variantId})`);
  const [row] = await tx.select({ variant: gemstoneProductVariants, product: gemstoneProducts })
    .from(gemstoneProductVariants)
    .innerJoin(gemstoneProducts, eq(gemstoneProductVariants.productId, gemstoneProducts.id))
    .where(eq(gemstoneProductVariants.id, variantId))
    .limit(1);
  return row ?? null;
}

/** Re-prices a cart against the database — never trusts client-supplied prices. */
export async function priceCart(lines: CartLineInput[]) {
  if (!lines.length) throw new CartValidationError("Your cart is empty.");

  const ids = [...new Set(lines.map((line) => line.variantId))];
  const rows = await db.select({ variant: gemstoneProductVariants, product: gemstoneProducts })
    .from(gemstoneProductVariants)
    .innerJoin(gemstoneProducts, eq(gemstoneProductVariants.productId, gemstoneProducts.id))
    .where(sql`${gemstoneProductVariants.id} in (${sql.join(ids, sql`,`)})`);

  const byId = new Map(rows.map((row) => [row.variant.id, row]));

  const items = lines.map((line) => {
    const found = byId.get(line.variantId);
    if (!found) throw new CartValidationError("One of the items in your cart is no longer available.");
    if (!found.variant.active || !found.product.active) throw new CartValidationError(`${found.product.name} is currently unavailable.`);
    const quantity = Math.max(1, Math.min(20, Math.round(line.quantity)));
    if (found.variant.stockQuantity < quantity) throw new CartValidationError(`Only ${found.variant.stockQuantity} left of ${found.product.name} (${found.variant.label}).`);
    return {
      variantId: found.variant.id,
      productId: found.product.id,
      productName: found.product.name,
      variantLabel: found.variant.label,
      unitPrice: found.variant.price,
      quantity,
      lineTotal: found.variant.price * quantity,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return { items, subtotal };
}

export async function createPendingOrder({ memberId, guestName, guestEmail, guestPhone, shipping, lines, couponCode }: {
  memberId: number | null;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  shipping: ShippingAddressInput;
  lines: CartLineInput[];
  couponCode?: string;
}): Promise<GemstoneOrder> {
  const { items, subtotal } = await priceCart(lines);

  let discount = 0;
  let appliedCouponCode: string | null = null;
  if (couponCode?.trim()) {
    const { coupon, discountAmount } = await validateCoupon(couponCode, subtotal);
    discount = discountAmount;
    appliedCouponCode = coupon.code;
  }

  const shippingFee = computeShippingFee(subtotal - discount);
  const total = Math.max(0, subtotal - discount) + shippingFee;
  const settings = await getStudioSettings();
  // Listed prices are treated as GST-inclusive, so this only splits out the tax for invoicing — the checkout total is unchanged.
  const { taxAmount } = splitGstInclusive(Math.max(0, subtotal - discount), settings.gstRate);
  const orderNumber = generateOrderNumber();

  return db.transaction(async (tx) => {
    for (const item of items) {
      const locked = await lockVariant(tx, item.variantId);
      if (!locked || locked.variant.stockQuantity < item.quantity) {
        throw new CartValidationError(`${item.productName} just sold out. Please update your cart.`);
      }
      await tx.update(gemstoneProductVariants)
        .set({ stockQuantity: sql`${gemstoneProductVariants.stockQuantity} - ${item.quantity}` })
        .where(eq(gemstoneProductVariants.id, item.variantId));
    }

    const [order] = await tx.insert(gemstoneOrders).values({
      orderNumber,
      memberId,
      guestName: memberId ? null : guestName?.trim() ?? null,
      guestEmail: memberId ? null : guestEmail?.trim() ?? null,
      guestPhone: memberId ? null : guestPhone?.trim() ?? null,
      shippingName: shipping.name.trim(),
      shippingPhone: shipping.phone.trim(),
      shippingLine1: shipping.line1.trim(),
      shippingLine2: shipping.line2?.trim() || null,
      shippingCity: shipping.city.trim(),
      shippingState: shipping.state.trim(),
      shippingPincode: shipping.pincode.trim(),
      shippingCountry: shipping.country?.trim() || "India",
      subtotal,
      discount,
      shippingFee,
      tax: taxAmount,
      total,
      couponCode: appliedCouponCode,
      status: "pending",
      paymentStatus: "pending",
    }).returning();

    await tx.insert(gemstoneOrderItems).values(items.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantLabel: item.variantLabel,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })));

    return order;
  });
}

export async function attachRazorpayOrder(orderId: number, razorpayOrderId: string) {
  await db.update(gemstoneOrders).set({ razorpayOrderId }).where(eq(gemstoneOrders.id, orderId));
}

/** Idempotent per razorpayPaymentId. */
export async function markOrderPaid({ orderId, razorpayPaymentId }: { orderId: number; razorpayPaymentId: string }) {
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(gemstoneOrders).where(eq(gemstoneOrders.id, orderId)).limit(1);
    if (!existing) throw new OrderNotFoundError("Order not found.");
    if (existing.paymentStatus === "paid") return { order: existing, justPaid: false };

    const [updated] = await tx.update(gemstoneOrders)
      .set({ paymentStatus: "paid", status: "processing", razorpayPaymentId, updatedAt: new Date() })
      .where(and(eq(gemstoneOrders.id, orderId), eq(gemstoneOrders.paymentStatus, "pending")))
      .returning();

    if (updated?.couponCode) {
      await tx.update(gemstoneCoupons).set({ usageCount: sql`${gemstoneCoupons.usageCount} + 1` }).where(eq(gemstoneCoupons.code, updated.couponCode));
    }

    return { order: updated ?? existing, justPaid: Boolean(updated) };
  });

  if (result.justPaid) await notifyOrderPaid(result.order).catch(() => {});
  return result.order;
}

async function notifyOrderPaid(order: GemstoneOrder) {
  const adminIds = await getAdminIdsWithPermission("gemstones");
  await notifyAdmins(adminIds, {
    type: "gemstone_order.paid",
    title: `New paid order ${order.orderNumber}`,
    body: `${order.currency} ${order.total} · ${order.guestName || "Member order"}`,
    link: `/admin/gemstones/orders`,
  });
  if (order.memberId) {
    await createNotification({
      recipientType: "member",
      recipientId: order.memberId,
      type: "gemstone_order.paid",
      title: "Your order is confirmed",
      body: `Order ${order.orderNumber} is being processed.`,
      link: `/gemstones/order/${order.orderNumber}`,
    });
  }
}

export async function getOrderItems(orderId: number) {
  return db.select().from(gemstoneOrderItems).where(eq(gemstoneOrderItems.orderId, orderId));
}

export async function getOrderById(orderId: number) {
  const [order] = await db.select().from(gemstoneOrders).where(eq(gemstoneOrders.id, orderId)).limit(1);
  return order ?? null;
}

/** Scoped lookup for the confirmation page: must belong to the member, or match the guest email used at checkout. */
export async function getOrderByNumberScoped(orderNumber: string, { memberId, guestEmail }: { memberId?: number | null; guestEmail?: string | null }) {
  const [order] = await db.select().from(gemstoneOrders).where(eq(gemstoneOrders.orderNumber, orderNumber)).limit(1);
  if (!order) return null;
  const ownedByMember = memberId != null && order.memberId === memberId;
  const ownedByGuest = !order.memberId && guestEmail && order.guestEmail?.toLowerCase() === guestEmail.toLowerCase();
  if (!ownedByMember && !ownedByGuest) return null;
  return order;
}

export async function getOrdersForMember(memberId: number) {
  return db.select().from(gemstoneOrders).where(eq(gemstoneOrders.memberId, memberId)).orderBy(desc(gemstoneOrders.createdAt));
}

export async function getAllOrdersAdmin(status?: string) {
  const query = db.select().from(gemstoneOrders).orderBy(desc(gemstoneOrders.createdAt));
  if (status && status !== "all") return query.where(eq(gemstoneOrders.status, status));
  return query;
}

const CANCELLABLE_STATUSES = new Set(["pending", "processing"]);

export async function updateOrderStatus(orderId: number, status: string) {
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(gemstoneOrders).where(eq(gemstoneOrders.id, orderId)).limit(1);
    if (!existing) throw new OrderNotFoundError("Order not found.");

    if (status === "cancelled" && existing.status !== "cancelled") {
      if (!CANCELLABLE_STATUSES.has(existing.status)) throw new CartValidationError("This order can no longer be cancelled.");
      const items = await tx.select().from(gemstoneOrderItems).where(eq(gemstoneOrderItems.orderId, orderId));
      for (const item of items) {
        await tx.update(gemstoneProductVariants)
          .set({ stockQuantity: sql`${gemstoneProductVariants.stockQuantity} + ${item.quantity}` })
          .where(eq(gemstoneProductVariants.id, item.variantId));
      }
    }

    const [row] = await tx.update(gemstoneOrders)
      .set({ status, paymentStatus: status === "refunded" ? "refunded" : existing.paymentStatus, updatedAt: new Date() })
      .where(eq(gemstoneOrders.id, orderId))
      .returning();
    return row;
  });

  if (updated?.memberId) {
    await createNotification({
      recipientType: "member",
      recipientId: updated.memberId,
      type: "gemstone_order.status",
      title: `Order ${updated.orderNumber} is now ${status}`,
      link: `/gemstones/order/${updated.orderNumber}`,
    }).catch(() => {});
  }
  return updated;
}

export async function getGemstoneAdminStats() {
  const [revenueRow] = await db.select({ revenue: sql<number>`coalesce(sum(${gemstoneOrders.total}),0)::int`, paidCount: sql<number>`count(*)::int` })
    .from(gemstoneOrders).where(eq(gemstoneOrders.paymentStatus, "paid"));
  const statusCounts = await db.select({ status: gemstoneOrders.status, count: sql<number>`count(*)::int` }).from(gemstoneOrders).groupBy(gemstoneOrders.status);
  const [lowStockRow] = await db.select({ count: sql<number>`count(*)::int` }).from(gemstoneProductVariants).where(and(sql`${gemstoneProductVariants.stockQuantity} <= 5`, eq(gemstoneProductVariants.active, true)));

  return {
    revenue: revenueRow?.revenue ?? 0,
    paidOrderCount: revenueRow?.paidCount ?? 0,
    statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row.count])),
    lowStockVariantCount: lowStockRow?.count ?? 0,
  };
}

export async function getLowStockVariants(threshold = 5) {
  return db.select({ variant: gemstoneProductVariants, productName: gemstoneProducts.name, productSlug: gemstoneProducts.slug })
    .from(gemstoneProductVariants)
    .innerJoin(gemstoneProducts, eq(gemstoneProductVariants.productId, gemstoneProducts.id))
    .where(and(sql`${gemstoneProductVariants.stockQuantity} <= ${threshold}`, eq(gemstoneProductVariants.active, true)))
    .orderBy(asc(gemstoneProductVariants.stockQuantity));
}

export async function memberHasPurchasedProduct(memberId: number, productId: number) {
  const [row] = await db.select({ id: gemstoneOrders.id })
    .from(gemstoneOrders)
    .innerJoin(gemstoneOrderItems, eq(gemstoneOrderItems.orderId, gemstoneOrders.id))
    .where(and(
      eq(gemstoneOrders.memberId, memberId),
      eq(gemstoneOrderItems.productId, productId),
      eq(gemstoneOrders.paymentStatus, "paid"),
    ))
    .limit(1);
  return row ?? null;
}
