import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// getStudioSettings() is wrapped in unstable_cache, which needs Next's
// incremental cache and throws outside a request. createPendingOrder only reads
// gstRate from it, and the GST split is not what this file covers, so stub it.
// Notifications and admin roles reach Firestore/Ably for the same reason.
vi.mock("@/lib/studio-settings", () => ({
  getStudioSettings: async () => ({ gstRate: 3, currency: "INR" }),
}));
vi.mock("@/lib/notifications", () => ({
  createNotification: async () => undefined,
  notifyAdmins: async () => undefined,
}));
vi.mock("@/lib/admin-roles", () => ({ getAdminIdsWithPermission: async () => [] }));
vi.mock("@/lib/email", () => ({
  isEmailConfigured: () => false,
  sendEmail: async () => undefined,
  genericNotificationEmailHtml: () => "<p></p>",
}));

import { closePgPool, query, withTransaction } from "@/lib/postgres";
import {
  CartValidationError,
  OrderNotFoundError,
  computeShippingFee,
  createPendingOrder,
  expireStalePendingOrders,
  getAllOrdersAdmin,
  getGemstoneAdminStats,
  getLowStockVariants,
  getOrderById,
  getOrderByNumberScoped,
  getOrderItems,
  getOrdersForMember,
  markOrderPaid,
  memberHasPurchasedProduct,
  priceCart,
  updateOrderStatus,
} from "@/lib/gemstone-orders";
import { claimRefundInSupabase } from "@/lib/gemstone-orders-supabase";

/**
 * Integration coverage for gemstone checkout and order lifecycle on Postgres.
 * Skipped unless SUPABASE_DB_URL points at a reachable database carrying the
 * migration schema, and additionally needs SUPABASE_CUTOVER=true.
 *
 *   SUPABASE_DB_URL=postgresql://... PGSSLMODE=disable SUPABASE_CUTOVER=true \
 *     npx vitest run src/lib/gemstone-orders.integration.test.ts
 *
 * The point of this file is the parts that cannot be unit tested: stock and
 * coupon reservation are read-check-write against a row, and the guarantee is
 * that a concurrent checkout cannot slip between the read and the write.
 */
const cutoverActive = Boolean(process.env.SUPABASE_DB_URL) && process.env.SUPABASE_CUTOVER === "true";
const describeCutover = cutoverActive ? describe : describe.skip;

const MEMBER = "member-orders-itest";
const GUEST_EMAIL = "guest-orders-itest@example.test";
const CATEGORY = "cat-orders-itest";
const P_RUBY = "prod-orders-ruby-itest";
const P_SOLD = "prod-orders-soldout-itest";
const V_RUBY = "var-orders-ruby-itest";
const V_SOLD = "var-orders-soldout-itest";
const COUPON = "ORDERS10";
const ONCE = "ORDERSONCE"; // no underscore: normalizeCode strips anything outside [A-Z0-9]

const SHIPPING = {
  name: "Asha Rao",
  phone: "9876500000",
  line1: "12 Test Street",
  city: "Delhi",
  state: "Delhi",
  pincode: "110001",
};

let orderIds: string[] = [];

async function cleanup() {
  if (orderIds.length) {
    await query(`delete from public.gemstone_order_items where order_id = any($1::text[])`, [orderIds]);
    await query(`delete from public.gemstone_orders where id = any($1::text[])`, [orderIds]);
  }
  orderIds = [];
  await query(
    `delete from public.gemstone_order_items where order_id in
       (select id from public.gemstone_orders where order_number like 'GEM-%ITEST%'
          or member_id = $1 or guest_email = $2)`,
    [MEMBER, GUEST_EMAIL],
  );
  await query(
    `delete from public.gemstone_orders where order_number like 'GEM-%ITEST%' or member_id = $1 or guest_email = $2`,
    [MEMBER, GUEST_EMAIL],
  );
  await query(`delete from public.gemstone_coupon_customer_usage where coupon_code in ($1, $2)`, [COUPON, ONCE]);
  await query(`delete from public.gemstone_coupons where id in ($1, $2)`, [COUPON, ONCE]);
  await query(`delete from public.gemstone_product_variants where id in ($1, $2)`, [V_RUBY, V_SOLD]);
  await query(`delete from public.gemstone_products where id in ($1, $2)`, [P_RUBY, P_SOLD]);
  await query(`delete from public.gemstone_categories where id = $1`, [CATEGORY]);
  await query(`delete from public.members where id = $1`, [MEMBER]);
  await query(`delete from public.studio_settings where id = $1`, ["main"]);
}

