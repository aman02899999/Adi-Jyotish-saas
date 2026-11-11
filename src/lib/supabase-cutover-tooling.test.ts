import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { authHeaders, ensurePrivateBucket, parseArgs } from "../../scripts/migrate-storage-to-supabase.mjs";
import { pgSslOptions, reverseRemapSql } from "../../scripts/remap-auth-uids.mjs";
import { connectionHint, EXPECTED_TABLES, evaluate, renderMarkdown, type CutoverFacts } from "../../scripts/supabase-cutover-report.mjs";

/**
 * The parts of the cutover tooling that decide things without a database: which direction a
 * remap runs, which headers a key travels in, and what the health report calls a failure.
 */

const healthy: CutoverFacts = {
  tableCount: EXPECTED_TABLES,
  rlsOff: [],
  exposed: [],
  rolesChecked: ["anon", "authenticated"],
  counts: [
    { table: "members", rows: 3 },
    { table: "bookings", rows: 0 },
  ],
  totalRows: 3,
  authUsers: 3,
  signedIn: 0,
  buckets: [{ id: "readings", public: false }],
  objects: 2,
  mapped: 3,
  membersStillOnFirebaseId: 0,
  membersWithoutLogin: 0,
  walletEntriesMissingBalance: 0,
};

const failed = (facts: CutoverFacts, options = {}) =>
  evaluate(facts, options)
    .checks.filter((c) => !c.ok && c.blocking)
    .map((c) => c.label);

describe("cutover health report", () => {
  it("passes a complete, closed database in every mode", () => {
    expect(evaluate(healthy).ok).toBe(true);
    expect(evaluate(healthy, { guardCopy: true }).ok).toBe(true);
    expect(evaluate(healthy, { afterCopy: true }).ok).toBe(true);
  });

  it("fails when a table has row security off", () => {
    expect(failed({ ...healthy, rlsOff: ["members"] })).toEqual(["Row security is on for every table"]);
  });

  it("fails when the public key can read rows, even with row security reported on", () => {
    expect(failed({ ...healthy, exposed: ["members (anon)"] })).toEqual(["The public API key can read no rows"]);
  });

  it("does not report 'nothing readable' when the question could not be asked", () => {
    expect(failed({ ...healthy, rolesChecked: [] })).toEqual(["The public API key can read no rows"]);
  });

  it("fails when a migration is missing", () => {
    expect(failed({ ...healthy, tableCount: EXPECTED_TABLES - 1 })).toEqual(["All tables exist"]);
  });

  it("fails on a public photo bucket, and accepts one that does not exist yet", () => {
    expect(failed({ ...healthy, buckets: [{ id: "readings", public: true }] })).toEqual(["Photo storage is private"]);
    expect(evaluate({ ...healthy, buckets: [] }).ok).toBe(true);
  });

  it("refuses to overwrite a database people already sign in to, unless told to", () => {
    const live = { ...healthy, signedIn: 2 };
    expect(evaluate(live).ok).toBe(true);
    expect(evaluate(live, { guardCopy: true }).ok).toBe(false);
    expect(evaluate(live, { guardCopy: true, allowAfterSignins: true }).ok).toBe(true);
  });

  it("after a copy, fails on each way the copy can be incomplete", () => {
    const after = { afterCopy: true };
    expect(failed({ ...healthy, totalRows: 0 }, after)).toEqual(["Data has arrived"]);
    expect(failed({ ...healthy, mapped: 0 }, after)).toEqual(["Logins were copied"]);
    expect(failed({ ...healthy, membersStillOnFirebaseId: 1 }, after)).toEqual(["No member is left on a Firebase id"]);
    expect(failed({ ...healthy, walletEntriesMissingBalance: 1 }, after)).toEqual(["Every wallet entry carries its balance"]);
    expect(failed({ ...healthy, buckets: [] }, after)).toEqual(["Photo storage bucket exists"]);
  });

  it("reports members without a login as a note, not a failure", () => {
    const verdict = evaluate({ ...healthy, membersWithoutLogin: 4 }, { afterCopy: true });
    expect(verdict.ok).toBe(true);
    expect(renderMarkdown(healthy, verdict, "t")).toContain("| Every member has a login | note | 4 member row(s) have no login |");
  });

  it("renders the verdict and only the tables that hold rows", () => {
    const markdown = renderMarkdown(healthy, evaluate(healthy), "Supabase health check");
    expect(markdown).toContain("**PASSED**");
    expect(markdown).toContain("| members | 3 |");
    expect(markdown).not.toContain("| bookings |");
  });
});

