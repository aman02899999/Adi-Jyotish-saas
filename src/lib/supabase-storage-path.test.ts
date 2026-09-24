import { describe, expect, it } from "vitest";

import {
  normalizeStoragePath as tsNormalize,
  storageObjectUrl as tsUrl,
} from "@/lib/supabase-storage";
import {
  normalizeStoragePath as mjsNormalize,
  parseArgs,
  storageObjectUrl as mjsUrl,
} from "../../scripts/migrate-storage-to-supabase.mjs";

/**
 * The copy script and the runtime client each build object URLs, and they must
 * agree exactly: the script writes the object, the app reads it later using the
 * path stored in the ai_readings document. A difference between the two is a
 * silent 404 on the next reading, so these assertions fail the build rather than
 * trusting a "keep in sync" comment.
 */
const CASES = [
  "palm-readings/abc/123/left.jpg",
  "/palm-readings/abc/left.jpg",
  "palm-readings//abc///left.jpg",
  "palm-readings/abc/",
  "//palm-readings//abc/",
  "face readings/a+b/face 0.jpg",
  "face-readings/m1/r2/face-3.webp",
];

describe("the copy script and the runtime client agree", () => {
  it.each(CASES)("normalises %s identically", (path) => {
    expect(mjsNormalize(path)).toBe(tsNormalize(path));
  });

  it.each(CASES)("builds the same object url for %s", (path) => {
    const normalized = tsNormalize(path);
    expect(mjsUrl("https://p.supabase.co", "readings", path)).toBe(
      tsUrl("https://p.supabase.co", "readings", path),
    );
    expect(normalized.length).toBeGreaterThan(0);
  });

  it("both refuse an empty path", () => {
    expect(() => mjsUrl("https://p.supabase.co", "readings", "")).toThrow(/empty/);
    expect(() => tsUrl("https://p.supabase.co", "readings", "")).toThrow(/empty/);
  });
});

describe("parseArgs", () => {
  it("defaults to a real run with no filters", () => {
    expect(parseArgs([])).toEqual({ dryRun: false, verify: false, only: null, bucket: null });
  });

  it("reads every flag", () => {
    expect(parseArgs(["--dry-run", "--verify", "--only=palm-readings/", "--bucket=staging"])).toEqual({
      dryRun: true,
      verify: true,
      only: "palm-readings/",
      bucket: "staging",
    });
  });

  it("treats an empty --only= as no filter rather than a zero-length prefix", () => {
    expect(parseArgs(["--only="]).only).toBeNull();
  });
});
