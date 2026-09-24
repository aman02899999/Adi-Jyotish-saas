import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteSupabaseStoragePrefix } from "@/lib/supabase-storage";

/**
 * The erasure path's storage half. Before this existed, deleting an account under cutover left
 * every palm and face photograph readable in the bucket — the Firebase-only helper silently
 * no-opped because Firebase is unconfigured after cutover.
 *
 * The first version of these tests mocked a *flat* listing, and so passed against an
 * implementation that erased nothing. Production writes two levels down:
 *
 *     palm-readings/{memberId}/{readingId}/left.jpg
 *     face-readings/{memberId}/{readingId}/face-0.jpg
 *
 * and `object/list` is folder-scoped, so listing palm-readings/{memberId}/ returns pseudo-folders
 * named after reading ids — which the delete endpoint ignores. Every fixture here is therefore
 * nested, because a flat one cannot tell a working erasure from a broken one.
 */

const ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_DB_URL: "postgresql://postgres:secret@db.example.supabase.co:5432/postgres",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

function setup() {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

/** How the API describes a stored object: a uuid id. */
const file = (name: string) => ({ name, id: "0f8fad5b-d9cb-469f-a165-70867728950e" });
/** How it describes a pseudo-folder: an explicit null id. */
const folder = (name: string) => ({ name, id: null });

/**
 * Serves listings from a path→entries map and records every DELETE body, so a test asserts on the
 * object paths that actually reach the delete endpoint rather than on call counts.
 */
function bucketWith(tree: Record<string, unknown[]>) {
  const deleted: string[][] = [];
  const fetchMock = vi.fn(async (url: string, init: { method?: string; body?: string }) => {
    if (init?.method === "DELETE") {
      deleted.push(JSON.parse(init.body as string).prefixes as string[]);
      return jsonResponse({});
    }
    const { prefix, offset = 0, limit = 100 } = JSON.parse(init.body as string) as {
      prefix: string; offset?: number; limit?: number;
    };
    return jsonResponse((tree[prefix] ?? []).slice(offset, offset + limit));
  });
  vi.stubGlobal("fetch", fetchMock);
  return { deleted, fetchMock };
}

describe("deleteSupabaseStoragePrefix", () => {
  it("descends into per-reading folders and deletes the images inside them", async () => {
    setup();
    const { deleted } = bucketWith({
      "palm-readings/m1": [folder("r1"), folder("r2")],
      "palm-readings/m1/r1": [file("left.jpg"), file("right.jpg")],
      "palm-readings/m1/r2": [file("left.png")],
    });

    expect(await deleteSupabaseStoragePrefix("palm-readings/m1/")).toBe(3);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].sort()).toEqual([
      "palm-readings/m1/r1/left.jpg",
      "palm-readings/m1/r1/right.jpg",
      "palm-readings/m1/r2/left.png",
    ]);
  });

  it("never hands a folder path to the delete endpoint", async () => {
    setup();
    const { deleted } = bucketWith({
      "face-readings/m1": [folder("r1")],
      "face-readings/m1/r1": [file("face-0.jpg")],
    });

    await deleteSupabaseStoragePrefix("face-readings/m1/");
    // "face-readings/m1/r1" is not an object; deleting it removes nothing, which is precisely how
    // the previous implementation reported success while leaving the photographs in place.
    expect(deleted[0]).not.toContain("face-readings/m1/r1");
  });

  it("walks deeper than two levels rather than assuming the current layout", async () => {
    setup();
    const { deleted } = bucketWith({
      "palm-readings/m1": [folder("r1")],
      "palm-readings/m1/r1": [folder("originals"), file("left.jpg")],
      "palm-readings/m1/r1/originals": [file("raw.png")],
    });

    expect(await deleteSupabaseStoragePrefix("palm-readings/m1/")).toBe(2);
    expect(deleted[0].sort()).toEqual(["palm-readings/m1/r1/left.jpg", "palm-readings/m1/r1/originals/raw.png"]);
  });

  it("handles images sitting directly under the prefix", async () => {
    setup();
    const { deleted } = bucketWith({ "palm-readings/m1": [file("a.jpg"), file("b.jpg")] });

    expect(await deleteSupabaseStoragePrefix("palm-readings/m1/")).toBe(2);
    expect(deleted[0]).toEqual(["palm-readings/m1/a.jpg", "palm-readings/m1/b.jpg"]);
  });

  it("pages past the per-page cap at the top level", async () => {
    setup();
    const { deleted } = bucketWith({
      "face-readings/m1": Array.from({ length: 101 }, (_, i) => folder(`r${i}`)),
      ...Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [`face-readings/m1/r${i}`, [file("face-0.jpg")]]),
      ),
    });

    // Stopping at one page would leave reading 101's photograph behind — readable, after the
    // member was told their data was destroyed.
    expect(await deleteSupabaseStoragePrefix("face-readings/m1/")).toBe(101);
    expect(deleted[0]).toContain("face-readings/m1/r100/face-0.jpg");
  });

  it("pages past the per-page cap inside a single reading folder", async () => {
    setup();
    const { deleted } = bucketWith({
      "face-readings/m1": [folder("r1")],
      "face-readings/m1/r1": Array.from({ length: 101 }, (_, i) => file(`face-${i}.jpg`)),
    });

    expect(await deleteSupabaseStoragePrefix("face-readings/m1/")).toBe(101);
    expect(deleted[0]).toContain("face-readings/m1/r1/face-100.jpg");
  });

  it("deletes nothing and reports zero when the prefix is empty", async () => {
    setup();
    const { deleted } = bucketWith({});
    expect(await deleteSupabaseStoragePrefix("palm-readings/m1/")).toBe(0);
    // No DELETE at all — an unconditional delete of an empty name list is an API error at best
    // and a whole-bucket delete at worst.
    expect(deleted).toHaveLength(0);
  });

  it("raises rather than reporting zero when the prefix held entries but none resolved", async () => {
    setup();
    // Every entry looks like a folder and every folder is empty: the tree was walked wrongly.
    // Returning 0 here would be the silent failure this function exists to close.
    bucketWith({ "palm-readings/m1": [folder("r1")], "palm-readings/m1/r1": [] });
    await expect(deleteSupabaseStoragePrefix("palm-readings/m1/")).rejects.toThrow(/resolved no objects/);
  });

  it("treats an entry of unrecognised shape as an object rather than losing it", async () => {
    setup();
    // No `id` field at all. Passing a non-object path to delete is a no-op; misreading a real
    // object as a folder would leave a photograph behind, so the ambiguous case must fail safe.
    const { deleted } = bucketWith({ "palm-readings/m1": [{ name: "left.jpg" }] });
    expect(await deleteSupabaseStoragePrefix("palm-readings/m1/")).toBe(1);
    expect(deleted[0]).toEqual(["palm-readings/m1/left.jpg"]);
  });

  it("raises when listing fails rather than reporting a successful erasure", async () => {
    setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, false, 500)));
    await expect(deleteSupabaseStoragePrefix("palm-readings/m1/")).rejects.toThrow(/Listing/);
  });

  it("raises when listing a nested folder fails, not just the top level", async () => {
    setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([folder("r1")]))
      .mockResolvedValueOnce(jsonResponse({ error: "nope" }, false, 500));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteSupabaseStoragePrefix("palm-readings/m1/")).rejects.toThrow(/Listing/);
  });

  it("raises when the delete itself fails", async () => {
    setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([file("a.jpg")]))
      .mockResolvedValueOnce(jsonResponse({ error: "denied" }, false, 403));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteSupabaseStoragePrefix("palm-readings/m1/")).rejects.toThrow(/Deleting/);
  });

  it("refuses an empty prefix rather than walking the whole bucket", async () => {
    setup();
    bucketWith({});
    await expect(deleteSupabaseStoragePrefix("/")).rejects.toThrow(/empty/);
  });

  it("refuses when Supabase is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(deleteSupabaseStoragePrefix("palm-readings/m1/")).rejects.toThrow(/not configured/);
  });
});