async function seed(variantStock = 5) {
  await cleanup();
  await query(`insert into public.studio_settings (id, gst_rate) values ('main', 3) on conflict (id) do nothing`);
  await query(`insert into public.members (id, name, email) values ($1, 'Order Member', 'member-orders-itest@example.test')`, [MEMBER]);
  await query(`insert into public.gemstone_categories (id, name, slug, description, sort_order, active)
               values ($1, 'Order Gems', 'order-gems-itest', '', 1, true)`, [CATEGORY]);
  await query(
    `insert into public.gemstone_products (id, category_id, name, slug, short_description, description,
        benefits, who_should_wear, recommended_zodiac, recommended_planets, origin, color, treatment,
        certification, certificate_url, currency, sku, featured, trending, bestseller, active)
     values ($1, $2, 'Test Ruby', 'orders-ruby-itest', 's', 'd', 'b', 'w', 'z', 'p', 'o', 'c', 't', 'cert',
             null, 'INR', 'SKU-ORD-RUBY', false, false, false, true),
            ($3, $2, 'Scarce Stone', 'orders-scarce-itest', 's', 'd', 'b', 'w', 'z', 'p', 'o', 'c', 't', 'cert',
             null, 'INR', 'SKU-ORD-SCARCE', false, false, false, true)`,
    [P_RUBY, CATEGORY, P_SOLD],
  );
  await query(
    `insert into public.gemstone_product_variants (id, product_id, label, weight_carat, weight_ratti,
        certification_level, price, compare_at_price, stock_quantity, sku, active)
     values ($1, $2, '1 carat', '1.0', '1.1', 'GIA', 3000, null, $3, 'VSKU-ORD-RUBY', true),
            ($4, $5, '2 carat', '2.0', '2.2', 'GIA', 8000, null, 4, 'VSKU-ORD-SCARCE', true)`,
    [V_RUBY, P_RUBY, variantStock, V_SOLD, P_SOLD],
  );
  await query(
    `insert into public.gemstone_coupons
       (id, code, description, discount_type, discount_value, min_order_amount, max_discount_amount,
        usage_limit, usage_count, per_customer_limit, starts_at, expires_at, active, created_at, updated_at)
     values ($1, $1, '10% off', 'percent', 10, 0, 500, 10, 0, null, null, null, true, now(), now()),
            ($2, $2, 'Once each', 'flat', 100, 0, null, null, 0, 1, null, null, true, now(), now())`,
    [COUPON, ONCE],
  );
}

const line = (productId: string, variantId: string, quantity: number) => ({ productId, variantId, quantity });
const rubyLine = (quantity = 1) => line(P_RUBY, V_RUBY, quantity);

async function stockOf(variantId: string) {
  const { rows } = await query(`select stock_quantity from public.gemstone_product_variants where id = $1`, [variantId]);
  return Number(rows[0].stock_quantity);
}

async function couponUsage(code: string) {
  const { rows } = await query(`select usage_count from public.gemstone_coupons where id = $1`, [code]);
  return Number(rows[0].usage_count);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Holds a row lock in a separate transaction until the returned release() is
 * called, so a test can prove the code under test actually waits for it.
 *
 * The "fire N concurrent checkouts" style of test cannot prove this: the requests
 * serialise on pool contention by accident and the suite stays green with the
 * lock deleted. Holding the lock and asserting the caller has NOT finished is the
 * only deterministic check. */
async function holdLockFor(sql: string, params: unknown[]) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const done = withTransaction(async (client) => {
    await client.query(sql, params);
    await gate;
  });
  // Let the holder get there before the caller under test starts.
  await sleep(75);
  return { done, release };
}

/** Keeps every order this test creates reachable for cleanup, including the ones
 * a concurrent test expects to fail. */
function track<T extends { id: string }>(order: T): T {
  orderIds.push(order.id);
  return order;
}

