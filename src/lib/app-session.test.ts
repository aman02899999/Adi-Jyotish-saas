import { createHmac, hkdfSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppSessionError, createAppSessionToken, verifyAppSessionToken } from "@/lib/app-session";

const SECRET = "test-supabase-jwt-secret-abcdef0123456789";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-10T00:00:00.000Z");
const NOW_S = Math.floor(NOW / 1000);

const originalSecret = process.env.SUPABASE_JWT_SECRET;

beforeEach(() => {
  process.env.SUPABASE_JWT_SECRET = SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SUPABASE_JWT_SECRET;
  else process.env.SUPABASE_JWT_SECRET = originalSecret;
});

/** Rebuild a token with an arbitrary payload or signature, keeping the same
 * shape, so the tests can attack one part at a time. */
function forge(parts: { payload?: string; signature?: string; version?: string }) {
  const token = createAppSessionToken({ uid: "u1" }, TTL_MS, NOW);
  const [version, payload, signature] = token.split(".");
  return [parts.version ?? version, parts.payload ?? payload, parts.signature ?? signature].join(".");
}

function encode(claims: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
}

/** Recomputes the module's documented key derivation so the tests can sign an
 * arbitrary payload and still present a VALID signature. Without this, every
 * payload-shape test below would be rejected by the signature check first and
 * would pass even if the claim validation were deleted entirely.
 *
 * The salt, info and length are duplicated here on purpose: this is a versioned
 * token format, so if the derivation ever changes these tests must fail. */
function derivedKey(secret: string) {
  return Buffer.from(hkdfSync("sha256", secret, "adi-jyotish.app-session", "session-cookie-signing-key.v1", 32));
}

function signedToken(claims: Record<string, unknown>, secret: string = SECRET) {
  const payload = encode(claims);
  return `asv1.${payload}.${createHmac("sha256", derivedKey(secret)).update(payload).digest("base64url")}`;
}

describe("createAppSessionToken", () => {
  it("round-trips the subject and both timestamps", () => {
    const token = createAppSessionToken({ uid: "user-1", emailVerified: true }, TTL_MS, NOW);
    const payload = verifyAppSessionToken(token, NOW);
    expect(payload).toEqual({ sub: "user-1", iat: NOW_S, exp: NOW_S + 7 * 24 * 60 * 60, emailVerified: true });
  });

  it("treats a missing emailVerified as unverified rather than undefined", () => {
    // member-auth.ts branches on this to decide whether to nag about
    // verification, so it must never come back as undefined.
    const token = createAppSessionToken({ uid: "user-1" }, TTL_MS, NOW);
    expect(verifyAppSessionToken(token, NOW).emailVerified).toBe(false);
  });

  it("refuses to mint a cookie with no subject or no lifetime", () => {
    expect(() => createAppSessionToken({ uid: "" }, TTL_MS, NOW)).toThrow(AppSessionError);
    expect(() => createAppSessionToken({ uid: "u1" }, 0, NOW)).toThrow(AppSessionError);
    expect(() => createAppSessionToken({ uid: "u1" }, -1, NOW)).toThrow(AppSessionError);
    expect(() => createAppSessionToken({ uid: "u1" }, Number.NaN, NOW)).toThrow(AppSessionError);
  });
});

describe("verifyAppSessionToken rejects tampering", () => {
  it("rejects a payload edited without re-signing", () => {
    const forged = forge({ payload: encode({ sub: "someone-else", iat: NOW_S, exp: NOW_S + 3600, emailVerified: true }) });
    expect(() => verifyAppSessionToken(forged, NOW)).toThrow("signature mismatch");
  });

  it("rejects a payload whose subject was widened but whose length is unchanged", () => {
    // Same byte length as the original payload, so a naive equality check on the
    // signature would pass; only the HMAC catches it.
    const original = createAppSessionToken({ uid: "user-1" }, TTL_MS, NOW);
    const [, payload] = original.split(".");
    const swapped = encode({ sub: "user-2", iat: NOW_S, exp: NOW_S + 7 * 24 * 60 * 60, emailVerified: false });
    const padded = swapped.length === payload.length ? swapped : swapped.slice(0, payload.length);
    expect(padded).toHaveLength(payload.length);
    expect(() => verifyAppSessionToken(forge({ payload: padded }), NOW)).toThrow("signature mismatch");
  });

  it("rejects a signature computed with the raw secret instead of the derived key", () => {
    // The signing key is HKDF-derived from SUPABASE_JWT_SECRET for domain
    // separation. If someone "simplifies" that to the raw secret, this fails.
    const payload = encode({ sub: "user-1", iat: NOW_S, exp: NOW_S + 3600, emailVerified: false });
    const rawSignature = createHmac("sha256", SECRET).update(payload).digest("base64url");
    expect(rawSignature).not.toBe(createHmac("sha256", derivedKey(SECRET)).update(payload).digest("base64url"));
    expect(() => verifyAppSessionToken(`asv1.${payload}.${rawSignature}`, NOW)).toThrow("signature mismatch");
  });

  it("rejects a token signed under a different secret", () => {
    const token = createAppSessionToken({ uid: "user-1" }, TTL_MS, NOW);
    process.env.SUPABASE_JWT_SECRET = "a-completely-different-jwt-secret-987654";
    expect(() => verifyAppSessionToken(token, NOW)).toThrow(AppSessionError);
  });

  it("rejects a signature that differs by one character", () => {
    const token = createAppSessionToken({ uid: "user-1" }, TTL_MS, NOW);
    const [version, payload, signature] = token.split(".");
    const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
    expect(() => verifyAppSessionToken(`${version}.${payload}.${flipped}`, NOW)).toThrow("signature mismatch");
  });

  it("rejects an empty signature rather than comparing zero bytes", () => {
    expect(() => verifyAppSessionToken(forge({ signature: "" }), NOW)).toThrow(AppSessionError);
  });
});

