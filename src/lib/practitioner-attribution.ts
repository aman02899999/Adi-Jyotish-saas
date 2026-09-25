import "server-only";

import { db } from "@/lib/firestore";
import { getPractitionerAttributionInSupabase, type PractitionerAttributionRow } from "@/lib/practitioners-supabase";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

/**
 * Who a practitioner is and whether they are an AI persona, from whichever store is live.
 *
 * The Postgres half existed for PDF attribution; screens that needed the same answer read the
 * Firestore document directly, so under cutover the member's chat page lost the practitioner's
 * name and had no way to say the counterpart was an AI.
 */
export async function getPractitionerAttribution(id: string): Promise<PractitionerAttributionRow | null> {
  if (isSupabaseCutoverActive()) return getPractitionerAttributionInSupabase(id);
  const snap = await db.collection("practitioners").doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as { name: string; photoUrl?: string | null; isAiPowered?: boolean };
  return { name: data.name, photoUrl: data.photoUrl ?? null, isAiPowered: Boolean(data.isAiPowered) };
}
