import { isFirebaseConfigured, isFirebaseProjectConfigured, isFirebaseServiceAccountPresent, isStorageConfigured } from "@/lib/firestore";
import { isSupabaseCutoverActive, isSupabaseServiceRolePresent } from "@/lib/supabase-config";

export const dynamic = "force-dynamic";

type DependencyStatus = "configured" | "degraded" | "unavailable" | "not_required";

/**
 * Liveness/readiness endpoint.
 *
 * It intentionally does NOT perform a database query on every probe: the web app can
 * serve all public pages without one, and making the health endpoint depend on a
 * round-trip would turn a transient database issue into an unhealthy site even though
 * the runtime itself is fine. Configuration is reported as a dependency status so
 * operators can see it in a probe response / uptime monitor.
 *
 * Readiness follows whichever provider is active. Before this was true the endpoint
 * reported Firebase only, so flipping SUPABASE_CUTOVER would leave the probe permanently
 * "degraded" — Firebase's service account is legitimately absent at that point, and an
 * uptime monitor would have been telling operators a healthy site was sick.
 *
 * Never returns stack traces, tokens, secrets, or HTML.
 */
export async function GET() {
  const cutover = isSupabaseCutoverActive();

  let firebase: DependencyStatus;
  if (cutover) {
    // Firebase is not merely unused once the cutover is on; its credentials are expected
    // to be gone, so an absent service account is not a fault.
    firebase = "not_required";
  } else if (!isFirebaseServiceAccountPresent()) {
    firebase = "unavailable";
  } else if (!isFirebaseConfigured() || !isFirebaseProjectConfigured()) {
    firebase = "degraded";
  } else {
    firebase = "configured";
  }

  let supabase: DependencyStatus;
  if (!cutover) {
    supabase = "not_required";
  } else {
    // isSupabaseCutoverActive() already requires a well-formed SUPABASE_URL and
    // SUPABASE_DB_URL, so reaching this branch means both are present — there is no
    // "unavailable" state to report here. The service role key is the one piece it does
    // not check, and a missing key leaves the database reachable while every write path
    // is broken, which is exactly a degraded dependency.
    supabase = isSupabaseServiceRolePresent() ? "configured" : "degraded";
  }

  // Supabase Storage needs no bucket variable to be usable (it falls back to the default
  // bucket), so it tracks the Supabase status rather than adding its own failure mode.
  const firebaseStorage: DependencyStatus = cutover ? "not_required" : isStorageConfigured() ? "configured" : "unavailable";

  const active = cutover ? supabase : firebase;
  const status = active === "configured" ? "healthy" : "degraded";

  return Response.json(
    {
      ok: true,
      status,
      service: "adi-jyotish",
      provider: cutover ? "supabase" : "firebase",
      timestamp: new Date().toISOString(),
      dependencies: {
        firebase,
        firebaseStorage,
        supabase,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    },
  );
}
