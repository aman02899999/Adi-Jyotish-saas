import "server-only";

import { query } from "@/lib/postgres";
import { GENUINE_REVIEW_SQL } from "@/lib/review-provenance";

/**
 * Postgres twins for the editable site content (homepage hero, footer), the promo banner, and the
 * homepage trust-strip numbers.
 *
 * site_content keeps each Firestore document whole in `data` (the copy script's wholeDocJsonb), so
 * an edit merges into it the way Firestore's set(..., { merge: true }) did.
 */

export async function getSiteContentInSupabase(id: string): Promise<Record<string, unknown> | null> {
  const { rows } = await query<{ data: Record<string, unknown> }>(`select data from public.site_content where id = $1`, [id]);
  return rows[0]?.data ?? null;
}

export async function mergeSiteContentInSupabase(id: string, patch: Record<string, unknown>): Promise<void> {
  await query(
    `insert into public.site_content (id, data) values ($1, $2::jsonb)
     on conflict (id) do update set data = public.site_content.data || excluded.data, updated_at = now()`,
    [id, JSON.stringify(patch)],
  );
}

export type PromoBannerRow = {
  enabled: boolean; message: string; ctaLabel: string | null; ctaHref: string | null;
  source: "manual" | "auto"; festivalKey: string | null; updatedAt: string | null;
};

export async function getPromoBannerInSupabase(): Promise<PromoBannerRow | null> {
  const { rows } = await query<{ enabled: boolean; message: string; cta_label: string | null; cta_href: string | null; source: "manual" | "auto"; festival_key: string | null; updated_at: string | null }>(
    `select enabled, message, cta_label, cta_href, source, festival_key, updated_at from public.promo_banner where id = 'main'`,
  );
  const row = rows[0];
  if (!row) return null;
  return { enabled: row.enabled, message: row.message, ctaLabel: row.cta_label, ctaHref: row.cta_href, source: row.source, festivalKey: row.festival_key, updatedAt: row.updated_at };
}

const PROMO_COLUMNS = { enabled: "enabled", message: "message", ctaLabel: "cta_label", ctaHref: "cta_href", source: "source", festivalKey: "festival_key" } as const;

/** Writes only the fields given, like the Firestore merge; updated_at is an ISO string column. */
export async function mergePromoBannerInSupabase(patch: Partial<Omit<PromoBannerRow, "updatedAt">>): Promise<void> {
  const entries = (Object.keys(PROMO_COLUMNS) as (keyof typeof PROMO_COLUMNS)[]).filter((key) => patch[key] !== undefined);
  const columns = [...entries.map((key) => PROMO_COLUMNS[key]), "updated_at"];
  const values = [...entries.map((key) => patch[key]), new Date().toISOString()];
  await query(
    `insert into public.promo_banner (id, ${columns.join(", ")}) values ('main', ${columns.map((_, i) => `$${i + 1}`).join(", ")})
     on conflict (id) do update set ${columns.map((column) => `${column} = excluded.${column}`).join(", ")}`,
    values,
  );
}

/** Demo practitioners and synthetic reviews are excluded, as on the Firestore path. */
export async function getHomepageStatsInSupabase() {
  const { rows } = await query<{ consultations: number; practitioners: number; average: string | null; reviews: number }>(
    `select
       (select count(*)::int from public.bookings where status = 'completed') as consultations,
       (select count(*)::int from public.practitioners where active and not is_demo_account) as practitioners,
       avg(r.rating)::numeric as average,
       count(r.*)::int as reviews
     from public.practitioner_reviews r
     where r.status = 'published' and ${GENUINE_REVIEW_SQL.replace("source", "r.source")}
       and not exists (select 1 from public.practitioners p where p.id = r.practitioner_id and p.is_demo_account)`,
  );
  const row = rows[0];
  return {
    consultationsDelivered: row.consultations,
    practitionerCount: row.practitioners,
    averageRating: row.average === null ? 0 : Math.round(Number(row.average) * 10) / 10,
    reviewCount: row.reviews,
  };
}

export async function getOnlineNowCountInSupabase(): Promise<number> {
  const { rows } = await query<{ n: number }>(`select count(*)::int as n from public.practitioners where active and online and not is_demo_account`);
  return rows[0].n;
}

/** Highest rated first, newest breaking ties; only genuine reviews long enough to quote. */
export async function getFeaturedTestimonialsInSupabase(limit: number): Promise<Array<{ reviewerName: string; body: string; rating: number }>> {
  const { rows } = await query<{ reviewer_name: string; body: string; rating: number }>(
    `select reviewer_name, body, rating from public.practitioner_reviews
      where status = 'published' and ${GENUINE_REVIEW_SQL} and length(body) > 40
      order by rating desc, created_at desc limit $1`,
    [limit],
  );
  return rows.map((row) => ({ reviewerName: row.reviewer_name, body: row.body, rating: Number(row.rating) }));
}
