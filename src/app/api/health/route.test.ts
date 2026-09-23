import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

/**
 * The health probe is a plain handler with no request context, so it is callable
 * directly and its readiness logic is worth pinning: an endpoint that reports a healthy
 * site as sick is worse than no endpoint at all, because someone is paged for it.
 */

const SERVICE_ACCOUNT = JSON.stringify({
  project_id: "probe-project",
  client_email: "probe@probe-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nprobe\n-----END PRIVATE KEY-----\n",
});
const SERVICE_ROLE_KEY = "sb_secret_probe_value_that_must_never_be_echoed";
const JWT_SECRET = "sb_jwt_probe_value_that_must_never_be_echoed";

const KEYS = [
  "SUPABASE_CUTOVER",
  "SUPABASE_URL",
  "SUPABASE_DB_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
  "FIREBASE_SERVICE_ACCOUNT_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "GCLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT",
];

const saved: Record<string, string | undefined> = {};
for (const key of KEYS) saved[key] = process.env[key];

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function firebaseEnvironment() {
  delete process.env.SUPABASE_CUTOVER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_DB_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = SERVICE_ACCOUNT;
  process.env.FIREBASE_STORAGE_BUCKET = "probe-bucket";
}

function supabaseEnvironment() {
  // Firebase credentials are genuinely gone after a cutover -- that is the point.
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  delete process.env.FIREBASE_PROJECT_ID;
  delete process.env.FIREBASE_STORAGE_BUCKET;
  delete process.env.GCLOUD_PROJECT;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  process.env.SUPABASE_CUTOVER = "true";
  process.env.SUPABASE_URL = "https://probe.supabase.co";
  process.env.SUPABASE_DB_URL = "postgres://postgres:postgres@db.probe.supabase.co:5432/postgres";
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
}

async function probe() {
  const response = await GET();
  return { response, body: (await response.json()) as Record<string, unknown> & { dependencies: Record<string, string> } };
}

describe("health probe", () => {
  it("reports healthy on Firebase before the cutover", async () => {
    firebaseEnvironment();
    const { response, body } = await probe();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "healthy",
      provider: "firebase",
      dependencies: { firebase: "configured", firebaseStorage: "configured", supabase: "not_required" },
    });
  });

  it("stays healthy after the cutover even though Firebase credentials are gone", async () => {
    // This is the regression the endpoint had: readiness followed Firebase alone, so
    // flipping SUPABASE_CUTOVER made the probe report "degraded" forever, and an uptime
    // monitor would have been calling a healthy site sick.
    supabaseEnvironment();
    const { response, body } = await probe();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.provider).toBe("supabase");
    expect(body.dependencies).toMatchObject({
      firebase: "not_required",
      firebaseStorage: "not_required",
      supabase: "configured",
    });
  });

  it("reports degraded when the service role key is missing after the cutover", async () => {
    // The database is still reachable, but every write path is broken.
    supabaseEnvironment();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { body } = await probe();

    expect(body.status).toBe("degraded");
    expect(body.dependencies.supabase).toBe("degraded");
  });

  it("reports unavailable when the session signing secret is missing after the cutover", async () => {
    // SUPABASE_JWT_SECRET verifies every access token and derives the session cookie's
    // signing key. Without it nobody can sign in or hold a session, so the site is up and
    // unusable — a stronger signal than the service role key's "writes are broken".
    // Before this, isSupabaseCutoverActive() never looked at it and the probe reported
    // "healthy" while every authenticated request 401'd.
    supabaseEnvironment();
    delete process.env.SUPABASE_JWT_SECRET;
    const { body } = await probe();

    expect(body.status).toBe("degraded");
    expect(body.dependencies.supabase).toBe("unavailable");
  });

  it("reports unavailable for a session secret too short to sign with", async () => {
    // Present but unusable is the same outage as absent: app-session.ts refuses to derive a key
    // from it, so nobody can hold a session.
    supabaseEnvironment();
    process.env.SUPABASE_JWT_SECRET = "too-short";
    const { body } = await probe();
    expect(body.dependencies.supabase).toBe("unavailable");
  });

  it("ranks a missing session secret above a missing service role key", async () => {
    supabaseEnvironment();
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { body } = await probe();

    // Both are broken; the one that stops every request winning is what an operator needs
    // to see first.
    expect(body.dependencies.supabase).toBe("unavailable");
  });

  it("never echoes the session signing secret", async () => {
    supabaseEnvironment();
    const { body } = await probe();
    expect(JSON.stringify(body)).not.toContain(JWT_SECRET);
  });

  it("reports degraded on Firebase when the service account is absent", async () => {
    firebaseEnvironment();
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const { body } = await probe();

    expect(body.status).toBe("degraded");
    expect(body.dependencies.firebase).toBe("unavailable");
  });

  it("reports degraded on Firebase when the service account is present but malformed", async () => {
    firebaseEnvironment();
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "this is not a service account";
    const { body } = await probe();

    expect(body.status).toBe("degraded");
    expect(body.dependencies.firebase).toBe("degraded");
  });

  it("does not fall back to the cutover when Supabase config is incomplete", async () => {
    // SUPABASE_CUTOVER=true without a usable URL is not a cutover, so readiness must
    // still follow Firebase rather than silently reporting a healthy Supabase.
    firebaseEnvironment();
    process.env.SUPABASE_CUTOVER = "true";
    process.env.SUPABASE_DB_URL = "postgres://postgres:postgres@db.probe.supabase.co:5432/postgres";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
    // SUPABASE_URL deliberately unset.
    const { body } = await probe();

    expect(body.provider).toBe("firebase");
    expect(body.status).toBe("healthy");
    expect(body.dependencies.supabase).toBe("not_required");
  });

  it("never echoes a credential value into the response", async () => {
    supabaseEnvironment();
    const text = await (await GET()).text();

    expect(text).not.toContain(SERVICE_ROLE_KEY);
    expect(text).not.toContain("probe-project.iam.gserviceaccount.com");
    expect(text).not.toContain("postgres://");
  });

  it("is not cacheable, so a probe never serves a stale verdict", async () => {
    firebaseEnvironment();
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
