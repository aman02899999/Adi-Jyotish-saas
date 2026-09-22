import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decryptPayoutField,
  encryptPayoutField,
  isPayoutEncryptionConfigured,
  maskAccountNumber,
} from "@/lib/payout-crypto";

/**
 * Practitioner bank and UPI details are the most sensitive rows the platform stores, and this is
 * the only thing standing between them and anyone who can read the database. The properties
 * asserted here are the ones whose loss would not show up as a failing feature: a fixed IV still
 * round-trips, an unverified tag still decrypts, a mask that slices the wrong end still renders.
 * Each would ship green without these tests.
 */

const KEY = Buffer.alloc(32, 7).toString("base64");

afterEach(() => {
  vi.unstubAllEnvs();
});

function withKey() {
  vi.stubEnv("PAYOUT_ENCRYPTION_KEY", KEY);
}

describe("isPayoutEncryptionConfigured", () => {
  it("is false when no key is set, so callers can refuse to store details in the clear", () => {
    vi.stubEnv("PAYOUT_ENCRYPTION_KEY", "");
    expect(isPayoutEncryptionConfigured()).toBe(false);
  });

  it("is true once a key is present", () => {
    withKey();
    expect(isPayoutEncryptionConfigured()).toBe(true);
  });
});

describe("encryptPayoutField / decryptPayoutField", () => {
  it("round-trips an account number", () => {
    withKey();
    const stored = encryptPayoutField("50100412345678");
    expect(decryptPayoutField(stored)).toBe("50100412345678");
  });

  it("round-trips non-ASCII, so a UPI handle or name is not silently corrupted", () => {
    withKey();
    const stored = encryptPayoutField("अमन@okaxis");
    expect(decryptPayoutField(stored)).toBe("अमन@okaxis");
  });

  it("never stores the plaintext inside the ciphertext envelope", () => {
    withKey();
    expect(encryptPayoutField("50100412345678")).not.toContain("50100412345678");
  });

  it("produces a different ciphertext each time for the same input", () => {
    withKey();
    // A fixed IV would make identical account numbers encrypt identically, leaking which
    // practitioners share a payout account to anyone reading the table.
    const a = encryptPayoutField("50100412345678");
    const b = encryptPayoutField("50100412345678");
    expect(a).not.toBe(b);
    expect(decryptPayoutField(a)).toBe(decryptPayoutField(b));
  });

  it("emits the documented iv:tag:ciphertext envelope", () => {
    withKey();
    const parts = encryptPayoutField("50100412345678").split(":");
    expect(parts).toHaveLength(3);
    // 12-byte IV -> 16 base64 chars; 16-byte GCM tag -> 24.
    expect(Buffer.from(parts[0], "base64")).toHaveLength(12);
    expect(Buffer.from(parts[1], "base64")).toHaveLength(16);
  });

  it("returns null when the ciphertext was tampered with", () => {
    withKey();
    const [iv, tag, data] = encryptPayoutField("50100412345678").split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    expect(decryptPayoutField(`${iv}:${tag}:${flipped.toString("base64")}`)).toBeNull();
  });

  it("returns null when the auth tag was tampered with", () => {
    withKey();
    const [iv, tag, data] = encryptPayoutField("50100412345678").split(":");
    const flipped = Buffer.from(tag, "base64");
    flipped[0] ^= 0xff;
    expect(decryptPayoutField(`${iv}:${flipped.toString("base64")}:${data}`)).toBeNull();
  });

  it("returns null for a malformed envelope rather than throwing into the request", () => {
    withKey();
    expect(decryptPayoutField("")).toBeNull();
    expect(decryptPayoutField("only-one-part")).toBeNull();
    expect(decryptPayoutField("two:parts")).toBeNull();
  });

  it("returns null when decrypting with a different key", () => {
    withKey();
    const stored = encryptPayoutField("50100412345678");
    vi.stubEnv("PAYOUT_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
    expect(decryptPayoutField(stored)).toBeNull();
  });

  it("refuses to encrypt when the key is missing", () => {
    vi.stubEnv("PAYOUT_ENCRYPTION_KEY", "");
    expect(() => encryptPayoutField("50100412345678")).toThrow(/not configured/);
  });

  it("refuses a key that does not decode to 32 bytes", () => {
    // Guards against a truncated or non-base64 paste silently weakening the cipher.
    vi.stubEnv("PAYOUT_ENCRYPTION_KEY", Buffer.alloc(16, 1).toString("base64"));
    expect(() => encryptPayoutField("50100412345678")).toThrow(/32 bytes/);
  });
});

describe("maskAccountNumber", () => {
  it("reveals only the last four digits", () => {
    expect(maskAccountNumber("50100412345678")).toBe("•••• 5678");
  });

  it("reveals nothing when the value is too short to mask meaningfully", () => {
    expect(maskAccountNumber("1234")).toBe("••••");
    expect(maskAccountNumber("")).toBe("••••");
  });
});
