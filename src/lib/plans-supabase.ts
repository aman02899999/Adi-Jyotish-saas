import "server-only";

import { query, queryModel, queryModels } from "@/lib/postgres";

/**
 * Postgres data access for membership plans.
 *
 * Deliberately data-only: no Razorpay calls, no studio-settings lookup, no
 * fallback logic. Those stay in src/lib/plans.ts, which branches on
 * isSupabaseCutoverActive() and keeps owning the business rules. Splitting it
 * this way avoids a circular import and means the Razorpay plan-sync behaviour
 * is written exactly once regardless of which database is underneath.
 *
 * price_monthly and price_yearly are numeric(14,2), which node-postgres returns
 * as strings. They are named in NUMERIC_COLUMNS so callers get real numbers —
 * price arithmetic on a string silently concatenates instead of adding.
 */

/** The shape both data layers hand back to plans.ts. Mirrors MembershipPlan. */
export type PlanRow = {
  id: string;
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

const NUMERIC_COLUMNS = ["priceMonthly", "priceYearly"] as const;

const PLAN_COLUMNS = `id, key, name, tagline, description, price_monthly, price_yearly,
       currency, features, session_discount_percent, highlighted, active, sort_order,
       razorpay_plan_id_monthly, razorpay_plan_id_yearly, created_at, updated_at`;

type RawPlanRow = Omit<PlanRow, "createdAt" | "updatedAt"> & { createdAt: Date | null; updatedAt: Date | null };

/**
 * Applies the same field defaults planFromSnap() does on the Firestore path, so
 * both layers return an identically-shaped object. A plan written before a field
 * existed would otherwise surface as undefined and break the pricing page.
 */
function normalizePlan(row: RawPlanRow): PlanRow {
  const now = new Date();
  return {
    id: row.id,
    key: row.key ?? row.id,
    name: row.name ?? "",
    tagline: row.tagline ?? "",
    description: row.description ?? "",
    priceMonthly: row.priceMonthly ?? 0,
    priceYearly: row.priceYearly ?? null,
    currency: row.currency ?? "INR",
    features: row.features ?? "",
    sessionDiscountPercent: row.sessionDiscountPercent ?? 0,
    highlighted: Boolean(row.highlighted),
    // The Firestore path treats a missing `active` as active; preserve that so a
    // plan seeded before the column existed does not silently vanish from /pricing.
    active: row.active !== false,
    sortOrder: row.sortOrder ?? 0,
    razorpayPlanIdMonthly: row.razorpayPlanIdMonthly ?? null,
    razorpayPlanIdYearly: row.razorpayPlanIdYearly ?? null,
    createdAt: row.createdAt ?? now,
    updatedAt: row.updatedAt ?? now,
  };
}

/**
 * Idempotent seed. `on conflict do nothing` replaces the Firestore pattern of
 * calling create() and swallowing an already-exists error — same outcome, but
 * atomic rather than dependent on catching the right error code.
 */
export async function seedPlansInSupabase(
  plans: ReadonlyArray<Omit<PlanRow, "id" | "razorpayPlanIdMonthly" | "razorpayPlanIdYearly" | "createdAt" | "updatedAt">>,
): Promise<void> {
  for (const plan of plans) {
    await query(
      `insert into public.membership_plans
         (id, key, name, tagline, description, price_monthly, price_yearly, currency,
          features, session_discount_percent, highlighted, active, sort_order,
          razorpay_plan_id_monthly, razorpay_plan_id_yearly, created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,null,null,now(),now())
       on conflict (id) do nothing`,
      [
        plan.key,
        plan.key,
        plan.name,
        plan.tagline,
        plan.description,
        plan.priceMonthly,
        plan.priceYearly,
        plan.currency,
        plan.features,
        plan.sessionDiscountPercent,
        plan.highlighted,
        plan.active,
        plan.sortOrder,
      ],
    );
  }
}

export async function getAllPlansFromSupabase(): Promise<PlanRow[]> {
  const rows = await queryModels<RawPlanRow>(
    `select ${PLAN_COLUMNS} from public.membership_plans order by sort_order asc`,
    [],
    NUMERIC_COLUMNS,
  );
  return rows.map(normalizePlan);
}

export async function getPlanByIdFromSupabase(id: string): Promise<PlanRow | null> {
  const row = await queryModel<RawPlanRow>(
    `select ${PLAN_COLUMNS} from public.membership_plans where id = $1`,
    [id],
    NUMERIC_COLUMNS,
  );
  return row ? normalizePlan(row) : null;
}

export type PlanInsert = Omit<PlanRow, "id" | "razorpayPlanIdMonthly" | "razorpayPlanIdYearly" | "createdAt" | "updatedAt">;

/**
 * Inserts a new plan. Throws on a duplicate key.
 *
 * Unlike the Firestore path, this does not read-then-write to detect a clash: it
 * inserts and lets the unique index decide. Two admins creating the same key at
 * the same moment can no longer both succeed.
 */
export async function insertPlanInSupabase(plan: PlanInsert): Promise<PlanRow> {
  await query(
    `insert into public.membership_plans
       (id, key, name, tagline, description, price_monthly, price_yearly, currency,
        features, session_discount_percent, highlighted, active, sort_order,
        razorpay_plan_id_monthly, razorpay_plan_id_yearly, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,null,null,now(),now())`,
    [
      plan.key,
      plan.key,
      plan.name,
      plan.tagline,
      plan.description,
      plan.priceMonthly,
      plan.priceYearly,
      plan.currency,
      plan.features,
      plan.sessionDiscountPercent,
      plan.highlighted,
      plan.active,
      plan.sortOrder,
    ],
  );
  const created = await getPlanByIdFromSupabase(plan.key);
  if (!created) throw new Error("Plan was inserted but could not be read back.");
  return created;
}

/** Partial update of the editable fields. Only keys present in `patch` are written. */
export async function updatePlanInSupabase(id: string, patch: Record<string, unknown>): Promise<PlanRow> {
  const allowed: Record<string, string> = {
    name: "name",
    tagline: "tagline",
    description: "description",
    priceMonthly: "price_monthly",
    priceYearly: "price_yearly",
    features: "features",
    sessionDiscountPercent: "session_discount_percent",
    highlighted: "highlighted",
    active: "active",
    sortOrder: "sort_order",
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [field, column] of Object.entries(allowed)) {
    if (!(field in patch)) continue;
    values.push(patch[field]);
    sets.push(`"${column}" = $${values.length}`);
  }

  if (sets.length) {
    values.push(id);
    await query(
      `update public.membership_plans set ${sets.join(", ")}, updated_at = now() where id = $${values.length}`,
      values,
    );
  }

  const updated = await getPlanByIdFromSupabase(id);
  if (!updated) throw new Error("Plan not found.");
  return updated;
}

/** Persists Razorpay plan ids after a successful sync. Kept separate so a failed
 * Razorpay call cannot roll back an otherwise-good plan edit. */
export async function updatePlanRazorpayIdsInSupabase(
  id: string,
  ids: { razorpayPlanIdMonthly: string | null; razorpayPlanIdYearly: string | null },
): Promise<void> {
  await query(
    `update public.membership_plans
        set razorpay_plan_id_monthly = $2, razorpay_plan_id_yearly = $3, updated_at = now()
      where id = $1`,
    [id, ids.razorpayPlanIdMonthly, ids.razorpayPlanIdYearly],
  );
}
