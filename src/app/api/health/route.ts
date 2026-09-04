import { isFirebaseConfigured, isFirebaseProjectConfigured, isFirebaseServiceAccountPresent, isStorageConfigured } from "@/lib/firestore";

export const dynamic = "force-dynamic";

type DependencyStatus = "configured" | "degraded" | "unavailable" | "not_required";

/**
 * Liveness/readiness endpoint.
 *
 * It intentionally does NOT perform Firestore queries on every probe: the web app can
 * serve all public pages without Firebase, and making the health endpoint depend on a
 * database round-trip would turn a transient Firebase issue into an unhealthy site even
 * though the runtime itself is fine. Firebase configuration is reported as a dependency
 * status so operators can see it in a probe response / uptime monitor.
 *
 * Never returns stack traces, tokens, secrets, or HTML.
 */
export async function GET() {
  const firebaseSecretPresent = isFirebaseServiceAccountPresent();
  const firebaseSecretValid = isFirebaseConfigured();
  const firebaseProject = isFirebaseProjectConfigured();

  let firebase: DependencyStatus;
  if (!firebaseSecretPresent) {
    firebase = "unavailable";
  } else if (!firebaseSecretValid || !firebaseProject) {
    firebase = "degraded";
  } else {
    firebase = "configured";
  }

  const storage = isStorageConfigured() ? "configured" : "unavailable";
  const status = firebase === "configured" ? "healthy" : "degraded";

  return Response.json(
    {
      ok: true,
      status,
      service: "adi-jyotish",
      timestamp: new Date().toISOString(),
      dependencies: {
        firebase,
        firebaseStorage: storage,
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
