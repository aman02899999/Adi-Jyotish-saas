import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteSupabaseStoragePrefix } from "@/lib/supabase-storage";

/**
 * The erasure path's storage half. Before this existed, deleting an account under cutover left
 * every palm and face photograph readable in the bucket — the Firebase-only helper silently
 * no-opped because Firebase is unconfigured after cutover. These tests pin the two things that
 * would reintroduce that quietly: listing that stops at the first page, and a failed delete that
 * is swallowed instead of raised.
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

describe("deleteSupabaseStoragePrefix", () => {
  it("deletes nothing and reports zero when the prefix is empty", async () => {
    setup();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await deleteSupabaseStoragePrefix("palm-readings/m1/")).toBe(0);
    // One list call, and crucially no DELETE — an unconditional delete of an empty name list is
    // an API error at best and a whole-bucket delete at worst.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deletes the objects it finds, under their full paths", async () => {
    setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ name: "a.jpg" }, { name: "b.jpg" }]))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    expect(await deleteSupabaseStoragePrefix("palm-readings/m1/")).toBe(2);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    // list returns names relative to the prefix; delete needs them absolute, or it silently
    // removes nothing.
    expect(body.prefixes).toEqual(["palm-readings/m1/a.jpg", "palm-readings/m1/b.jpg"]);
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
  });

  it("pages past the API's 100-object cap", async () => {
    setup();
    const full = Array.from({ length: 100 }, (_, i) => ({ name: `img-${i}.jpg` }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(full))
      .mockResolvedValueOnce(jsonResponse([{ name: "img-100.jpg" }]))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    // Stopping at one page would leave object 101 behind — readable, after the member was told
    // their data was destroyed.
    expect(await deleteSupabaseStoragePrefix("face-readings/m1/")).toBe(101);
  });

  it("raises when listing fails rather than reporting a successful erasure", async () => {
    setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, false, 500)));
    await expect(deleteSupabaseStoragePrefix("palm-readings/m1/")).rejects.toThrow(/Listing/);
  });

  it("raises when the delete itself fails", async () => {
    setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ name: "a.jpg" }]))
      .mockResolvedValueOnce(jsonResponse({ error: "denied" }, false, 403));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteSupabaseStoragePrefix("palm-readings/m1/")).rejects.toThrow(/Deleting/);
  });

  it("refuses when Supabase is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(deleteSupabaseStoragePrefix("palm-readings/m1/")).rejects.toThrow(/not configured/);
  });
});
