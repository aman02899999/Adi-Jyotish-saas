/**
 * Studio settings shape and defaults, in a module of their own.
 *
 * Both src/lib/studio-settings.ts (Firestore) and src/lib/studio-settings-supabase.ts
 * (Postgres) need the same defaults, and each needs to branch to the other — so
 * keeping the shared piece here avoids a circular import between them.
 */

export type StudioSettings = {
  studioName: string;
  supportEmail: string;
  timezone: string;
  currency: string;
  cancellationHours: number;
  bookingLeadMinutes: number;
  replySlaHours: number;
  gstRate: number;
  gstin: string | null;
  /**
   * ISO string, not a Date. unstable_cache persists this value through a
   * serialization round-trip, so a cache hit would hand back a plain string where
   * a cache miss handed back a Date under the same field name. Storing the string
   * up front keeps the type honest regardless of cache state.
   */
  updatedAt: string;
};

export const STUDIO_SETTINGS_DEFAULTS: Omit<StudioSettings, "updatedAt"> = {
  studioName: "Adi Jyotish Guru",
  supportEmail: "support@adijyotishguru.com",
  timezone: "Asia/Kolkata",
  currency: "INR",
  cancellationHours: 24,
  bookingLeadMinutes: 15,
  replySlaHours: 24,
  gstRate: 18,
  gstin: null,
};