describe("verifyAppSessionToken rejects malformed input", () => {
  // Built lazily: an it.each array literal is evaluated while the module is
  // collected, which is before beforeEach installs SUPABASE_JWT_SECRET, so
  // calling forge() there throws during collection instead of inside a test.
  it.each<[string, () => string]>([
    ["an empty string", () => ""],
    ["a bare string", () => "not-a-token"],
    ["the wrong version", () => forge({ version: "asv0" })],
    ["too few segments", () => "asv1.abc"],
    ["too many segments", () => "asv1.abc.def.ghi"],
  ])("rejects %s", (_label, make) => {
    expect(() => verifyAppSessionToken(make(), NOW)).toThrow(AppSessionError);
  });

  it("rejects a payload that is not JSON", () => {
    expect(() => verifyAppSessionToken(forge({ payload: "bm90LWpzb24" }), NOW)).toThrow(AppSessionError);
  });

  it.each([["a JSON string", '"hello"'], ["a JSON array", "[]"], ["a JSON null", "null"], ["a JSON number", "42"]])(
    "rejects a validly signed payload that is %s rather than an object",
    (_label, json) => {
      const payload = Buffer.from(json, "utf8").toString("base64url");
      const token = `asv1.${payload}.${createHmac("sha256", derivedKey(SECRET)).update(payload).digest("base64url")}`;
      expect(() => verifyAppSessionToken(token, NOW)).toThrow("Malformed session cookie payload");
    },
  );

  it("rejects claims of the wrong type", () => {
    for (const claims of [
      { sub: "u1", iat: "not-a-number", exp: NOW_S + 3600, emailVerified: true },
      { sub: "u1", iat: NOW_S, exp: "not-a-number", emailVerified: true },
      { sub: "u1", iat: NOW_S, exp: NOW_S + 3600, emailVerified: "yes" },
      { sub: "u1", iat: NOW_S, exp: NOW_S + 3600 },
    ]) {
      expect(() => verifyAppSessionToken(signedToken(claims), NOW)).toThrow("Malformed session cookie claims");
    }
  });

  it("rejects a validly signed but empty subject", () => {
    expect(() => verifyAppSessionToken(signedToken({ sub: "", iat: NOW_S, exp: NOW_S + 3600, emailVerified: true }), NOW)).toThrow(
      "Session cookie has no subject",
    );
  });
});

describe("verifyAppSessionToken expiry", () => {
  it("accepts a token inside its lifetime and rejects it one second past", () => {
    const token = createAppSessionToken({ uid: "u1" }, 60_000, NOW);
    expect(verifyAppSessionToken(token, NOW + 59_000).sub).toBe("u1");
    expect(() => verifyAppSessionToken(token, NOW + 61_000)).toThrow("expired");
  });

  it("rejects a token issued more than the clock-skew allowance in the future", () => {
    // A forged iat far in the future would otherwise survive any revocation
    // timestamp, since revocation compares against iat.
    const token = createAppSessionToken({ uid: "u1" }, TTL_MS, NOW + 3600_000);
    expect(() => verifyAppSessionToken(token, NOW)).toThrow("issued in the future");
  });

  it("tolerates a small forward skew", () => {
    const token = createAppSessionToken({ uid: "u1" }, TTL_MS, NOW + 20_000);
    expect(verifyAppSessionToken(token, NOW).sub).toBe("u1");
  });
});

describe("key configuration", () => {
  it("refuses to sign or verify when the secret is missing", () => {
    delete process.env.SUPABASE_JWT_SECRET;
    expect(() => createAppSessionToken({ uid: "u1" }, TTL_MS, NOW)).toThrow(/SUPABASE_JWT_SECRET/);
    expect(() => verifyAppSessionToken("asv1.abc.def", NOW)).toThrow(/SUPABASE_JWT_SECRET/);
  });

  it("refuses a secret too short to be a signing key", () => {
    // A silent fallback to a default key would turn every cookie into a forgery
    // and hide it behind a passing health check.
    process.env.SUPABASE_JWT_SECRET = "short";
    expect(() => createAppSessionToken({ uid: "u1" }, TTL_MS, NOW)).toThrow(/SUPABASE_JWT_SECRET/);
  });
});