describeCutover("gemstone cart pricing on Postgres", () => {
  // 25 units, so asserting the quantity clamp at 20 does not trip the
  // out-of-stock rule first.
  beforeEach(() => seed(25));
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("prices from the database and clamps quantity into 1..20", async () => {
    const { items, subtotal } = await priceCart([rubyLine(3)]);
    expect(items[0].unitPrice).toBe(3000);
    expect(typeof items[0].unitPrice).toBe("number");
    expect(items[0].lineTotal).toBe(9000);
    expect(subtotal).toBe(9000);

    expect((await priceCart([rubyLine(0)])).items[0].quantity).toBe(1);
    expect((await priceCart([rubyLine(999)])).items[0].quantity).toBe(20);
  });

  it("rejects a variant that does not exist, and one that is out of stock", async () => {
    await expect(priceCart([line(P_RUBY, "var-does-not-exist", 1)])).rejects.toThrow(/no longer available/);
    // The clamp caps a line at 20, so out-of-stock needs fewer than 20 on hand.
    await query(`update public.gemstone_product_variants set stock_quantity = 5 where id = $1`, [V_RUBY]);
    await expect(priceCart([rubyLine(6)])).rejects.toThrow(/Only 5 left/);
  });

  it("charges shipping below the threshold and not above it", () => {
    expect(computeShippingFee(1999)).toBe(99);
    expect(computeShippingFee(2000)).toBe(0);
  });
});

describeCutover("gemstone checkout on Postgres", () => {
  beforeEach(() => seed(5));
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("creates a pending order, writes its items and reserves the stock", async () => {
    const order = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(2)] }));
    expect(order.status).toBe("pending");
    expect(order.paymentStatus).toBe("pending");
    expect(order.currency).toBe("INR");
    expect(order.total).toBe(6000 + 0); // 6000 subtotal clears the free-shipping threshold
    expect(order.createdAt).toBeInstanceOf(Date);
    expect(order.orderNumber.startsWith("GEM-")).toBe(true);

    const items = await getOrderItems(order.id);
    expect(items).toHaveLength(1);
    expect(items[0].productName).toBe("Test Ruby");
    expect(items[0].lineTotal).toBe(6000);
    expect(typeof items[0].unitPrice).toBe("number");

    expect(await stockOf(V_RUBY)).toBe(3);
  });

  it("reserves coupon usage and the per-customer count at creation, not at payment", async () => {
    const order = track(await createPendingOrder({
      memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)], couponCode: ONCE,
    }));
    expect(order.discount).toBe(100);
    expect(order.couponCode).toBe(ONCE);
    expect(await couponUsage(ONCE)).toBe(1);

    const { rows } = await query(
      `select usage_count from public.gemstone_coupon_customer_usage where id = $1`,
      [`${ONCE}_${MEMBER}`],
    );
    expect(Number(rows[0].usage_count)).toBe(1);

    // The same customer cannot take the once-per-customer coupon twice.
    await expect(createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)], couponCode: ONCE }))
      .rejects.toThrow(/maximum number of times/);
  });

  it("honours a coupon's total usage limit", async () => {
    await query(`update public.gemstone_coupons set usage_count = 10 where id = $1`, [COUPON]);
    await expect(createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)], couponCode: COUPON }))
      .rejects.toThrow(/usage limit/);
  });

  it("lets exactly one concurrent checkout take the last units, never more", async () => {
    // 5 units, 6 simultaneous checkouts of one unit each. The stock check and the
    // decrement happen under a row lock, so exactly 5 win and the sixth is told
    // the item sold out. Without the lock all 6 can read stock >= 1 and all 6
    // decrement, ending at -1 while selling a unit that does not exist.
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, () => createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] })),
    );
    for (const attempt of attempts) {
      if (attempt.status === "fulfilled") track(attempt.value);
    }
    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected");

    expect(succeeded).toHaveLength(5);
    expect(failed).toHaveLength(1);
    for (const attempt of failed) {
      expect((attempt as PromiseRejectedResult).reason).toBeInstanceOf(CartValidationError);
      expect((attempt as PromiseRejectedResult).reason.message).toMatch(/sold out/);
    }
    expect(await stockOf(V_RUBY)).toBe(0); // all five units sold, never below
  });

  it("waits for the variant row lock rather than racing the holder", async () => {
    const holder = await holdLockFor(
      `select id from public.gemstone_product_variants where id = $1 for update`,
      [V_RUBY],
    );

    let settled = false;
    const checkout = createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] })
      .then((order) => { track(order); settled = true; return order; });

    // 300ms is far longer than the insert takes unlocked. Still running means the
    // checkout is blocked on the row the holder has locked.
    await sleep(300);
    expect(settled).toBe(false);

    holder.release();
    await holder.done;
    await checkout;
    expect(await stockOf(V_RUBY)).toBe(4);
  });
});

