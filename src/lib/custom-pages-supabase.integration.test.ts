import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * Admin-built custom pages on Postgres. Until this port every read and write went to Firestore
 * (through a module-level collection handle the cutover guard could not see), so after cutover
 * new pages, edits and publishing would all have gone to a database the site no longer reads.
 * Needs a migrated database and SUPABASE_CUTOVER=true.
 */
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));

const pages = await import("@/lib/custom-pages");

const cleanup = () => query(`delete from public.custom_pages where title like 'Cpitest%' or slug like 'cpitest%' or slug like 'home%'`);

describeCutover("custom pages on Postgres", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("creates an unpublished page with a URL from its title", async () => {
    const page = await pages.createCustomPage({ title: "Cpitest Vedic Remedies", metaDescription: "  About remedies.  " });
    expect(page).toMatchObject({ slug: "cpitest-vedic-remedies", metaDescription: "About remedies.", blocks: [], published: false });
    expect(await pages.getCustomPageById(page.id)).toMatchObject({ id: page.id, title: "Cpitest Vedic Remedies" });
  });

  it("gives a clashing or reserved title the next free URL, even when created at the same moment", async () => {
    const created = await Promise.all(Array.from({ length: 4 }, () => pages.createCustomPage({ title: "Cpitest Same", metaDescription: "" })));
    expect(created.map((page) => page.slug).sort()).toEqual(["cpitest-same", "cpitest-same-2", "cpitest-same-3", "cpitest-same-4"]);
    expect((await pages.createCustomPage({ title: "Home", metaDescription: "" })).slug).toBe("home-2");
  });

  it("edits only what it is given, and caps the number of blocks", async () => {
    const page = await pages.createCustomPage({ title: "Cpitest Edit", metaDescription: "Original" });
    const blocks = [{ id: "b1", type: "richtext" as const, data: { html: "<p>Hello</p>" } }];
    const edited = await pages.updateCustomPage(page.id, { blocks, published: true });
    expect(edited).toMatchObject({ title: "Cpitest Edit", metaDescription: "Original", blocks, published: true });
    expect(edited.updatedAt.getTime()).toBeGreaterThanOrEqual(page.updatedAt.getTime());

    const tooMany = Array.from({ length: 41 }, (_, i) => ({ id: `b${i}`, type: "spacer" as const, data: {} }));
    await expect(pages.updateCustomPage(page.id, { blocks: tooMany })).rejects.toThrow("at most 40");
    await expect(pages.updateCustomPage(page.id, { title: "x" })).rejects.toThrow("Enter a page title");
    await expect(pages.updateCustomPage("00000000-0000-0000-0000-000000000000", { published: true })).rejects.toThrow("not found");
  });

  it("serves only published pages to visitors", async () => {
    const draft = await pages.createCustomPage({ title: "Cpitest Draft", metaDescription: "" });
    const live = await pages.createCustomPage({ title: "Cpitest Live", metaDescription: "" });
    await pages.updateCustomPage(live.id, { published: true });

    expect(await pages.getPublishedCustomPageBySlug(draft.slug)).toBeNull();
    expect((await pages.getPublishedCustomPageBySlug(live.slug))?.id).toBe(live.id);
    const published = (await pages.getPublishedCustomPages()).map((page) => page.id);
    expect(published).toContain(live.id);
    expect(published).not.toContain(draft.id);
    expect((await pages.getAllCustomPagesAdmin()).map((page) => page.id)).toEqual(expect.arrayContaining([draft.id, live.id]));
  });

  it("deletes a page once", async () => {
    const page = await pages.createCustomPage({ title: "Cpitest Gone", metaDescription: "" });
    await pages.deleteCustomPage(page.id);
    expect(await pages.getCustomPageById(page.id)).toBeNull();
    await expect(pages.deleteCustomPage(page.id)).rejects.toThrow("not found");
  });
});