describe("reversing the uid remap", () => {
  const sql = readFileSync("scripts/rewrite-auth-uids.sql", "utf8");
  const reversed = reverseRemapSql(sql);

  it("swaps every assignment and comparison", () => {
    expect(reversed).toContain("set id = map.firebase_uid");
    expect(reversed).toContain("where m.id = map.supabase_uid::text");
    expect(reversed).not.toMatch(/set \w+ = map\.supabase_uid/);
    // Text compared with a uuid has no operator; every reversed comparison needs the cast.
    expect(reversed).not.toMatch(/map\.supabase_uid(?!::text)/);
  });

  it("keeps the same number of statements in each direction", () => {
    const count = (text: string, needle: RegExp) => (text.match(needle) ?? []).length;
    expect(count(reversed, /map\.firebase_uid/g)).toBe(count(sql, /map\.supabase_uid/g));
    expect(count(reversed, /map\.supabase_uid::text/g)).toBe(count(sql, /map\.firebase_uid/g));
  });

  it("refuses SQL it does not recognise instead of returning it unchanged", () => {
    expect(() => reverseRemapSql("select 1")).toThrow(/shape/);
  });
});

describe("copy script connection and key handling", () => {
  it("verifies the database certificate unless explicitly local", () => {
    expect(pgSslOptions({})).toEqual({ rejectUnauthorized: true });
    expect(pgSslOptions({ SUPABASE_CA_CERT: "A\\nB" })).toEqual({ ca: "A\nB", rejectUnauthorized: true });
    expect(pgSslOptions({ PGSSLMODE: "disable" })).toBeUndefined();
  });

  it("sends a JWT key as a bearer token and a secret key in apikey only", () => {
    expect(authHeaders("eyJabc")).toEqual({ apikey: "eyJabc", Authorization: "Bearer eyJabc" });
    expect(authHeaders("sb_secret_abc")).toEqual({ apikey: "sb_secret_abc" });
  });

  it("parses --ensure-bucket", () => {
    expect(parseArgs(["--ensure-bucket"]).ensureBucket).toBe(true);
    expect(parseArgs([]).ensureBucket).toBe(false);
  });
});

describe("ensurePrivateBucket", () => {
  type Call = { url: string; method: string; body?: string };
  const fake = (responses: Array<{ ok: boolean; status?: number; json?: unknown }>) => {
    const calls: Call[] = [];
    const impl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
      const next = responses.shift()!;
      return { ok: next.ok, status: next.status ?? (next.ok ? 200 : 404), json: async () => next.json };
    }) as unknown as typeof fetch;
    return { calls, impl };
  };

  it("leaves an existing private bucket alone", async () => {
    const { calls, impl } = fake([{ ok: true, json: { id: "readings", public: false } }]);
    await expect(ensurePrivateBucket("https://x.supabase.co/", "sb_secret_k", "readings", impl)).resolves.toBe("exists");
    expect(calls).toEqual([{ url: "https://x.supabase.co/storage/v1/bucket/readings", method: "GET", body: undefined }]);
  });

  it("refuses to copy private photos into a public bucket", async () => {
    const { impl } = fake([{ ok: true, json: { id: "readings", public: true } }]);
    await expect(ensurePrivateBucket("https://x.supabase.co", "k", "readings", impl)).rejects.toThrow(/PUBLIC/);
  });

  it("creates a missing bucket as private", async () => {
    const { calls, impl } = fake([{ ok: false }, { ok: true, json: {} }]);
    await expect(ensurePrivateBucket("https://x.supabase.co", "k", "readings", impl)).resolves.toBe("created");
    expect(calls[1].method).toBe("POST");
    expect(JSON.parse(calls[1].body!)).toEqual({ id: "readings", name: "readings", public: false });
  });

  it("fails loudly when the bucket cannot be created", async () => {
    const { impl } = fake([{ ok: false }, { ok: false, status: 403 }]);
    await expect(ensurePrivateBucket("https://x.supabase.co", "k", "readings", impl)).rejects.toThrow(/403/);
  });
});

describe("connectionHint", () => {
  const direct = "postgresql://postgres:s3cret-pw@db.abcdefgh.supabase.co:5432/postgres";
  const pooler = "postgresql://postgres.abcdefgh:s3cret-pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";

  it("names the IPv6-only direct connection when the runner cannot reach it", () => {
    expect(connectionHint(direct, { code: "ENETUNREACH" })).toMatch(/Session pooler/);
    expect(connectionHint(pooler, { code: "ENETUNREACH" })).not.toMatch(/Direct connection/);
  });

  it("names a wrong password and a certificate problem", () => {
    expect(connectionHint(pooler, { code: "28P01", message: "password authentication failed" })).toMatch(/password/);
    expect(connectionHint(pooler, { code: "SELF_SIGNED_CERT_IN_CHAIN", message: "self-signed certificate in certificate chain" })).toMatch(/SUPABASE_CA_CERT/);
  });

  it("never repeats the connection string or its password", () => {
    for (const error of [{ code: "ENETUNREACH" }, { code: "28P01" }, { message: "certificate" }, { message: "other" }, null]) {
      for (const url of [direct, pooler, "not a url s3cret-pw"]) {
        expect(connectionHint(url, error)).not.toContain("s3cret-pw");
      }
    }
  });
});
