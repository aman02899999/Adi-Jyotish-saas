import "server-only";

import { query, queryModels, withTransaction } from "@/lib/postgres";

/**
 * Supabase/Postgres data access for gemstone coupons.
 *
 * Data access only — no validation, no discount arithmetic. `gemstone-coupons.ts`
 * keeps the rules (expiry windows, usage limits, percent caps, flat-vs-percent
 * discount maths) above the provider branch so Firestore and Postgres run the
 * identical code.
 *
 * The Firestore document id IS the normalized code, so `id` and `code` always
 * hold the same value here too. `code` carries its own unique constraint, so a
 * code change is a primary-key update rather than an insert-plus-delete.
 */

export type CouponRow = {
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

/** pg returns numeric/bigint as strings; these are the columns that need coercing. */
const COUPON_NUMERIC_COLUMNS = ["discountValue", "minOrderAmount", "maxDiscountAmount", "usageCount"];

const COUPON_SELECT = `
  select id, code::text as code, description, discount_type, discount_value, min_order_amount,
         max_discount_amount, usage_limit, usage_count, per_customer_limit, starts_at, expires_at,
         active, created_at, updated_at
    from public.gemstone_coupons`;

type CouponSqlRow = {
  id: string;
  code: string;
  description: string | null;
  discount_type: string | null;
  discount_value: string | null;
  min_order_amount: string | null;
  max_discount_amount: string | null;
  usage_limit: number | null;
  usage_count: string | number | null;
  per_customer_limit: number | null;
  starts_at: Date | null;
  expires_at: Date | null;
  active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
};

/**
 * Maps a raw row. `client.query` does not apply rowToCamel — not even for
 * `returning` — so every path that produces a row goes through here.
 */
export function couponRowFromSql(row: CouponSqlRow): CouponRow {
  return {
    id: row.id,
    code: row.code,
    description: row.description ?? "",
    discountType: row.discount_type ?? "percent",
    discountValue: Number(row.discount_value ?? 0),
    minOrderAmount: Number(row.min_order_amount ?? 0),
    maxDiscountAmount: row.max_discount_amount == null ? null : Number(row.max_discount_amount),
    usageLimit: row.usage_limit == null ? null : Number(row.usage_limit),
    usageCount: Number(row.usage_count ?? 0),
    perCustomerLimit: row.per_customer_limit == null ? null : Number(row.per_customer_limit),
    startsAt: row.starts_at ?? null,
    expiresAt: row.expires_at ?? null,
    active: row.active ?? true,
    createdAt: row.created_at ?? new Date(),
    updatedAt: row.updated_at ?? new Date(),
  };
}

/** All coupons, newest first — the admin list. */
export async function getCouponsForAdminInSupabase(): Promise<CouponRow[]> {
  const rows = await query<CouponSqlRow>(`${COUPON_SELECT} order by created_at desc`);
  return rows.rows.map(couponRowFromSql);
}

export async function getCouponByIdInSupabase(id: string): Promise<CouponRow | null> {
  const rows = await query<CouponSqlRow>(`${COUPON_SELECT} where id = $1`, [id]);
  return rows.rows[0] ? couponRowFromSql(rows.rows[0]) : null;
}

export async function couponCodeTakenInSupabase(code: string, excludeId?: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `select exists (select 1 from public.gemstone_coupons where code = $1 and id <> $2) as exists`,
    [code, excludeId ?? ""],
  );
  return rows.rows[0]?.exists ?? false;
}

export type CouponInsert = {
  id: string;
  code: string;
  description: string;
  discountType: string;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  active: boolean;
};

export async function insertCouponInSupabase(values: CouponInsert): Promise<CouponRow> {
  const rows = await query<CouponSqlRow>(
    `insert into public.gemstone_coupons
       (id, code, description, discount_type, discount_value, min_order_amount, max_discount_amount,
        usage_limit, usage_count, per_customer_limit, starts_at, expires_at, active, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12, now(), now())
     returning id, code::text as code, description, discount_type, discount_value, min_order_amount,
               max_discount_amount, usage_limit, usage_count, per_customer_limit, starts_at, expires_at,
               active, created_at, updated_at`,
    [
      values.id, values.code, values.description, values.discountType, values.discountValue,
      values.minOrderAmount, values.maxDiscountAmount, values.usageLimit, values.perCustomerLimit,
      values.startsAt, values.expiresAt, values.active,
    ],
  );
  const row = rows.rows[0];
  if (!row) throw new Error("insertCouponInSupabase returned no row");
  return couponRowFromSql(row);
}

export type CouponUpdate = Omit<CouponInsert, "id">;

