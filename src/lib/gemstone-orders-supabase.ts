import "server-only";

import { randomUUID } from "node:crypto";

import { query, withTransaction } from "@/lib/postgres";

/**
 * Supabase/Postgres data access for gemstone orders and checkout.
 *
 * Data access plus the atomicity that the datastore has to provide — stock
 * reservation, coupon usage reservation and the refund claim all have to be
 * read-check-write against a row nobody else can touch mid-flight. The business
 * rules around them (what a status transition means, when stock is restored,
 * which notifications fire) stay in `gemstone-orders.ts`.
 *
 * Where a Firestore transaction gave automatic retry on write conflict, this
 * uses `select ... for update`: Postgres blocks the second writer instead of
 * restarting the first, which is the same guarantee for a single row and does
 * not need the caller to be idempotent under retry.
 */

export type OrderRow = {
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

export type OrderItemRow = {
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

const ORDER_COLUMNS = `
  id, order_number, member_id, guest_name, guest_email::text as guest_email, guest_phone,
  shipping_name, shipping_phone, shipping_line1, shipping_line2, shipping_city, shipping_state,
  shipping_pincode, shipping_country, subtotal, discount, shipping_fee, tax, total, currency,
  coupon_code, status, payment_status, razorpay_order_id, razorpay_payment_id, notes,
  refund_claimed_at, created_at, updated_at`;

type OrderSqlRow = {
  id: string;
  order_number: string;
  member_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  shipping_name: string | null;
  shipping_phone: string | null;
  shipping_line1: string | null;
  shipping_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_pincode: string | null;
  shipping_country: string | null;
  subtotal: string | number | null;
  discount: string | number | null;
  shipping_fee: string | number | null;
  tax: string | number | null;
  total: string | number | null;
  currency: string | null;
  coupon_code: string | null;
  status: string | null;
  payment_status: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  notes: string | null;
  refund_claimed_at: Date | null;
  created_at: Date | null;
  updated_at: Date | null;
};

type ItemSqlRow = {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  product_name: string | null;
  variant_label: string | null;
  unit_price: string | number | null;
  quantity: number | null;
  line_total: string | number | null;
  created_at: Date | null;
};

/** `client.query` never applies rowToCamel — not even for `returning` — so every
 * row this module produces is mapped here rather than read positionally. */
export function orderRowFromSql(row: OrderSqlRow): OrderRow & { refundClaimedAt: Date | null } {
  return {
    id: row.id,
    orderNumber: row.order_number,
    memberId: row.member_id,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    shippingName: row.shipping_name ?? "",
    shippingPhone: row.shipping_phone ?? "",
    shippingLine1: row.shipping_line1 ?? "",
    shippingLine2: row.shipping_line2,
    shippingCity: row.shipping_city ?? "",
    shippingState: row.shipping_state ?? "",
    shippingPincode: row.shipping_pincode ?? "",
    shippingCountry: row.shipping_country ?? "India",
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    shippingFee: Number(row.shipping_fee ?? 0),
    tax: Number(row.tax ?? 0),
    total: Number(row.total ?? 0),
    currency: row.currency ?? "INR",
    couponCode: row.coupon_code,
    status: row.status ?? "pending",
    paymentStatus: row.payment_status ?? "pending",
    razorpayOrderId: row.razorpay_order_id,
    razorpayPaymentId: row.razorpay_payment_id,
    notes: row.notes,
    refundClaimedAt: row.refund_claimed_at,
    createdAt: row.created_at ?? new Date(),
    updatedAt: row.updated_at ?? new Date(),
  };
}

function itemRowFromSql(row: ItemSqlRow): OrderItemRow {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    variantId: row.variant_id,
    productName: row.product_name ?? "",
    variantLabel: row.variant_label ?? "",
    unitPrice: Number(row.unit_price ?? 0),
    quantity: Number(row.quantity ?? 0),
    lineTotal: Number(row.line_total ?? 0),
    createdAt: row.created_at ?? new Date(),
  };
}

const ITEM_SELECT = `
  select id, order_id, product_id, variant_id, product_name, variant_label, unit_price,
         quantity, line_total, created_at
    from public.gemstone_order_items`;

// ---------------------------------------------------------------- reads

export async function getOrderByIdInSupabase(orderId: string) {
  const rows = await query<OrderSqlRow>(`select ${ORDER_COLUMNS} from public.gemstone_orders where id = $1`, [orderId]);
  return rows.rows[0] ? orderRowFromSql(rows.rows[0]) : null;
}

export async function getOrderByNumberInSupabase(orderNumber: string) {
  const rows = await query<OrderSqlRow>(
    `select ${ORDER_COLUMNS} from public.gemstone_orders where order_number = $1 limit 1`,
    [orderNumber],
  );
  return rows.rows[0] ? orderRowFromSql(rows.rows[0]) : null;
}

export async function getOrderItemsInSupabase(orderId: string): Promise<OrderItemRow[]> {
  const rows = await query<ItemSqlRow>(`${ITEM_SELECT} where order_id = $1`, [orderId]);
  return rows.rows.map(itemRowFromSql);
}

export async function getOrdersForMemberInSupabase(memberId: string) {
  const rows = await query<OrderSqlRow>(
    `select ${ORDER_COLUMNS} from public.gemstone_orders where member_id = $1 order by created_at desc`,
    [memberId],
  );
  return rows.rows.map(orderRowFromSql);
}

export async function getOrdersForAdminInSupabase(status?: string) {
  const rows = status && status !== "all"
    ? await query<OrderSqlRow>(
        `select ${ORDER_COLUMNS} from public.gemstone_orders where status = $1 order by created_at desc`,
        [status],
      )
    : await query<OrderSqlRow>(`select ${ORDER_COLUMNS} from public.gemstone_orders order by created_at desc`);
  return rows.rows.map(orderRowFromSql);
}

/** Pending orders older than the cutoff, oldest first, capped — the stale sweep. */
export async function getStalePendingOrdersInSupabase(cutoff: Date, limit: number) {
  const rows = await query<OrderSqlRow>(
    `select ${ORDER_COLUMNS} from public.gemstone_orders
      where status = 'pending' and created_at < $1
      order by created_at asc
      limit $2`,
    [cutoff, limit],
  );
  return rows.rows.map(orderRowFromSql);
}

/**
 * Revenue and status counts in one pass. The Firestore version ran one
 * aggregate plus seven separate `count()` calls; a single conditional aggregate
 * scan replaces all eight.
 */
export async function getGemstoneAdminStatsInSupabase() {
  const rows = await query<{
    revenue: string | number;
    paid_order_count: number;
    pending: number; processing: number; packed: number; shipped: number;
    delivered: number; cancelled: number; refunded: number;
  }>(
    `select coalesce(sum(total) filter (where payment_status = 'paid'), 0)::numeric as revenue,
            count(*) filter (where payment_status = 'paid')::int as paid_order_count,
            count(*) filter (where status = 'pending')::int    as pending,
            count(*) filter (where status = 'processing')::int as processing,
            count(*) filter (where status = 'packed')::int     as packed,
            count(*) filter (where status = 'shipped')::int    as shipped,
            count(*) filter (where status = 'delivered')::int  as delivered,
            count(*) filter (where status = 'cancelled')::int  as cancelled,
            count(*) filter (where status = 'refunded')::int   as refunded
       from public.gemstone_orders`,
  );
  const stats = rows.rows[0];
  const lowStock = await query<{ count: number }>(
    `select count(*)::int as count from public.gemstone_product_variants where active and stock_quantity <= 5`,
  );
  return {
    revenue: Number(stats?.revenue ?? 0),
    paidOrderCount: Number(stats?.paid_order_count ?? 0),
    statusCounts: {
      pending: Number(stats?.pending ?? 0),
      processing: Number(stats?.processing ?? 0),
      packed: Number(stats?.packed ?? 0),
      shipped: Number(stats?.shipped ?? 0),
      delivered: Number(stats?.delivered ?? 0),
      cancelled: Number(stats?.cancelled ?? 0),
      refunded: Number(stats?.refunded ?? 0),
    },
    lowStockVariantCount: Number(lowStock.rows[0]?.count ?? 0),
  };
}

export async function getLowStockVariantsInSupabase(threshold: number) {
  const rows = await query<{
    id: string; product_id: string; label: string | null; stock_quantity: number | null;
    name: string | null; slug: string | null;
  }>(
    `select v.id, v.product_id, v.label, v.stock_quantity, p.name, p.slug
       from public.gemstone_product_variants v
       left join public.gemstone_products p on p.id = v.product_id
      where v.active and v.stock_quantity <= $1
      order by v.stock_quantity asc`,
    [threshold],
  );
  return rows.rows.map((row) => ({
    variant: {
      id: row.id,
      productId: row.product_id,
      label: row.label ?? "",
      stockQuantity: Number(row.stock_quantity ?? 0),
    },
    productName: row.name ?? "Unknown product",
    productSlug: row.slug ?? "",
  }));
}

/** One paid order by this member containing this product, or null. Replaces a
 * query plus a per-order subcollection scan. */
export async function getMemberPaidOrderIdForProductInSupabase(memberId: string, productId: string) {
  const rows = await query<{ id: string }>(
    `select o.id
       from public.gemstone_orders o
       join public.gemstone_order_items i on i.order_id = o.id
      where o.member_id = $1 and o.payment_status = 'paid' and i.product_id = $2
      limit 1`,
    [memberId, productId],
  );
  return rows.rows[0] ? { id: rows.rows[0].id } : null;
}

export async function getMemberContactInSupabase(memberId: string) {
  const rows = await query<{ name: string | null; email: string | null }>(
    `select name, email::text as email from public.members where id = $1`,
    [memberId],
  );
  const row = rows.rows[0];
  return row ? { name: row.name ?? undefined, email: row.email ?? undefined } : null;
}

// ------------------------------------------------------------ cart pricing

export type CartVariantRow = {
  variantId: string;
  productId: string;
  label: string;
  price: number;
  stockQuantity: number;
  variantActive: boolean;
  productName: string | null;
  productActive: boolean | null;
};

/**
 * Every variant in the cart in one query, joined to its product. The caller
 * still owns the availability rules; `productName`/`productActive` are null when
 * the product row is gone, which the caller treats as unavailable.
 */
export async function getCartVariantsInSupabase(variantIds: string[]): Promise<Map<string, CartVariantRow>> {
  if (!variantIds.length) return new Map();
  const rows = await query<{
    variant_id: string; product_id: string; label: string | null; price: string | number | null;
    stock_quantity: number | null; variant_active: boolean | null; name: string | null; active: boolean | null;
  }>(
    `select v.id as variant_id, v.product_id, v.label, v.price, v.stock_quantity,
            v.active as variant_active, p.name, p.active
       from public.gemstone_product_variants v
       left join public.gemstone_products p on p.id = v.product_id
      where v.id = any($1::text[])`,
    [variantIds],
  );
  return new Map(rows.rows.map((row) => [row.variant_id, {
    variantId: row.variant_id,
    productId: row.product_id,
    label: row.label ?? "",
    price: Number(row.price ?? 0),
    stockQuantity: Number(row.stock_quantity ?? 0),
    variantActive: row.variant_active ?? true,
    productName: row.name,
    productActive: row.active,
  }]));
}

// ------------------------------------------------------- checkout conflicts

export type CheckoutConflictCode =
  | "sold_out"
  | "coupon_invalid"
  | "coupon_limit"
  | "coupon_customer_limit";

/** Thrown from inside the checkout transaction. `gemstone-orders.ts` maps these
 * onto `CartValidationError` with the customer-facing message, so the wording
 * stays with the rest of the checkout rules. */
export class CheckoutConflictError extends Error {
  constructor(readonly code: CheckoutConflictCode, readonly productName?: string) {
    super(code);
  }
}

export type PendingOrderInput = {
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
  couponCode: string | null;
  items: {
    productId: string;
    variantId: string;
    productName: string;
    variantLabel: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  /** Null when the coupon has no per-customer cap. */
  couponPerCustomerLimit: number | null;
  /** Member id or lowercased guest email; null for an anonymous guest. */
  couponCustomerIdentifier: string | null;
};

/**
 * Creates a pending order and reserves its stock and coupon usage atomically.
 *
 * Lock order matters: variants are locked ordered by id so two overlapping
 * checkouts sharing any variant cannot deadlock. The coupon row is locked after
 * the variants, and the per-customer usage row last — every caller takes them in
 * that same order.
 *
 * Reservation happens here, at creation, not at payment. That is deliberate and
 * matches the Firestore behaviour: without it, N concurrent checkouts could all
 * pass `validateCoupon`'s unlocked read and all pay, overselling both the stock
 * and the coupon.
 */
export async function insertPendingOrderInSupabase(input: PendingOrderInput) {
  const orderId = randomUUID();
  const now = new Date();

  return withTransaction(async (client) => {
    const variantIds = input.items.map((item) => item.variantId);
    const locked = await client.query<{ id: string; stock_quantity: number | null }>(
      `select id, stock_quantity from public.gemstone_product_variants
        where id = any($1::text[]) order by id for update`,
      [variantIds],
    );
    const stockById = new Map(locked.rows.map((row) => [row.id, Number(row.stock_quantity ?? 0)]));

    for (const item of input.items) {
      const stock = stockById.get(item.variantId);
      if (stock === undefined || stock < item.quantity) {
        throw new CheckoutConflictError("sold_out", item.productName);
      }
    }

    if (input.couponCode) {
      const coupon = await client.query<{ exists: boolean; usage_limit: number | null; usage_count: number | null }>(
        `select true as exists, usage_limit, usage_count from public.gemstone_coupons
          where id = $1 for update`,
        [input.couponCode],
      );
      if (!coupon.rows[0]) throw new CheckoutConflictError("coupon_invalid");
      const { usage_limit: usageLimit, usage_count: usageCount } = coupon.rows[0];
      if (usageLimit != null && Number(usageCount ?? 0) >= Number(usageLimit)) {
        throw new CheckoutConflictError("coupon_limit");
      }
      await client.query(
        `update public.gemstone_coupons set usage_count = usage_count + 1, updated_at = now() where id = $1`,
        [input.couponCode],
      );
    }

    if (input.couponCode && input.couponCustomerIdentifier && input.couponPerCustomerLimit != null) {
      const usageId = `${input.couponCode}_${input.couponCustomerIdentifier}`;
      const existing = await client.query<{ usage_count: number | null }>(
        `select usage_count from public.gemstone_coupon_customer_usage where id = $1 for update`,
        [usageId],
      );
      const usedCount = existing.rows[0] ? Number(existing.rows[0].usage_count ?? 0) : 0;
      if (usedCount >= input.couponPerCustomerLimit) {
        throw new CheckoutConflictError("coupon_customer_limit");
      }
      await client.query(
        `insert into public.gemstone_coupon_customer_usage
           (id, coupon_code, customer_identifier, usage_count, created_at, updated_at)
         values ($1, $2, $3, 1, now(), now())
         on conflict (id) do update set usage_count = public.gemstone_coupon_customer_usage.usage_count + 1,
                                        updated_at = now()`,
        [usageId, input.couponCode, input.couponCustomerIdentifier],
      );
    }

    const order = await client.query<OrderSqlRow>(
      `insert into public.gemstone_orders
         (id, order_number, member_id, guest_name, guest_email, guest_phone, shipping_name, shipping_phone,
          shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_pincode, shipping_country,
          subtotal, discount, shipping_fee, tax, total, currency, coupon_code, status, payment_status,
          razorpay_order_id, razorpay_payment_id, notes, refund_claimed_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'INR',$20,'pending','pending',
               null, null, null, null, $21, $21)
       returning ${ORDER_COLUMNS}`,
      [
        orderId, input.orderNumber, input.memberId, input.guestName, input.guestEmail, input.guestPhone,
        input.shippingName, input.shippingPhone, input.shippingLine1, input.shippingLine2, input.shippingCity,
        input.shippingState, input.shippingPincode, input.shippingCountry, input.subtotal, input.discount,
        input.shippingFee, input.tax, input.total, input.couponCode, now,
      ],
    );

    for (const item of input.items) {
      await client.query(
        `insert into public.gemstone_order_items
           (id, order_id, product_id, variant_id, product_name, variant_label, unit_price, quantity,
            line_total, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          randomUUID(), orderId, item.productId, item.variantId, item.productName, item.variantLabel,
          item.unitPrice, item.quantity, item.lineTotal, now,
        ],
      );
    }

    for (const item of input.items) {
      await client.query(
        `update public.gemstone_product_variants
            set stock_quantity = stock_quantity - $2, updated_at = now()
          where id = $1`,
        [item.variantId, item.quantity],
      );
    }

    const row = order.rows[0];
    if (!row) throw new Error("insertPendingOrderInSupabase returned no row");
    return orderRowFromSql(row);
  });
}

export async function attachRazorpayOrderInSupabase(orderId: string, razorpayOrderId: string) {
  await query(`update public.gemstone_orders set razorpay_order_id = $2, updated_at = now() where id = $1`, [
    orderId,
    razorpayOrderId,
  ]);
}

export type MarkPaidResult = {
  order: OrderRow & { refundClaimedAt: Date | null };
  justPaid: boolean;
  revivedCancelled: boolean;
};

/**
 * Idempotent per call: an order that is already paid, or was never pending, comes
 * back with `justPaid: false` and nothing is written.
 *
 * A payment landing on an order the stale sweep already cancelled is recorded but
 * NOT revived — the stock it reserved has been released and may be sold to
 * someone else. `revivedCancelled` is the caller's cue to alert a human rather
 * than confirm the order.
 */
export async function markOrderPaidInSupabase(orderId: string, razorpayPaymentId: string): Promise<MarkPaidResult> {
  return withTransaction(async (client) => {
    const locked = await client.query<OrderSqlRow>(
      `select ${ORDER_COLUMNS} from public.gemstone_orders where id = $1 for update`,
      [orderId],
    );
    const row = locked.rows[0];
    if (!row) throw new OrderMutationError("not_found");
    const existing = orderRowFromSql(row);

    if (existing.paymentStatus === "paid") return { order: existing, justPaid: false, revivedCancelled: false };
    if (existing.paymentStatus !== "pending") return { order: existing, justPaid: false, revivedCancelled: false };

    const revivedCancelled = existing.status === "cancelled";
    const updated = await client.query<OrderSqlRow>(
      revivedCancelled
        ? `update public.gemstone_orders
              set payment_status = 'paid', razorpay_payment_id = $2, updated_at = now()
            where id = $1 returning ${ORDER_COLUMNS}`
        : `update public.gemstone_orders
              set payment_status = 'paid', status = 'processing', razorpay_payment_id = $2, updated_at = now()
            where id = $1 returning ${ORDER_COLUMNS}`,
      [orderId, razorpayPaymentId],
    );
    const next = updated.rows[0];
    if (!next) throw new OrderMutationError("not_found");
    return { order: orderRowFromSql(next), justPaid: true, revivedCancelled };
  });
}

export type OrderMutationCode = "not_found" | "not_cancellable" | "not_paid";

export class OrderMutationError extends Error {
  constructor(readonly code: OrderMutationCode) {
    super(code);
  }
}

export type RefundClaim = {
  alreadyClaimed: boolean;
  existing: OrderRow & { refundClaimedAt: Date | null };
};

/**
 * Claims the right to refund. Returns `alreadyClaimed: true` when someone else
 * already did, in which case the caller must NOT call Razorpay again.
 *
 * The claim is the `refund_claimed_at` column added in migration 0005. It is the
 * only thing standing between a double-clicked admin action and two real refunds
 * for one order.
 */
export async function claimRefundInSupabase(orderId: string): Promise<RefundClaim> {
  // One atomic conditional update rather than "select for update, check, update".
  // The predicate is the claim: whichever statement actually changes the row owns
  // the refund, and every other concurrent caller gets rowCount 0 from the same
  // statement. A read-then-write here could not be tested for the race, because
  // the callers serialise on connection acquisition and the window never opens —
  // this way there is no window to open.
  const claimed = await query<OrderSqlRow>(
    `update public.gemstone_orders
        set refund_claimed_at = now()
      where id = $1
        and payment_status = 'paid'
        and status <> 'refunded'
        and refund_claimed_at is null
      returning ${ORDER_COLUMNS}`,
    [orderId],
  );
  const won = claimed.rows[0];
  if (won) {
    const existing = orderRowFromSql(won);
    return { alreadyClaimed: false, existing: { ...existing, refundClaimedAt: new Date() } };
  }

  // Nothing was claimed — work out whether that means someone else already did,
  // or the order was never refundable at all.
  const rows = await query<OrderSqlRow>(
    `select ${ORDER_COLUMNS} from public.gemstone_orders where id = $1`,
    [orderId],
  );
  const row = rows.rows[0];
  if (!row) throw new OrderMutationError("not_found");
  const existing = orderRowFromSql(row);
  if (existing.paymentStatus !== "paid") throw new OrderMutationError("not_paid");
  return { alreadyClaimed: true, existing };
}

/**
 * Writes the new status, restoring stock and coupon usage when the transition
 * means the goods are not shipping.
 *
 * The restore is gated on the *current* status inside the transaction, so a
 * second concurrent cancel cannot release the same stock twice — the first one
 * flips the status under the row lock and the second sees it already released.
 */
export async function applyOrderStatusInSupabase(orderId: string, status: string, cancellable: Set<string>) {
  return withTransaction(async (client) => {
    const locked = await client.query<OrderSqlRow>(
      `select ${ORDER_COLUMNS} from public.gemstone_orders where id = $1 for update`,
      [orderId],
    );
    const row = locked.rows[0];
    if (!row) throw new OrderMutationError("not_found");
    const existing = orderRowFromSql(row);

    const willRestoreStock =
      (status === "cancelled" || status === "refunded") &&
      existing.status !== "cancelled" &&
      existing.status !== "refunded";

    if (willRestoreStock) {
      if (status === "cancelled" && !cancellable.has(existing.status)) throw new OrderMutationError("not_cancellable");
      if (status === "refunded" && existing.paymentStatus !== "paid") throw new OrderMutationError("not_paid");

      const items = await client.query<ItemSqlRow>(`${ITEM_SELECT} where order_id = $1`, [orderId]);

      if (existing.couponCode) {
        await client.query(
          `update public.gemstone_coupons
              set usage_count = greatest(usage_count - 1, 0), updated_at = now()
            where id = $1`,
          [existing.couponCode],
        );
        const identifier = existing.memberId ?? existing.guestEmail?.trim().toLowerCase() ?? null;
        if (identifier) {
          const usageId = `${existing.couponCode}_${identifier}`;
          await client.query(
            `insert into public.gemstone_coupon_customer_usage
               (id, coupon_code, customer_identifier, usage_count, created_at, updated_at)
             values ($1, $2, $3, 0, now(), now())
             on conflict (id) do update
                set usage_count = greatest(public.gemstone_coupon_customer_usage.usage_count - 1, 0),
                    updated_at = now()`,
            [usageId, existing.couponCode, identifier],
          );
        }
      }

      for (const item of items.rows) {
        await client.query(
          `update public.gemstone_product_variants
              set stock_quantity = stock_quantity + $2, updated_at = now()
            where id = $1`,
          [item.variant_id, Number(item.quantity ?? 0)],
        );
      }
    }

    const updated = await client.query<OrderSqlRow>(
      `update public.gemstone_orders
          set status = $2, payment_status = case when $2 = 'refunded' then 'refunded' else payment_status end,
              updated_at = now()
        where id = $1
        returning ${ORDER_COLUMNS}`,
      [orderId, status],
    );
    const next = updated.rows[0];
    if (!next) throw new OrderMutationError("not_found");
    return orderRowFromSql(next);
  });
}