describeCutover("gemstone order lifecycle on Postgres", () => {
  beforeEach(() => seed(5));
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("marks an order paid exactly once", async () => {
    const order = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] }));

    const paid = await markOrderPaid({ orderId: order.id, razorpayPaymentId: "pay_itest_1" });
    expect(paid.paymentStatus).toBe("paid");
    expect(paid.status).toBe("processing");

    // A webhook retry must not re-confirm or re-notify.
    const again = await markOrderPaid({ orderId: order.id, razorpayPaymentId: "pay_itest_1" });
    expect(again.paymentStatus).toBe("paid");
    expect(again.razorpayPaymentId).toBe("pay_itest_1");
  });

  it("records a payment on a cancelled order without reviving it", async () => {
    const order = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] }));
    const stockAfterCancel = await (async () => {
      await updateOrderStatus(order.id, "cancelled");
      return stockOf(V_RUBY);
    })();
    expect(stockAfterCancel).toBe(5); // the hold was released

    const paid = await markOrderPaid({ orderId: order.id, razorpayPaymentId: "pay_itest_late" });
    expect(paid.paymentStatus).toBe("paid");
    expect(paid.status).toBe("cancelled"); // still cancelled, flagged for a human
  });

  it("restores stock and coupon usage on cancellation, but only once", async () => {
    const order = track(await createPendingOrder({
      memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(2)], couponCode: COUPON,
    }));
    expect(await stockOf(V_RUBY)).toBe(3);
    expect(await couponUsage(COUPON)).toBe(1);

    await updateOrderStatus(order.id, "cancelled");
    expect(await stockOf(V_RUBY)).toBe(5);
    expect(await couponUsage(COUPON)).toBe(0);

    // A second cancel is a no-op, not an error: the CANCELLABLE_STATUSES check
    // lives inside the willRestoreStock block, which is skipped once the status is
    // already cancelled (same in the Firestore path). The invariant is that the
    // release does not happen twice.
    await updateOrderStatus(order.id, "cancelled");
    expect(await stockOf(V_RUBY)).toBe(5);
    expect(await couponUsage(COUPON)).toBe(0);
  });

  it("refuses to refund an order that was never paid", async () => {
    const order = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] }));
    await expect(updateOrderStatus(order.id, "refunded")).rejects.toThrow(/Only paid orders can be refunded/);
  });

  it("lets exactly one concurrent caller claim a refund", async () => {
    const order = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] }));
    await markOrderPaid({ orderId: order.id, razorpayPaymentId: "pay_itest_claim" });

    // The claim is what stops a double-clicked admin action firing two real
    // Razorpay refunds. Exactly one caller may see alreadyClaimed === false.
    // Enough concurrent callers that several of their unlocked reads would
    // overlap if the row were not locked first.
    const claims = await Promise.allSettled(
      Array.from({ length: 12 }, () => claimRefundInSupabase(order.id)),
    );
    const won = claims
      .filter((c): c is PromiseFulfilledResult<Awaited<ReturnType<typeof claimRefundInSupabase>>> => c.status === "fulfilled")
      .filter((c) => c.value.alreadyClaimed === false);
    expect(won).toHaveLength(1);

    const { rows } = await query(`select refund_claimed_at from public.gemstone_orders where id = $1`, [order.id]);
    expect(rows[0].refund_claimed_at).toBeInstanceOf(Date);
  });


  it("expires a pending order older than the TTL and leaves a fresh one alone", async () => {
    const stale = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] }));
    const fresh = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] }));
    await query(`update public.gemstone_orders set created_at = now() - interval '1 hour' where id = $1`, [stale.id]);

    const before = await stockOf(V_RUBY);
    await expireStalePendingOrders();

    expect((await getOrderById(stale.id))?.status).toBe("cancelled");
    expect((await getOrderById(fresh.id))?.status).toBe("pending");
    expect(await stockOf(V_RUBY)).toBe(before + 1); // only the stale order's unit came back
  });
});