export async function updateCouponInSupabase(id: string, values: CouponUpdate): Promise<CouponRow | null> {
  const rows = await query<CouponSqlRow>(
    `update public.gemstone_coupons
        set code = $2, description = $3, discount_type = $4, discount_value = $5, min_order_amount = $6,
            max_discount_amount = $7, usage_limit = $8, per_customer_limit = $9, starts_at = $10,
            expires_at = $11, active = $12, updated_at = now()
      where id = $1
      returning id, code::text as code, description, discount_type, discount_value, min_order_amount,
                max_discount_amount, usage_limit, usage_count, per_customer_limit, starts_at, expires_at,
                active, created_at, updated_at`,
    [
      id, values.code, values.description, values.discountType, values.discountValue, values.minOrderAmount,
      values.maxDiscountAmount, values.usageLimit, values.perCustomerLimit, values.startsAt, values.expiresAt,
      values.active,
    ],
  );
  const row = rows.rows[0];
  return row ? couponRowFromSql(row) : null;
}

/** Thrown when a rename cannot proceed. `gemstone-coupons.ts` maps these onto
 * `CouponError` so the messages stay with the rest of the coupon rules. */
export class CouponRenameConflictError extends Error {
  constructor(readonly code: "not_found" | "code_taken") {
    super(code);
  }
}

/**
 * Changes a coupon's code, which is also its primary key.
 *
 * The Firestore version does set-new-then-delete-old in a transaction, with a
 * comment explaining why: a checkout redeeming the coupon under its old code in
 * between would increment `usage_count` on the row about to be deleted, silently
 * losing that redemption. The same hazard exists here, so the row is locked with
 * `for update` first — a concurrent redemption's own `for update` on the same row
 * then blocks until this transaction commits, exactly as Firestore serialized
 * against the redemption transaction.
 *
 * Nothing references `gemstone_coupons` by foreign key (`gemstone_orders.coupon_code`
 * and `gemstone_coupon_customer_usage.coupon_code` are both plain text), so moving
 * the primary key is safe.
 */
export async function renameCouponInSupabase(currentId: string, nextCode: string, values: CouponUpdate): Promise<CouponRow> {
  return withTransaction(async (client) => {
    const locked = await client.query<CouponSqlRow>(
      `select id, code::text as code, description, discount_type, discount_value, min_order_amount,
              max_discount_amount, usage_limit, usage_count, per_customer_limit, starts_at, expires_at,
              active, created_at, updated_at
         from public.gemstone_coupons where id = $1 for update`,
      [currentId],
    );
    if (!locked.rows[0]) throw new CouponRenameConflictError("not_found");

    const conflict = await client.query<{ exists: boolean }>(
      `select exists (select 1 from public.gemstone_coupons where code = $1 and id <> $2) as exists`,
      [nextCode, currentId],
    );
    if (conflict.rows[0]?.exists) throw new CouponRenameConflictError("code_taken");

    const updated = await client.query<CouponSqlRow>(
      `update public.gemstone_coupons
          set id = $2, code = $2, description = $3, discount_type = $4, discount_value = $5,
              min_order_amount = $6, max_discount_amount = $7, usage_limit = $8, per_customer_limit = $9,
              starts_at = $10, expires_at = $11, active = $12, created_at = now(), updated_at = now()
        where id = $1
        returning id, code::text as code, description, discount_type, discount_value, min_order_amount,
                  max_discount_amount, usage_limit, usage_count, per_customer_limit, starts_at, expires_at,
                  active, created_at, updated_at`,
      [
        currentId, nextCode, values.description, values.discountType, values.discountValue,
        values.minOrderAmount, values.maxDiscountAmount, values.usageLimit, values.perCustomerLimit,
        values.startsAt, values.expiresAt, values.active,
      ],
    );
    const row = updated.rows[0];
    if (!row) throw new CouponRenameConflictError("not_found");
    // Parity with the Firestore path: the new document is a fresh write, so
    // created_at is reset and usage_count carries over untouched.
    return couponRowFromSql(row);
  });
}

/**
 * The row a checkout needs to validate and reserve against.
 *
 * Read without a lock: `validateCoupon` is a pre-flight check only. The real
 * reservation happens inside `createPendingOrder`'s transaction, which re-reads
 * under `for update` — mirroring Firestore, where the pre-transaction read and
 * the transactional read were separate and the transaction was authoritative.
 */
export async function getCouponForCheckoutInSupabase(code: string): Promise<CouponRow | null> {
  const rows = await query<CouponSqlRow>(`${COUPON_SELECT} where code = $1`, [code]);
  return rows.rows[0] ? couponRowFromSql(rows.rows[0]) : null;
}

/** Reserved by queryModels only for the callers that prefer camelCase mapping. */
export { queryModels, COUPON_NUMERIC_COLUMNS };
