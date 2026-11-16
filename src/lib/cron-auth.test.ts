import { describe, expect, it } from "vitest";
import { cronAuthorized, tokenMatches } from "./cron-auth";

const req = (auth?: string) => new Request("https://x.in/api/cron/daily", { headers: auth ? { authorization: auth } : {} });

describe("cron auth", () => {
  it("accepts only the exact bearer secret", () => {
    const env = { CRON_SECRET: "s3cret", NODE_ENV: "production" };
    expect(cronAuthorized(req("Bearer s3cret"), env)).toBe(true);
    expect(cronAuthorized(req("Bearer s3cre"), env)).toBe(false);
    expect(cronAuthorized(req("Bearer s3cret2"), env)).toBe(false);
    expect(cronAuthorized(req("s3cret"), env)).toBe(false);
    expect(cronAuthorized(req(), env)).toBe(false);
  });

  it("fails closed in production when the secret is missing, open only in local development", () => {
    expect(cronAuthorized(req(), { NODE_ENV: "production" })).toBe(false);
    expect(cronAuthorized(req("Bearer "), { NODE_ENV: "production" })).toBe(false);
    expect(cronAuthorized(req(), { NODE_ENV: "development" })).toBe(true);
    // Optional mode (admin-or-cron routes): no secret means the cron branch never passes.
    expect(cronAuthorized(req(), { NODE_ENV: "development" }, { allowUnsetInDev: false })).toBe(false);
  });

  it("compares tokens without leaking length or content", () => {
    expect(tokenMatches("abc", "abc")).toBe(true);
    expect(tokenMatches("abc", "abd")).toBe(false);
    expect(tokenMatches("abc", "abcd")).toBe(false);
    expect(tokenMatches(null, "abc")).toBe(false);
    expect(tokenMatches("abc", undefined)).toBe(false);
    expect(tokenMatches("", "")).toBe(false);
  });
});
