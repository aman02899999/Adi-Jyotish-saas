import { afterEach, describe, expect, it, vi } from "vitest";

import {
  describeMissingSupabaseConfig,
  getSupabaseConfig,
  isSupabaseConfigured,
  isSupabaseCutoverActive,
  isSupabaseServiceRolePresent,
  isSupabaseSessionSecretPresent,
} from "@/lib/supabase-config";

/**
 * Guards the migration switch. The failure mode worth preventing is a
 * half-configured environment silently taking the Postgres path with a bad
 * connection string: every ported read would then throw instead of falling back
 * to Firestore, which is exactly the outage this gate exists to avoid.
 *
 * The http:// rejection matters for a subtler reason — the service_role key
 * bypasses RLS, so accepting a non-TLS URL would put it on the wire in cleartext.
 */

const ORIGINAL = { ...process.env };

const VALID = {
  SUPABASE_URL: "https://qgaklmvkvyljqivvryfs.supabase.co",
  SUPABASE_DB_URL: "postgresql://postgres:secret@db.qgaklmvkvyljqivvryfs.supabase.co:5432/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_JWT_SECRET: "session-signing-secret",
};

function setEnv(partial: Record<string, string | undefined>) {
  for (const key of Object.keys(VALID)) delete process.env[key];
  delete process.env.SUPABASE_CUTOVER;
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.unstubAllEnvs();
});

