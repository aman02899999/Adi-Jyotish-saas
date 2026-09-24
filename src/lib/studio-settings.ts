import "server-only";

import { unstable_cache } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firestore";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";
import { STUDIO_SETTINGS_DEFAULTS, type StudioSettings } from "@/lib/studio-settings-defaults";
import { fetchStudioSettingsFromSupabase, updateStudioSettingsInSupabase } from "@/lib/studio-settings-supabase";

// Re-exported so existing imports of the type from this module keep working.
export type { StudioSettings };

const defaults = STUDIO_SETTINGS_DEFAULTS;

const ref = db.collection("studioSettings").doc("main");

/**
 * Reads settings from whichever data layer the cutover flag selects.
 *
 * The branch lives here rather than in callers so that nothing downstream has to
 * know a migration is in progress — every consumer keeps calling
 * getStudioSettings() exactly as before.
 */
async function fetchStudioSettings(): Promise<StudioSettings> {
  if (isSupabaseCutoverActive()) return fetchStudioSettingsFromSupabase();

  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ ...defaults, updatedAt: FieldValue.serverTimestamp() });
    return { ...defaults, updatedAt: new Date().toISOString() };
  }
  const data = snap.data() as Partial<Omit<StudioSettings, "updatedAt">> & { updatedAt?: FirebaseFirestore.Timestamp };
  return { ...defaults, ...data, updatedAt: (data.updatedAt?.toDate() ?? new Date()).toISOString() };
}

/** Falls back to defaults instead of throwing — both so a transient Firestore hiccup degrades one
 * section instead of 500ing an entire marketing page (same philosophy as withIndexFallback in
 * firestore.ts), and so pages using this can be statically/ISR-prerendered: `next build` has no
 * Firebase credentials (CI has none at all; this app's deploy config only grants them at runtime),
 * so the very first call here happens with no credentials and must not crash the build. */
async function fetchStudioSettingsSafely(): Promise<StudioSettings> {
  try {
    return await fetchStudioSettings();
  } catch (error) {
    console.error("getStudioSettings: falling back to defaults —", error);
    return { ...defaults, updatedAt: new Date().toISOString() };
  }
}

// Same content for every visitor (not personalized), read on nearly every page via SiteFooter —
// without this, that's a real Firestore round-trip on every single request. unstable_cache keeps
// this cached at runtime with a 5-minute TTL. An admin save reads back fresh (below); other
// visitors may see the previous version for up to the revalidate window.
export const getStudioSettings = unstable_cache(fetchStudioSettingsSafely, ["studio-settings"], {
  tags: ["studio-settings"],
  revalidate: 300,
});

export async function updateStudioSettings(patch: Partial<StudioSettings>) {
  if (isSupabaseCutoverActive()) return updateStudioSettingsInSupabase(patch);
  await ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return fetchStudioSettings();
}
