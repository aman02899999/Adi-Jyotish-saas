import "server-only";

import { query, queryModel } from "@/lib/postgres";
import { STUDIO_SETTINGS_DEFAULTS, type StudioSettings } from "@/lib/studio-settings-defaults";

/**
 * Postgres implementation of the studio settings singleton.
 *
 * Firestore kept this as the single document studioSettings/main. The schema
 * preserves that: studio_settings.id = 'main'. Everything here is gated behind
 * isSupabaseCutoverActive() by the caller in studio-settings.ts, so the Firestore
 * path is untouched until the cutover is flipped.
 *
 * gst_rate is numeric(6,3), which node-postgres returns as a string — hence the
 * explicit numericColumns list. Without it, gstRate would be "18" and every
 * tax calculation would concatenate instead of multiply.
 */

const SETTINGS_ID = "main";

const NUMERIC_COLUMNS = ["gstRate"] as const;

type SettingsRow = Omit<StudioSettings, "updatedAt"> & { updatedAt: string | null };

/**
 * Reads the singleton, creating it from defaults if absent.
 *
 * The upsert replaces Firestore's "read, and set if missing" pair. That pair is a
 * race: two concurrent first-requests both see a missing document and both write.
 * `on conflict do nothing` makes the same operation atomic.
 */
export async function fetchStudioSettingsFromSupabase(): Promise<StudioSettings> {
  await query(
    `insert into public.studio_settings
       (id, studio_name, support_email, timezone, currency, cancellation_hours,
        booking_lead_minutes, reply_sla_hours, gst_rate, gstin, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (id) do nothing`,
    [
      SETTINGS_ID,
      STUDIO_SETTINGS_DEFAULTS.studioName,
      STUDIO_SETTINGS_DEFAULTS.supportEmail,
      STUDIO_SETTINGS_DEFAULTS.timezone,
      STUDIO_SETTINGS_DEFAULTS.currency,
      STUDIO_SETTINGS_DEFAULTS.cancellationHours,
      STUDIO_SETTINGS_DEFAULTS.bookingLeadMinutes,
      STUDIO_SETTINGS_DEFAULTS.replySlaHours,
      STUDIO_SETTINGS_DEFAULTS.gstRate,
      STUDIO_SETTINGS_DEFAULTS.gstin,
      new Date().toISOString(),
    ],
  );

  const row = await queryModel<SettingsRow>(
    `select studio_name, support_email, timezone, currency, cancellation_hours,
            booking_lead_minutes, reply_sla_hours, gst_rate, gstin, updated_at
       from public.studio_settings
      where id = $1`,
    [SETTINGS_ID],
    NUMERIC_COLUMNS,
  );

  // Row cannot be missing after the upsert above, but returning defaults rather
  // than throwing matches the Firestore path's "degrade one section, never 500 a
  // marketing page" behaviour.
  if (!row) return { ...STUDIO_SETTINGS_DEFAULTS, updatedAt: new Date().toISOString() };

  return {
    studioName: row.studioName,
    supportEmail: row.supportEmail,
    timezone: row.timezone,
    currency: row.currency,
    cancellationHours: row.cancellationHours,
    bookingLeadMinutes: row.bookingLeadMinutes,
    replySlaHours: row.replySlaHours,
    gstRate: row.gstRate ?? STUDIO_SETTINGS_DEFAULTS.gstRate,
    gstin: row.gstin ?? null,
    // updated_at is stored as an ISO string, deliberately: unstable_cache
    // round-trips this value through serialization, so a Date would come back a
    // string on a cache hit. See the note at src/lib/studio-settings.ts:16.
    updatedAt: row.updatedAt ?? new Date().toISOString(),
  };
}

export async function updateStudioSettingsInSupabase(patch: Partial<StudioSettings>): Promise<StudioSettings> {
  const now = new Date().toISOString();
  await query(
    `update public.studio_settings
        set studio_name          = coalesce($2, studio_name),
            support_email        = coalesce($3, support_email),
            timezone             = coalesce($4, timezone),
            currency             = coalesce($5, currency),
            cancellation_hours   = coalesce($6, cancellation_hours),
            booking_lead_minutes = coalesce($7, booking_lead_minutes),
            reply_sla_hours      = coalesce($8, reply_sla_hours),
            gst_rate             = coalesce($9, gst_rate),
            gstin                = coalesce($10, gstin),
            updated_at           = $11
      where id = $1`,
    [
      SETTINGS_ID,
      patch.studioName ?? null,
      patch.supportEmail ?? null,
      patch.timezone ?? null,
      patch.currency ?? null,
      patch.cancellationHours ?? null,
      patch.bookingLeadMinutes ?? null,
      patch.replySlaHours ?? null,
      patch.gstRate ?? null,
      // gstin is genuinely nullable, so coalesce would make it impossible to
      // clear. An explicit key presence check is the only correct behaviour.
      patch.gstin !== undefined ? patch.gstin : null,
      now,
    ],
  );
  return fetchStudioSettingsFromSupabase();
}
