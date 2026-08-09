import "server-only";

import { randomBytes } from "node:crypto";
import { AggregateField, FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, withIndexFallback } from "@/lib/firestore";
import { validateCoupon } from "@/lib/gemstone-coupons";
import { getAdminIdsWithPermission } from "@/lib/admin-roles";
import { createNotification, notifyAdmins } from "@/lib/notifications";
import { getStudioSettings } from "@/lib/studio-settings";
import { splitGstInclusive } from "@/lib/gst";
import { genericNotificationEmailHtml, isEmailConfigured, sendEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";

export class CartValidationError extends Error {}
export class OrderNotFoundError extends Error {}

const FREE_SHIPPING_THRESHOLD = 2000;
const FLAT_SHIPPING_FEE = 99;

const ordersCol = db.collection("gemstoneOrders");
const productsCol = db.collection("gemstoneProducts");
const couponsCol = db.collection("gemstoneCoupons");

function variantRef(productId: string, variantId: string) {
  return productsCol.doc(productId).collection("variants").doc(variantId);
}
function itemsCol(orderId: string) {
  return ordersCol.doc(orderId).collection("items");
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

export type GemstoneOrder = {
  id: string;
  orderNumber: string;
  memberId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  shippingName: string;
  shippingPhone: string;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPincode: string;
  shippingCountry: string;
  subtotal: number;
  discount: number;
  shippingFee: number;
  tax: number;
  total: number;
  currency: string;
  couponCode: string | null;
  status: string;
  paymentStatus: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GemstoneOrderItem = {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  createdAt: Date;
};

function fromOrderDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): GemstoneOrder {
  const data = doc.data() as Omit<GemstoneOrder, "id" | "createdAt" | "updatedAt"> & { createdAt?: Timestamp; updatedAt?: Timestamp };
  return { ...data, id: doc.id, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
}

function fromItemDoc(doc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): GemstoneOrderItem {
  const data = doc.data() as Omit<GemstoneOrderItem, "id" | "createdAt"> & { createdAt?: Timestamp };
  return { ...data, id: doc.id, createdAt: toDate(data.createdAt) };
}

export type CartLineInput = { productId: string; variantId: string; quantity: number };

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

type PricedItem = { productId: string; variantId: string; productName: string; variantLabel: string; unitPrice: number; quantity: number; lineTotal: number };

/** Re-prices a cart against Firestore — never trusts client-supplied prices. Reads each variant
 * directly by its (productId, variantId) path, since variants live in a per-product subcollection. */
export async function priceCart(lines: CartLineInput[]): Promise<{ items: PricedItem[]; subtotal: number }> {
  if (!lines.length) throw new CartValidationError("Your cart is empty.");

  const dedupedProductIds = [...new Set(lines.map((line) => line.productId))];
  const [variantSnaps, productSnaps] = await Promise.all([
    Promise.all(lines.map((line) => variantRef(line.productId, line.variantId).get())),
    db.getAll(...dedupedProductIds.map((id) => productsCol.doc(id))),
  ]);
  const productById = new Map(productSnaps.map((snap) => [snap.id, snap]));

  const items = lines.map((line, index) => {
    const variantSnap = variantSnaps[index];
    const productSnap = productById.get(line.productId);
    if (!variantSnap.exists || !productSnap?.exists) throw new CartValidationError("One of the items in your cart is no longer available.");
    const variant = variantSnap.data() as { label: string; price: number; stockQuantity: number; active: boolean };
    const product = productSnap.data() as { name: string; active: boolean };
    if (!variant.active || !product.active) throw new CartValidationError(`${product.name} is currently unavailable.`);
    const quantity = Math.max(1, Math.min(20, Math.round(line.quantity)));
    if (variant.stockQuantity < quantity) throw new CartValidationError(`Only ${variant.stockQuantity} left of ${product.name} (${variant.label}).`);
    return {
      productId: line.productId,
      variantId: line.variantId,
      productName: product.name,
      variantLabel: variant.label,
      unitPrice: variant.price,
      quantity,
      lineTotal: variant.price * quantity,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return { items, subtotal };
}

// Shorter than a generous checkout window would be on its own — 30 minutes gave an abusive
// caller (rotating IPs, or just staying under the per-identity rate limit) up to half an hour of
// held stock per pending order on scarce/low-stock items. 15 minutes is still comfortably more
// than a real Razorpay checkout takes, while roughly halving that exposure window.
const PENDING_ORDER_TTL_MS = 15 * 60 * 1000;

/** Self-healing cleanup for checkout abandonment: a pending order reserves stock (and coupon
 * usage) the moment it's created, before payment — if the customer never completes payment
 * (closed the tab, a failed Razorpay attempt with no retry), that reservation would otherwise
 * never be released. Runs on the housekeeping cron (see .github/workflows/cron.yml) as well as
 * opportunistically from a couple of natural trigger points (new checkout attempts, the admin
 * orders list). Reuses updateOrderStatus so stock/coupon release stays in one place. Also fires a
 * one-time "your cart is still here" recovery email — the 15-minute TTL is too short for a
 * pre-expiry reminder to be worth the added complexity, so this nudges the customer back
 * afterwards instead, which is when re-engagement email typically performs best anyway. */
export async function expireStalePendingOrders() {
  const cutoff = Timestamp.fromMillis(Date.now() - PENDING_ORDER_TTL_MS);
  const snap = await ordersCol.where("status", "==", "pending").where("createdAt", "<", cutoff).limit(25).get();
  for (const doc of snap.docs) {
    const orderId = doc.id;
    await updateOrderStatus(orderId, "cancelled")
      .then(() => sendCartRecoveryEmail(fromOrderDoc(doc)))
      .catch((error) => {
        console.error(`Failed to expire stale pending order ${orderId}`, error);
      });
  }
}

async function sendCartRecoveryEmail(order: GemstoneOrder) {
  if (!isEmailConfigured()) return;

  let name = order.guestName;
  let email = order.guestEmail;
  if (order.memberId) {
    const memberSnap = await db.collection("members").doc(order.memberId).get();
    const memberData = memberSnap.data() as { name?: string; email?: string } | undefined;
    name = memberData?.name ?? name;
    email = memberData?.email ?? email;
  }
  if (!email) return;

  const items = await getOrderItems(order.id).catch(() => []);
  const summary = items.length
    ? items.map((item) => `${item.productName} (${item.variantLabel}) × ${item.quantity}`).join(", ")
    : "the items in your cart";

  await sendEmail({
    to: email,
    subject: "Your gemstone cart is still here",
    html: genericNotificationEmailHtml({
      title: "Your cart is still waiting for you",
      name: name || "there",
      body: `We released the stock hold on ${summary} since checkout wasn't completed — but everything is still in stock. Head back to the shop to finish your order.`,
      ctaLabel: "Return to shop",
      ctaUrl: new URL("/gemstones/shop", getSiteUrl()).toString(),
    }),
  }).catch((error) => {
    console.error(`Failed to send cart-recovery email for order ${order.id}`, error);
  });
}

export async function createPendingOrder({ memberId, guestName, guestEmail, guestPhone, shipping, lines, couponCode }: {
  memberId: string | null;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  shipping: ShippingAddressInput;
  lines: CartLineInput[];
  couponCode?: string;
}): Promise<GemstoneOrder> {
  await expireStalePendingOrders().catch((error) => console.error("Stale pending order sweep failed", error));
  const { items, subtotal } = await priceCart(lines);

  let discount = 0;
  let appliedCouponCode: string | null = null;
  if (couponCode?.trim()) {
    const { coupon, discountAmount } = await validateCoupon(couponCode, subtotal);
    if (coupon.perCustomerLimit != null) {
      let usedQuery = ordersCol.where("couponCode", "==", coupon.code).where("paymentStatus", "==", "paid");
      if (memberId) usedQuery = usedQuery.where("memberId", "==", memberId);
      else if (guestEmail?.trim()) usedQuery = usedQuery.where("guestEmail", "==", guestEmail.trim());
      // Fails open (treats as "not yet used") if the composite index is still building on a fresh
      // deploy, same fallback philosophy used elsewhere in this codebase — better to let one order
      // through under-checked than 500 every checkout attempt.
      const usedCount = await withIndexFallback(async () => (await usedQuery.count().get()).data().count, 0);
      if (usedCount >= coupon.perCustomerLimit) {
        throw new CartValidationError("You've already used this coupon the maximum number of times.");
      }
    }
    discount = discountAmount;
    appliedCouponCode = coupon.code;
  }

  const shippingFee = computeShippingFee(subtotal - discount);
  const total = Math.max(0, subtotal - discount) + shippingFee;
  const settings = await getStudioSettings();
  // Listed prices are treated as GST-inclusive, so this only splits out the tax for invoicing — the checkout total is unchanged.
  const { taxAmount } = splitGstInclusive(Math.max(0, subtotal - discount), settings.gstRate);
  const orderNumber = generateOrderNumber();

  // Firestore transactions retry automatically on write conflicts (optimistic concurrency), which gives
  // the same atomic stock-check-and-decrement guarantee the old `pg_advisory_xact_lock` provided.
  const orderRef = ordersCol.doc();
  const couponRef = appliedCouponCode ? couponsCol.doc(appliedCouponCode) : null;
  await db.runTransaction(async (tx) => {
    const variantRefs = items.map((item) => variantRef(item.productId, item.variantId));
    const [variantSnaps, couponSnap] = await Promise.all([
      Promise.all(variantRefs.map((ref) => tx.get(ref))),
      couponRef ? tx.get(couponRef) : Promise.resolve(null),
    ]);

    for (let index = 0; index < items.length; index += 1) {
      const snap = variantSnaps[index];
      const item = items[index];
      const data = snap.exists ? (snap.data() as { stockQuantity: number } | undefined) : undefined;
      if (!snap.exists || !data || data.stockQuantity < item.quantity) {
        throw new CartValidationError(`${item.productName} just sold out. Please update your cart.`);
      }
    }

    // Reserving usage here (not at payment time) closes the race where many concurrent pending
    // orders all pass validateCoupon's pre-transaction usageCount read and then all pay —
    // reservation is atomic with the read-check here, same guarantee as the stock check above.
    // Released back on cancellation/expiry (see updateOrderStatus and the stale-order sweep).
    if (couponRef && couponSnap) {
      if (!couponSnap.exists) throw new CartValidationError("This coupon code is not valid.");
      const couponData = couponSnap.data() as { usageLimit: number | null; usageCount: number };
      if (couponData.usageLimit != null && couponData.usageCount >= couponData.usageLimit) {
        throw new CartValidationError("This coupon has reached its usage limit.");
      }
      tx.update(couponRef, { usageCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    }

    tx.set(orderRef, {
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
      currency: "INR",
      couponCode: appliedCouponCode,
      status: "pending",
      paymentStatus: "pending",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      notes: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (const item of items) {
      tx.set(itemsCol(orderRef.id).doc(), {
        orderId: orderRef.id,
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        variantLabel: item.variantLabel,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    variantRefs.forEach((ref, index) => {
      tx.update(ref, { stockQuantity: FieldValue.increment(-items[index].quantity), updatedAt: FieldValue.serverTimestamp() });
    });
  });

  const created = await orderRef.get();
  return fromOrderDoc(created);
}

export async function attachRazorpayOrder(orderId: string, razorpayOrderId: string) {
  await ordersCol.doc(orderId).update({ razorpayOrderId });
}

/** Idempotent per razorpayPaymentId. */
export async function markOrderPaid({ orderId, razorpayPaymentId }: { orderId: string; razorpayPaymentId: string }) {
  const ref = ordersCol.doc(orderId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new OrderNotFoundError("Order not found.");
    const existing = fromOrderDoc(snap);
    if (existing.paymentStatus === "paid") return { order: existing, justPaid: false };
    if (existing.paymentStatus !== "pending") return { order: existing, justPaid: false };

    // Coupon usageCount is reserved when the order is created (see createPendingOrder), not here —
    // incrementing it again on payment would double-count every order that used a coupon.
    tx.update(ref, { paymentStatus: "paid", status: "processing", razorpayPaymentId, updatedAt: FieldValue.serverTimestamp() });
    return { order: { ...existing, paymentStatus: "paid", status: "processing", razorpayPaymentId }, justPaid: true };
  });

  if (result.justPaid) await notifyOrderPaid(result.order).catch(() => {});
  const finalSnap = await ref.get();
  return fromOrderDoc(finalSnap);
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

export async function getOrderItems(orderId: string): Promise<GemstoneOrderItem[]> {
  const snap = await itemsCol(orderId).get();
  return snap.docs.map(fromItemDoc);
}

export async function getOrderById(orderId: string) {
  const snap = await ordersCol.doc(orderId).get();
  return snap.exists ? fromOrderDoc(snap) : null;
}

/** Scoped lookup for the confirmation page: must belong to the member, or match the guest email used at checkout. */
export async function getOrderByNumberScoped(orderNumber: string, { memberId, guestEmail }: { memberId?: string | null; guestEmail?: string | null }) {
  const snap = await ordersCol.where("orderNumber", "==", orderNumber).limit(1).get();
  if (snap.empty) return null;
  const order = fromOrderDoc(snap.docs[0]);
  const ownedByMember = memberId != null && order.memberId === memberId;
  const ownedByGuest = !order.memberId && guestEmail && order.guestEmail?.toLowerCase() === guestEmail.toLowerCase();
  if (!ownedByMember && !ownedByGuest) return null;
  return order;
}

export async function getOrdersForMember(memberId: string) {
  // Requires a composite index: gemstoneOrders (memberId ASC, createdAt DESC) — see firestore.indexes.json.
  const snap = await ordersCol.where("memberId", "==", memberId).orderBy("createdAt", "desc").get();
  return snap.docs.map(fromOrderDoc);
}

export async function getAllOrdersAdmin(status?: string) {
  await expireStalePendingOrders().catch((error) => console.error("Stale pending order sweep failed", error));
  if (status && status !== "all") {
    // Requires a composite index: gemstoneOrders (status ASC, createdAt DESC) — see firestore.indexes.json.
    const snap = await ordersCol.where("status", "==", status).orderBy("createdAt", "desc").get();
    return snap.docs.map(fromOrderDoc);
  }
  const snap = await ordersCol.orderBy("createdAt", "desc").get();
  return snap.docs.map(fromOrderDoc);
}

const CANCELLABLE_STATUSES = new Set(["pending", "processing"]);

export async function updateOrderStatus(orderId: string, status: string) {
  const ref = ordersCol.doc(orderId);
  const updated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new OrderNotFoundError("Order not found.");
    const existing = fromOrderDoc(snap);

    let itemDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let variantSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
    // A refund means the goods aren't shipping either, same as a cancellation — restore stock (and
    // the coupon reservation below) for both, not just "cancelled".
    const willRestoreStock = (status === "cancelled" || status === "refunded") && existing.status !== "cancelled" && existing.status !== "refunded";
    if (willRestoreStock) {
      if (status === "cancelled" && !CANCELLABLE_STATUSES.has(existing.status)) throw new CartValidationError("This order can no longer be cancelled.");
      const itemsSnap = await tx.get(itemsCol(orderId));
      itemDocs = itemsSnap.docs;
      variantSnaps = await Promise.all(itemDocs.map((doc) => {
        const item = doc.data() as { productId: string; variantId: string };
        return tx.get(variantRef(item.productId, item.variantId));
      }));
    }

    if (willRestoreStock && existing.couponCode) {
      // Mirrors the stock restore below — a cancelled order shouldn't count against a coupon's
      // usage limit or the customer's per-customer limit, since the reservation happened at
      // order-creation time (see createPendingOrder), not at payment.
      tx.update(couponsCol.doc(existing.couponCode), { usageCount: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() });
    }

    if (willRestoreStock) {
      itemDocs.forEach((doc, index) => {
        if (!variantSnaps[index].exists) return;
        const item = doc.data() as { productId: string; variantId: string; quantity: number };
        tx.update(variantRef(item.productId, item.variantId), { stockQuantity: FieldValue.increment(item.quantity), updatedAt: FieldValue.serverTimestamp() });
      });
    }

    tx.update(ref, {
      status,
      paymentStatus: status === "refunded" ? "refunded" : existing.paymentStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ...existing, status, paymentStatus: status === "refunded" ? "refunded" : existing.paymentStatus };
  });

  if (updated.memberId) {
    await createNotification({
      recipientType: "member",
      recipientId: updated.memberId,
      type: "gemstone_order.status",
      title: `Order ${updated.orderNumber} is now ${status}`,
      link: `/gemstones/order/${updated.orderNumber}`,
    }).catch(() => {});
  }

  const finalSnap = await ref.get();
  return fromOrderDoc(finalSnap);
}

export async function getGemstoneAdminStats() {
  const paidOrders = ordersCol.where("paymentStatus", "==", "paid");
  const revenueSnap = await paidOrders.aggregate({ revenue: AggregateField.sum("total"), paidCount: AggregateField.count() }).get();
  const revenueData = revenueSnap.data();

  const statuses = ["pending", "processing", "packed", "shipped", "delivered", "cancelled", "refunded"];
  const statusCountSnaps = await Promise.all(statuses.map((status) => ordersCol.where("status", "==", status).count().get()));
  const statusCounts = Object.fromEntries(statuses.map((status, index) => [status, statusCountSnaps[index].data().count]));

  // Requires a collection-group composite index: variants (active ASC, stockQuantity ASC) — see firestore.indexes.json.
  const lowStockSnap = await db.collectionGroup("variants").where("active", "==", true).where("stockQuantity", "<=", 5).count().get();

  return {
    revenue: Number(revenueData.revenue ?? 0),
    paidOrderCount: revenueData.paidCount ?? 0,
    statusCounts,
    lowStockVariantCount: lowStockSnap.data().count,
  };
}

export async function getLowStockVariants(threshold = 5) {
  // Requires a collection-group composite index: variants (active ASC, stockQuantity ASC) — see firestore.indexes.json.
  const snap = await db.collectionGroup("variants").where("active", "==", true).where("stockQuantity", "<=", threshold).orderBy("stockQuantity", "asc").get();
  if (snap.empty) return [];

  const productIds = [...new Set(snap.docs.map((doc) => (doc.data() as { productId: string }).productId))];
  const productSnaps = await db.getAll(...productIds.map((id) => productsCol.doc(id)));
  const productById = new Map(productSnaps.map((productSnap) => [productSnap.id, productSnap.data() as { name?: string; slug?: string } | undefined]));

  return snap.docs.map((doc) => {
    const data = doc.data() as { productId: string; label: string; stockQuantity: number };
    const product = productById.get(data.productId);
    return {
      variant: { id: doc.id, productId: data.productId, label: data.label, stockQuantity: data.stockQuantity },
      productName: product?.name ?? "Unknown product",
      productSlug: product?.slug ?? "",
    };
  });
}

export async function memberHasPurchasedProduct(memberId: string, productId: string) {
  // Requires a composite index: gemstoneOrders (memberId ASC, paymentStatus ASC) — see firestore.indexes.json.
  const ordersSnap = await ordersCol.where("memberId", "==", memberId).where("paymentStatus", "==", "paid").get();
  if (ordersSnap.empty) return null;

  for (const orderDoc of ordersSnap.docs) {
    const match = await itemsCol(orderDoc.id).where("productId", "==", productId).limit(1).get();
    if (!match.empty) return { id: orderDoc.id };
  }
  return null;
}