describe("isSupabaseConfigured", () => {
  it("is false when nothing is set — the state this repo ships in", () => {
    setEnv({});
    expect(isSupabaseConfigured()).toBe(false);
    expect(isSupabaseCutoverActive()).toBe(false);
  });

  it("is false when only the URL is set", () => {
    setEnv({ SUPABASE_URL: VALID.SUPABASE_URL });
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("is false when only the connection string is set", () => {
    setEnv({ SUPABASE_DB_URL: VALID.SUPABASE_DB_URL });
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("is true with a valid https URL and postgres connection string", () => {
    setEnv(VALID);
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("does not require the service_role key for the database path", () => {
    setEnv({ ...VALID, SUPABASE_SERVICE_ROLE_KEY: undefined });
    expect(isSupabaseConfigured()).toBe(true);
    expect(isSupabaseServiceRolePresent()).toBe(false);
  });

  it("rejects an http:// URL so the service_role key can never go out in cleartext", () => {
    setEnv({ ...VALID, SUPABASE_URL: "http://qgaklmvkvyljqivvryfs.supabase.co" });
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("rejects a URL with no scheme — the most likely copy-paste error", () => {
    setEnv({ ...VALID, SUPABASE_URL: "qgaklmvkvyljqivvryfs.supabase.co" });
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("rejects a blank URL", () => {
    setEnv({ ...VALID, SUPABASE_URL: "   " });
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("rejects a non-postgres connection string", () => {
    setEnv({ ...VALID, SUPABASE_DB_URL: "mongodb://localhost:27017/db" });
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("rejects a connection string with no host", () => {
    setEnv({ ...VALID, SUPABASE_DB_URL: "postgresql://:5432/postgres" });
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("accepts the bare postgres: scheme as well as postgresql:", () => {
    setEnv({ ...VALID, SUPABASE_DB_URL: "postgres://u:p@db.internal:5432/postgres" });
    expect(isSupabaseConfigured()).toBe(true);
  });
});

describe("getSupabaseConfig", () => {
  it("normalizes the URL to its origin, stripping a trailing slash", () => {
    setEnv({ ...VALID, SUPABASE_URL: "https://qgaklmvkvyljqivvryfs.supabase.co/" });
    // Without this the Auth admin URL becomes https://…//auth/v1 and 404s.
    expect(getSupabaseConfig()?.url).toBe("https://qgaklmvkvyljqivvryfs.supabase.co");
  });

  it("strips a path from the URL", () => {
    setEnv({ ...VALID, SUPABASE_URL: "https://qgaklmvkvyljqivvryfs.supabase.co/some/path" });
    expect(getSupabaseConfig()?.url).toBe("https://qgaklmvkvyljqivvryfs.supabase.co");
  });

  it("trims surrounding whitespace from every value", () => {
    setEnv({
      SUPABASE_URL: `  ${VALID.SUPABASE_URL}  `,
      SUPABASE_DB_URL: `  ${VALID.SUPABASE_DB_URL}  `,
      SUPABASE_SERVICE_ROLE_KEY: "  key  ",
    });
    const config = getSupabaseConfig();
    expect(config?.url).toBe(VALID.SUPABASE_URL);
    expect(config?.serviceRoleKey).toBe("key");
  });

  it("returns null rather than a partial object when invalid", () => {
    setEnv({ ...VALID, SUPABASE_DB_URL: "not a url" });
    expect(getSupabaseConfig()).toBeNull();
  });
});

describe("isSupabaseCutoverActive", () => {
  it("is false with valid credentials but no explicit flip — routing is unchanged", () => {
    setEnv(VALID);
    expect(isSupabaseConfigured()).toBe(true);
    expect(isSupabaseCutoverActive()).toBe(false);
  });

  it("is true only once SUPABASE_CUTOVER is true", () => {
    setEnv({ ...VALID, SUPABASE_CUTOVER: "true" });
    expect(isSupabaseCutoverActive()).toBe(true);
  });

  it("tolerates case and surrounding whitespace in the flag", () => {
    setEnv({ ...VALID, SUPABASE_CUTOVER: "  TRUE " });
    expect(isSupabaseCutoverActive()).toBe(true);
  });

  it("treats any other value as off, including 1 and yes", () => {
    for (const value of ["1", "yes", "on", "false", ""]) {
      setEnv({ ...VALID, SUPABASE_CUTOVER: value });
      expect(isSupabaseCutoverActive(), `SUPABASE_CUTOVER=${JSON.stringify(value)}`).toBe(false);
    }
  });

  it("stays false when the flag is set but the credentials are broken", () => {
    setEnv({ SUPABASE_CUTOVER: "true", SUPABASE_URL: "http://insecure.supabase.co", SUPABASE_DB_URL: VALID.SUPABASE_DB_URL });
    expect(isSupabaseCutoverActive()).toBe(false);
  });
});

describe("isSupabaseSessionSecretPresent", () => {
  it("is false when SUPABASE_JWT_SECRET is unset", () => {
    expect(isSupabaseSessionSecretPresent()).toBe(false);
  });

  it("is false when it is only whitespace", () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", "   ");
    expect(isSupabaseSessionSecretPresent()).toBe(false);
  });

  it("is true once it is set", () => {
    vi.stubEnv("SUPABASE_JWT_SECRET", "a-signing-secret");
    expect(isSupabaseSessionSecretPresent()).toBe(true);
  });

  it("does not gate the data connection, which the migration scripts need on its own", () => {
    // Folding it into isSupabaseConfigured() would stop the copy scripts running with a
    // database URL and nothing else, which is a legitimate configuration.
    vi.stubEnv("SUPABASE_URL", "https://abcdefgh.supabase.co");
    vi.stubEnv("SUPABASE_DB_URL", "postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    expect(isSupabaseSessionSecretPresent()).toBe(false);
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("does not silently divert a cutover back to Firebase", () => {
    // A cutover missing this secret must stay a cutover and be reported as broken, not
    // quietly keep serving from the old store.
    vi.stubEnv("SUPABASE_URL", "https://abcdefgh.supabase.co");
    vi.stubEnv("SUPABASE_DB_URL", "postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    vi.stubEnv("SUPABASE_CUTOVER", "true");
    expect(isSupabaseCutoverActive()).toBe(true);
    expect(describeMissingSupabaseConfig()).toContain("SUPABASE_JWT_SECRET");
  });
});

describe("describeMissingSupabaseConfig", () => {
  it("names every missing variable when none are set", () => {
    setEnv({});
    const message = describeMissingSupabaseConfig();
    expect(message).toContain("SUPABASE_URL");
    expect(message).toContain("SUPABASE_DB_URL");
    expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("names only what is actually missing", () => {
    setEnv({ ...VALID, SUPABASE_SERVICE_ROLE_KEY: undefined });
    expect(describeMissingSupabaseConfig()).toBe("missing or invalid: SUPABASE_SERVICE_ROLE_KEY");
  });

  it("names the session signing secret when it is the only thing missing", () => {
    // It is required by every authenticated request but gates neither isSupabaseConfigured()
    // nor the cutover, so this line is the only place an operator is told it is absent.
    setEnv({ ...VALID, SUPABASE_JWT_SECRET: undefined });
    expect(describeMissingSupabaseConfig()).toBe("missing or invalid: SUPABASE_JWT_SECRET");
  });

  it("reports all set when configured", () => {
    setEnv(VALID);
    expect(describeMissingSupabaseConfig()).toBe("all Supabase variables are set");
  });

  it("never echoes a configured value back — safe to log during the migration", () => {
    setEnv(VALID);
    const message = describeMissingSupabaseConfig();
    expect(message).not.toContain("secret");
    expect(message).not.toContain("service-role-key");
    expect(message).not.toContain("qgaklmvkvyljqivvryfs");
  });
});
