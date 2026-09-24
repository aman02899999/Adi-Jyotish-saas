import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import { AiPersonaError, createPersona, deletePersona, getAllPersonasAdmin, getPersonaById, getPersonaBySlug, updatePersona } from "@/lib/ai-personas";
import { getActivePersonasInSupabase } from "@/lib/ai-personas-supabase";

/**
 * Integration test for the AI persona port. Skipped unless SUPABASE_DB_URL points
 * at a reachable database.
 *
 * getActivePersonas itself is wrapped in unstable_cache, which needs Next's
 * incremental cache and throws outside a Next runtime, so the active filter is
 * asserted against the data-access function it calls instead.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "persona_itest_";

const VALID = {
  name: "Lunar Guide",
  title: "Moon-minded reader",
  avatarUrl: null,
  description: "A calm reader who works from the Moon and its houses.",
  systemPrompt: "You are a calm Vedic reader. Explain the Moon sign, its house, and one practical step.",
  sampleQuestions: ["What does my Moon sign mean?", "  Which house is strong?  ", ""],
  price: 149,
  currency: "INR",
  active: true,
};

async function cleanup() {
  await query(`delete from public.ai_readings where id like $1`, [`${P}%`]);
  await query(`delete from public.members where id like $1`, [`${P}%`]);
  await query(`delete from public.ai_personas where id like $1 or name like $1`, [`${P}%`]);
}

describeDb("ai personas (live database)", () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("creates a persona and reads every field back with the right types", async () => {
    const created = await createPersona({ ...VALID, name: `${P}Lunar Guide` });

    expect(created.id).toBe(created.slug);
    expect(created.name).toBe(`${P}Lunar Guide`);
    // price is numeric(14,2), which node-postgres hands back as a string; without
    // the coercion every comparison and sum downstream would concatenate.
    expect(created.price).toBeTypeOf("number");
    expect(created.price).toBe(149);
    expect(created.sampleQuestions).toEqual(["What does my Moon sign mean?", "Which house is strong?"]);
    expect(created.createdAt).toBeInstanceOf(Date);

    const byId = await getPersonaById(created.id);
    expect(byId?.systemPrompt).toBe(VALID.systemPrompt);
    const bySlug = await getPersonaBySlug(created.slug);
    expect(bySlug?.id).toBe(created.id);
  });

  it("de-duplicates the slug instead of overwriting", async () => {
    const first = await createPersona({ ...VALID, name: `${P}Twin` });
    const second = await createPersona({ ...VALID, name: `${P}Twin` });

    expect(first.slug).not.toBe(second.slug);
    expect(second.slug).toBe(`${first.slug}-2`);
    // The stored slug has to match the id, which is what the Firestore path got
    // wrong when the values object was hoisted above the uniqueness loop.
    expect(second.slug).toBe(second.id);
  });

  it("rejects input that fails validation", async () => {
    await expect(createPersona({ ...VALID, name: "x" })).rejects.toThrow(AiPersonaError);
    await expect(createPersona({ ...VALID, description: "short" })).rejects.toThrow(/longer description/);
    await expect(createPersona({ ...VALID, systemPrompt: "too brief" })).rejects.toThrow(/at least 40 characters/);
    await expect(createPersona({ ...VALID, price: -5 })).rejects.toThrow(/valid price/);
    await expect(createPersona({ ...VALID, price: Number.NaN })).rejects.toThrow(/valid price/);
  });

  it("keeps the prompt when the patch only renames", async () => {
    const created = await createPersona({ ...VALID, name: `${P}Rename me` });
    const updated = await updatePersona(created.id, { name: `${P}Renamed` });
    expect(updated.name).toBe(`${P}Renamed`);
    expect(updated.systemPrompt).toBe(VALID.systemPrompt);
    expect(updated.price).toBe(149);
  });

  it("can clear the avatar explicitly, which coalesce alone cannot express", async () => {
    const avatar = "https://example.test/a.png";
    const created = await createPersona({ ...VALID, name: `${P}Avatared`, avatarUrl: avatar });
    expect(created.avatarUrl).toBe(avatar);

    // Asserted while the avatar is still set: a patch that omits avatarUrl must
    // leave it alone. Checking this after clearing it would pass either way, which
    // is how a mutation that always overwrote the column went unnoticed.
    const renamed = await updatePersona(created.id, { name: `${P}Still` });
    expect(renamed.avatarUrl).toBe(avatar);

    // Clearing has to be expressible at all, which is why the patch carries a flag
    // rather than relying on coalesce to tell null from absent.
    const cleared = await updatePersona(created.id, { avatarUrl: null });
    expect(cleared.avatarUrl).toBeNull();

    const renamedAgain = await updatePersona(created.id, { name: `${P}Still two` });
    expect(renamedAgain.avatarUrl).toBeNull();
  });

  it("toggles active and flips the price", async () => {
    const created = await createPersona({ ...VALID, name: `${P}Toggler` });
    const off = await updatePersona(created.id, { active: false, price: 299 });
    expect(off.active).toBe(false);
    expect(off.price).toBe(299);
  });

  it("lists only active personas, sorted by name", async () => {
    await createPersona({ ...VALID, name: `${P}zeta active` });
    await createPersona({ ...VALID, name: `${P}alpha active` });
    await createPersona({ ...VALID, name: `${P}hidden`, active: false });

    const active = await getActivePersonasInSupabase();
    const ours = active.filter((p) => p.name.startsWith(P)).map((p) => p.name);
    expect(ours).toEqual([`${P}alpha active`, `${P}zeta active`]);
  });

  it("lists every persona for the admin, newest first", async () => {
    const first = await createPersona({ ...VALID, name: `${P}older` });
    const second = await createPersona({ ...VALID, name: `${P}newer` });

    const all = await getAllPersonasAdmin();
    const ours = all.filter((p) => p.name.startsWith(P)).map((p) => p.id);
    expect(ours).toEqual([second.id, first.id]);
  });

  it("throws when updating or deleting a persona that does not exist", async () => {
    await expect(updatePersona(`${P}missing`, { name: "Whatever" })).rejects.toThrow(/not found/);
    await expect(deletePersona(`${P}missing`)).rejects.toThrow(/not found/);
  });

  it("deletes a persona nothing has read against", async () => {
    const created = await createPersona({ ...VALID, name: `${P}Deletable` });
    await deletePersona(created.id);
    expect(await getPersonaById(created.id)).toBeNull();
  });

  it("refuses to delete a persona with readings on record", async () => {
    const created = await createPersona({ ...VALID, name: `${P}In use` });
    await query(`insert into public.members (id, name, email) values ($1,$2,$3)`, [`${P}m`, "Reader", `${P}m@example.test`]);
    await query(
      `insert into public.ai_readings (id, member_id, reading_type, persona_id) values ($1,$2,'persona',$3)`,
      [`${P}r1`, `${P}m`, created.id],
    );

    await expect(deletePersona(created.id)).rejects.toThrow(/readings on record/);
    expect(await getPersonaById(created.id)).not.toBeNull();
  });
});
