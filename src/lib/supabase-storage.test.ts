import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { normalizeStoragePath, storageBucketName, storageObjectUrl } from "@/lib/supabase-storage";

const PROJECT_URL = "https://exampleproject.supabase.co";

/**
 * The paths written by the Firebase version are already stored in ai_readings
 * documents, so the Supabase client has to resolve exactly those strings. A path
 * that is subtly wrong does not fail at write time — it fails as a 404 when the
 * reading is opened, possibly weeks later.
 */
describe("normalizeStoragePath", () => {
  it("leaves an already-clean path alone", () => {
    expect(normalizeStoragePath("palm-readings/abc/123/left.jpg")).toBe("palm-readings/abc/123/left.jpg");
  });

  it("strips a leading slash", () => {
    expect(normalizeStoragePath("/palm-readings/abc/left.jpg")).toBe("palm-readings/abc/left.jpg");
  });

  it("collapses doubled separators", () => {
    expect(normalizeStoragePath("palm-readings//abc///left.jpg")).toBe("palm-readings/abc/left.jpg");
  });

  it("strips a trailing slash", () => {
    expect(normalizeStoragePath("palm-readings/abc/")).toBe("palm-readings/abc");
  });

  it("handles all three at once", () => {
    expect(normalizeStoragePath("//palm-readings//abc/")).toBe("palm-readings/abc");
  });
});

describe("storageObjectUrl", () => {
  it("builds the Storage REST url for an object", () => {
    expect(storageObjectUrl(PROJECT_URL, "readings", "palm-readings/abc/123/left.jpg")).toBe(
      `${PROJECT_URL}/storage/v1/object/readings/palm-readings/abc/123/left.jpg`,
    );
  });

  it("normalises the path before building the url", () => {
    expect(storageObjectUrl(PROJECT_URL, "readings", "/palm-readings//abc/left.jpg")).toBe(
      `${PROJECT_URL}/storage/v1/object/readings/palm-readings/abc/left.jpg`,
    );
  });

  it("does not double the slash when the project url has a trailing one", () => {
    expect(storageObjectUrl(`${PROJECT_URL}/`, "readings", "a/b.jpg")).toBe(`${PROJECT_URL}/storage/v1/object/readings/a/b.jpg`);
  });

  it("percent-encodes each segment but keeps the separators", () => {
    const url = storageObjectUrl(PROJECT_URL, "readings", "face readings/a+b/face 0.jpg");
    expect(url).toBe(`${PROJECT_URL}/storage/v1/object/readings/face%20readings/a%2Bb/face%200.jpg`);
    // The separator must survive encoding, or the whole path becomes one segment.
    // "face readings/a+b/face 0.jpg" is three segments; if the separators were
    // encoded too this would come back as one.
    expect(url.split("/storage/v1/object/readings/")[1].split("/")).toHaveLength(3);
  });

  it("refuses an empty path instead of addressing the bucket root", () => {
    expect(() => storageObjectUrl(PROJECT_URL, "readings", "")).toThrow(/empty/);
    expect(() => storageObjectUrl(PROJECT_URL, "readings", "///")).toThrow(/empty/);
  });
});

describe("storageBucketName", () => {
  const original = process.env.SUPABASE_STORAGE_BUCKET;

  afterEach(() => {
    if (original === undefined) delete process.env.SUPABASE_STORAGE_BUCKET;
    else process.env.SUPABASE_STORAGE_BUCKET = original;
  });

  beforeEach(() => {
    delete process.env.SUPABASE_STORAGE_BUCKET;
  });

  it("defaults to the readings bucket", () => {
    expect(storageBucketName()).toBe("readings");
  });

  it("honours an override, trimmed", () => {
    process.env.SUPABASE_STORAGE_BUCKET = "  custom-bucket  ";
    expect(storageBucketName()).toBe("custom-bucket");
  });

  it("falls back when the override is only whitespace", () => {
    process.env.SUPABASE_STORAGE_BUCKET = "   ";
    expect(storageBucketName()).toBe("readings");
  });
});