describeCutover("gemstone order reads on Postgres", () => {
  beforeEach(() => seed(5));
  afterAll(async () => { await cleanup(); await closePgPool(); });

  it("scopes an order lookup to its member or its guest email", async () => {
    const memberOrder = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] }));
    const guestOrder = track(await createPendingOrder({
      memberId: null, guestName: "Guest", guestEmail: GUEST_EMAIL, shipping: SHIPPING, lines: [rubyLine(1)],
    }));

    expect((await getOrderByNumberScoped(memberOrder.orderNumber, { memberId: MEMBER }))?.id).toBe(memberOrder.id);
    // Someone else's member id must not see it.
    expect(await getOrderByNumberScoped(memberOrder.orderNumber, { memberId: "member-someone-else" })).toBeNull();
    expect(await getOrderByNumberScoped(memberOrder.orderNumber, { guestEmail: GUEST_EMAIL })).toBeNull();

    expect((await getOrderByNumberScoped(guestOrder.orderNumber, { guestEmail: GUEST_EMAIL.toUpperCase() }))?.id)
      .toBe(guestOrder.id);
    expect(await getOrderByNumberScoped(guestOrder.orderNumber, { guestEmail: "other@example.test" })).toBeNull();
  });

  it("lists a member's orders newest first and filters the admin list by status", async () => {
    const first = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] }));
    await query(`update public.gemstone_orders set created_at = now() - interval '2 hours' where id = $1`, [first.id]);
    const second = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] }));
    await markOrderPaid({ orderId: second.id, razorpayPaymentId: "pay_itest_list" });

    const mine = await getOrdersForMember(MEMBER);
    expect(mine.map((order) => order.id)).toEqual([second.id, first.id]);

    const processing = await getAllOrdersAdmin("processing");
    expect(processing.map((order) => order.id)).toContain(second.id);
    expect(processing.every((order) => order.status === "processing")).toBe(true);
  });

  it("aggregates admin stats in one pass", async () => {
    // The aggregate covers the whole table, so compare against a baseline rather
    // than asserting absolutes other tests' leftovers would break.
    const before = await getGemstoneAdminStats();
    const order = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] }));
    expect((await getGemstoneAdminStats()).statusCounts.pending).toBe(before.statusCounts.pending + 1);

    await markOrderPaid({ orderId: order.id, razorpayPaymentId: "pay_itest_stats" });

    const stats = await getGemstoneAdminStats();
    expect(typeof stats.revenue).toBe("number");
    expect(stats.revenue).toBe(before.revenue + 3000);
    expect(stats.paidOrderCount).toBe(before.paidOrderCount + 1);
    expect(stats.statusCounts.processing).toBe(before.statusCounts.processing + 1);
    expect(stats.statusCounts.pending).toBe(before.statusCounts.pending);

    // Counts the whole table, so compare against the same query rather than a
    // hardcoded number the seed happens to change.
    const { rows: lowStock } = await query(
      `select count(*)::int as count from public.gemstone_product_variants where active and stock_quantity <= 5`,
    );
    expect(stats.lowStockVariantCount).toBe(Number(lowStock[0].count));
    expect(stats.lowStockVariantCount).toBeGreaterThan(0);
  });

  it("lists low-stock variants with their product", async () => {
    await query(`update public.gemstone_product_variants set stock_quantity = 2 where id = $1`, [V_RUBY]);
    const low = await getLowStockVariants(5);
    const ruby = low.find((entry) => entry.variant.id === V_RUBY);
    expect(ruby?.variant.stockQuantity).toBe(2);
    expect(ruby?.productName).toBe("Test Ruby");
    expect(ruby?.productSlug).toBe("orders-ruby-itest");
    // Sorted by stock ascending, so nothing above the threshold appears.
    expect(low.every((entry) => entry.variant.stockQuantity <= 5)).toBe(true);
  });

  it("reports whether a member has already bought a product", async () => {
    expect(await memberHasPurchasedProduct(MEMBER, P_RUBY)).toBeNull();
    const order = track(await createPendingOrder({ memberId: MEMBER, shipping: SHIPPING, lines: [rubyLine(1)] }));
    // Unpaid does not count.
    expect(await memberHasPurchasedProduct(MEMBER, P_RUBY)).toBeNull();
    await markOrderPaid({ orderId: order.id, razorpayPaymentId: "pay_itest_bought" });
    expect((await memberHasPurchasedProduct(MEMBER, P_RUBY))?.id).toBe(order.id);
    expect(await memberHasPurchasedProduct(MEMBER, P_SOLD)).toBeNull();
  });

  it("throws OrderNotFoundError for an order that does not exist", async () => {
    await expect(markOrderPaid({ orderId: "no-such-order", razorpayPaymentId: "x" })).rejects.toThrow(OrderNotFoundError);
    await expect(updateOrderStatus("no-such-order", "shipped")).rejects.toThrow(OrderNotFoundError);
  });
});
