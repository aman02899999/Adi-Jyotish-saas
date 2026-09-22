import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The privacy flows (data export, deletion blockers, deletion) were written against Firestore
 * before the Supabase port and have no Postgres path. This pins the behaviour that keeps that
 * gap from becoming a GDPR incident: under cutover they must refuse loudly rather than export a
 * stale shell or delete documents the app no longer reads while the real rows survive in
 * Postgres. Remove these tests only together with a real Supabase implementation.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/firestore", () => ({
  db: { collection: () => { throw new Error("Firestore must not be touched under cutover"); } },
  bucket: null,
  isStorageConfigured: () => false,
  withIndexFallback: async () => [],
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({}) }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { delete: () => null } }));

const CUTOVER_ENV = {
  SUPABASE_CUTOVER: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_DB_URL: "postgresql://postgres:secret@db.example.supabase.co:5432/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const MEMBER = { id: "member-1", email: "a@example.com" } as never;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function importUnderCutover() {
  for (const [key, value] of Object.entries(CUTOVER_ENV)) vi.stubEnv(key, value);
  vi.resetModules();
  return import("@/lib/account-deletion");
}

describe("privacy flows under Supabase cutover", () => {
  it("refuses the data export instead of returning a stale Firestore bundle", async () => {
    const { buildMemberDataExport, AccountDeletionUnavailableError } = await importUnderCutover();
    await expect(buildMemberDataExport(MEMBER)).rejects.toBeInstanceOf(AccountDeletionUnavailableError);
  });

  it("refuses the deletion pre-flight rather than reporting a falsely clear path", async () => {
    const { getDeletionBlockers, AccountDeletionUnavailableError } = await importUnderCutover();
    await expect(getDeletionBlockers(MEMBER)).rejects.toBeInstanceOf(AccountDeletionUnavailableError);
  });

  it("refuses the deletion itself, so no half-delete can occur", async () => {
    const { deleteMemberAccount, AccountDeletionUnavailableError } = await importUnderCutover();
    await expect(deleteMemberAccount(MEMBER)).rejects.toBeInstanceOf(AccountDeletionUnavailableError);
  });

  it("does not block the flows when cutover is off", async () => {
    vi.stubEnv("SUPABASE_CUTOVER", "false");
    vi.resetModules();
    const { getDeletionBlockers, AccountDeletionUnavailableError } = await import("@/lib/account-deletion");
    // Reaches Firestore (which the mock makes throw) — proving the guard did not short-circuit.
    await expect(getDeletionBlockers(MEMBER)).rejects.not.toBeInstanceOf(AccountDeletionUnavailableError);
  });
});
