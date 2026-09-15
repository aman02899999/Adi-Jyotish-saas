import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// firebase-admin/auth is only reached for Firebase-issued tokens; these tests
// assert it is NOT reached for a valid Supabase token, so a throwing stub is the
// strongest possible assertion that routing worked.
const verifyIdToken = vi.fn(async () => {
  throw new Error("firebase should not be called");
});
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken }) }));

const PROJECT_URL = "https://exampleproject.supabase.co";
vi.mock("@/lib/supabase-config", () => ({
  getSupabaseConfig: () => ({ url: PROJECT_URL, connectionString: "postgresql://x", serviceRoleKey: "k" }),
  isSupabaseCutoverActive: () => process.env.SUPABASE_CUTOVER === "true",
}));

import {
  AuthTokenVerificationError,
  decodeUnverifiedJwt,
  looksLikeSupabaseToken,
  signInProviderIsGoogle,
  supabaseIssuer,
  verifyAuthToken,
  verifySupabaseAccessToken,
} from "@/lib/auth-verify";

const SECRET = "test-jwt-secret-not-a-real-one";
const NOW = 1_800_000_000;

function b64url(value: object | string | Buffer): string {
  // A Buffer must be encoded as its raw bytes — JSON.stringify(buffer) would
  // produce {"type":"Buffer","data":[...]} and every signature would mismatch.
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(headerPayload: string, secret = SECRET): string {
  return b64url(createHmac("sha256", secret).update(headerPayload).digest());
}

/** Builds a real HS256 token, overriding any claim or the header. */
function makeToken(overrides: Record<string, unknown> = {}, header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }, secret = SECRET) {
  const payload = {
    iss: supabaseIssuer(PROJECT_URL),
    aud: "authenticated",
    sub: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    email: "member@example.com",
    exp: NOW + 3600,
    iat: NOW,
    ...overrides,
  };
  const head = `${b64url(header)}.${b64url(payload)}`;
  return `${head}.${sign(head, secret)}`;
}

const verify = (token: string, now = NOW) => verifySupabaseAccessToken(token, { projectUrl: PROJECT_URL, jwtSecret: SECRET, now });

describe("supabaseIssuer", () => {
  it("matches GoTrue's issuer for the project", () => {
    expect(supabaseIssuer(PROJECT_URL)).toBe(`${PROJECT_URL}/auth/v1`);
  });

  it("does not double the slash when the url has a trailing one", () => {
    expect(supabaseIssuer(`${PROJECT_URL}/`)).toBe(`${PROJECT_URL}/auth/v1`);
  });
});

describe("decodeUnverifiedJwt", () => {
  it("reads the claims of a well-formed token", () => {
    const decoded = decodeUnverifiedJwt(makeToken());
    expect(decoded?.payload.email).toBe("member@example.com");
    expect(decoded?.header.alg).toBe("HS256");
  });

  it("returns null rather than throwing on garbage", () => {
    for (const bad of ["", "abc", "a.b", "a.b.c.d", "!!!.###.$$$", "eyJhbGci.eyJzdWIi.sig"]) {
      expect(decodeUnverifiedJwt(bad), bad).toBeNull();
    }
  });
});

describe("verifySupabaseAccessToken", () => {
  it("accepts a correctly signed token and returns the subject", () => {
    const result = verify(makeToken());
    expect(result).toEqual({
      uid: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      issuer: "supabase",
      email: "member@example.com",
      emailVerified: false,
      name: null,
      picture: null,
      signInProvider: null,
    });
  });

  it("reads the profile claims GoTrue puts in user_metadata and app_metadata", () => {
    const result = verify(
      makeToken({
        email_verified: true,
        user_metadata: { full_name: "Asha Rao", avatar_url: "https://example.test/a.png" },
        app_metadata: { provider: "google" },
      }),
    );
    expect(result.emailVerified).toBe(true);
    expect(result.name).toBe("Asha Rao");
    expect(result.picture).toBe("https://example.test/a.png");
    expect(result.signInProvider).toBe("google");
    expect(signInProviderIsGoogle(result.signInProvider)).toBe(true);
  });

  it("treats a missing email_verified claim as unverified", () => {
    expect(verify(makeToken()).emailVerified).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    expect(() => verify(makeToken({}, { alg: "HS256", typ: "JWT" }, "the-wrong-secret"))).toThrow(AuthTokenVerificationError);
  });

  it("rejects a payload altered after signing", () => {
    const token = makeToken();
    const [h, , s] = token.split(".");
    // Swap in a different uid without re-signing.
    const forged = `${h}.${b64url({ iss: supabaseIssuer(PROJECT_URL), aud: "authenticated", sub: "attacker", exp: NOW + 3600 })}.${s}`;
    expect(() => verify(forged)).toThrow(/signature is invalid/);
  });

  it("rejects alg=none rather than treating it as unsigned", () => {
    const head = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ iss: supabaseIssuer(PROJECT_URL), aud: "authenticated", sub: "x", exp: NOW + 60 })}`;
    expect(() => verify(`${head}.`)).toThrow(/Unsupported token algorithm/);
  });

  it("rejects an expired token", () => {
    expect(() => verify(makeToken({ exp: NOW - 3600 }))).toThrow(/expired/);
  });

  it("tolerates small clock skew but not a lot", () => {
    expect(() => verify(makeToken({ exp: NOW - 10 }))).not.toThrow();
    expect(() => verify(makeToken({ exp: NOW - 300 }))).toThrow(/expired/);
  });

  it("rejects a token that is not valid yet", () => {
    expect(() => verify(makeToken({ nbf: NOW + 3600 }))).toThrow(/not valid yet/);
  });

  it("rejects a token issued by another project", () => {
    expect(() => verify(makeToken({ iss: "https://someone-else.supabase.co/auth/v1" }))).toThrow(/issuer is not this project/);
  });

  it("rejects the anon audience", () => {
    expect(() => verify(makeToken({ aud: "anon" }))).toThrow(/audience/);
  });

  it("rejects a token with no subject", () => {
    expect(() => verify(makeToken({ sub: "" }))).toThrow(/no subject/);
  });

  it("refuses to run without a jwt secret", () => {
    expect(() => verifySupabaseAccessToken(makeToken(), { projectUrl: PROJECT_URL, jwtSecret: "", now: NOW })).toThrow(
      /SUPABASE_JWT_SECRET/,
    );
  });

  it("rejects a malformed token", () => {
    expect(() => verify("not-a-jwt")).toThrow(/Malformed token/);
  });
});

describe("looksLikeSupabaseToken", () => {
  it("recognises this project's token by issuer", () => {
    expect(looksLikeSupabaseToken(makeToken(), PROJECT_URL)).toBe(true);
  });

  it("does not recognise another project's token", () => {
    expect(looksLikeSupabaseToken(makeToken({ iss: "https://other.supabase.co/auth/v1" }), PROJECT_URL)).toBe(false);
  });

  it("does not mistake a Firebase id token for one", () => {
    // Firebase tokens are also JWTs; their issuer is securetoken.googleapis.com.
    const firebaseShaped = makeToken({ iss: "https://securetoken.google.com/my-project" });
    expect(looksLikeSupabaseToken(firebaseShaped, PROJECT_URL)).toBe(false);
  });
});

describe("verifyAuthToken routing", () => {
  const originalCutover = process.env.SUPABASE_CUTOVER;
  const originalSecret = process.env.SUPABASE_JWT_SECRET;

  beforeEach(() => {
    verifyIdToken.mockClear();
    process.env.SUPABASE_JWT_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalCutover === undefined) delete process.env.SUPABASE_CUTOVER;
    else process.env.SUPABASE_CUTOVER = originalCutover;
    if (originalSecret === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = originalSecret;
  });

  it("verifies a Supabase token under cutover without touching Firebase", async () => {
    process.env.SUPABASE_CUTOVER = "true";
    const result = await verifyAuthToken(makeToken());
    expect(result.issuer).toBe("supabase");
    expect(result.uid).toBe("3f2504e0-4f89-41d3-9a0c-0305e82c3301");
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("falls through to Firebase for a Firebase-issued token under cutover", async () => {
    process.env.SUPABASE_CUTOVER = "true";
    verifyIdToken.mockResolvedValueOnce({
      uid: "firebase-uid-1",
      email: "f@example.com",
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
    } as never);
    const firebaseShaped = makeToken({ iss: "https://securetoken.google.com/my-project" });
    const result = await verifyAuthToken(firebaseShaped);
    expect(result.uid).toBe("firebase-uid-1");
    expect(result.issuer).toBe("firebase");
    expect(result.email).toBe("f@example.com");
  });

  it("will not accept a Supabase token while cutover is off", async () => {
    process.env.SUPABASE_CUTOVER = "false";
    // Falls through to Firebase, whose stub throws — so the token is rejected
    // rather than silently trusted.
    await expect(verifyAuthToken(makeToken())).rejects.toBeInstanceOf(AuthTokenVerificationError);
  });

  it("rejects an empty token", async () => {
    process.env.SUPABASE_CUTOVER = "true";
    await expect(verifyAuthToken("")).rejects.toBeInstanceOf(AuthTokenVerificationError);
    await expect(verifyAuthToken("   ")).rejects.toBeInstanceOf(AuthTokenVerificationError);
  });

  it("rejects a Supabase token with a bad signature even under cutover", async () => {
    process.env.SUPABASE_CUTOVER = "true";
    const token = makeToken({}, { alg: "HS256", typ: "JWT" }, "wrong-secret");
    await expect(verifyAuthToken(token)).rejects.toBeInstanceOf(AuthTokenVerificationError);
  });
});
