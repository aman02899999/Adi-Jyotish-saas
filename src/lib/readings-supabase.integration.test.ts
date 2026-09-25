import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePgPool, query } from "@/lib/postgres";

/**
 * Compatibility matches and numerology readings on Postgres. Until this port both were written to
 * Firestore only, so after cutover a member's saved match could never be downloaded or shared.
 * Needs a migrated database and SUPABASE_CUTOVER=true.
 */
const describeCutover = process.env.SUPABASE_DB_URL && process.env.SUPABASE_CUTOVER === "true" ? describe : describe.skip;

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));

const { createKundliMatch, getKundliMatchById, getShareableKundliMatch } = await import("@/lib/kundli-matching");
const { createNumerologyReading } = await import("@/lib/numerology");

const MEMBER = "readings_itest_member";
const OTHER = "readings_itest_other";
const couple = {
  nameA: "Asha", birthDateA: "1992-03-14", birthTimeA: "08:30", birthPlaceA: "Jaipur, India",
  nameB: "Ravi", birthDateB: "1990-11-02", birthTimeB: "19:45", birthPlaceB: "Mumbai, India",
};

async function cleanup() {
  await query(`delete from public.kundli_matches where member_id like 'readings\\_itest\\_%' or id like 'readings\\_itest\\_%'`);
  await query(`delete from public.numerology_readings where member_id like 'readings\\_itest\\_%' or name = 'Readings Itest'`);
  await query(`delete from public.members where id like 'readings\\_itest\\_%'`);
}

describeCutover("saved readings on Postgres", () => {
  beforeEach(async () => {
    await cleanup();
    for (const id of [MEMBER, OTHER]) await query(`insert into public.members (id, name, email) values ($1, 'M', $2)`, [id, `${id}@example.test`]);
  });
  afterAll(async () => {
    await cleanup();
    await closePgPool();
  });

  it("saves a match its owner can download again, with the same score", async () => {
    const created = await createKundliMatch({ memberId: MEMBER, ...couple });
    const fetched = await getKundliMatchById(created.match.id, MEMBER);

    expect(fetched?.record).toMatchObject({ id: created.match.id, nameA: "Asha", birthPlaceB: "Mumbai, India", narrative: created.match.narrative });
    expect(fetched?.record.timeline).toEqual(created.timeline);
    expect(fetched?.result.totalScore).toBe(created.result.totalScore);
  });

  it("keeps a match's birth details from anyone but its owner", async () => {
    const created = await createKundliMatch({ memberId: MEMBER, ...couple });
    expect(await getKundliMatchById(created.match.id, OTHER)).toBeNull();

    const anonymous = await createKundliMatch({ memberId: null, ...couple });
    expect(await getKundliMatchById(anonymous.match.id, MEMBER)).toBeNull();
  });

  it("shares names and score only, as a number", async () => {
    const created = await createKundliMatch({ memberId: null, ...couple });
    const shared = await getShareableKundliMatch(created.match.id);
    expect(shared).toEqual({ id: created.match.id, nameA: "Asha", nameB: "Ravi", score: created.result.totalScore, maxScore: 36, tierLabel: expect.any(String) });
    expect(typeof shared?.score).toBe("number");
    expect(JSON.stringify(shared)).not.toContain("1992");
    expect(await getShareableKundliMatch("readings_itest_nope")).toBeNull();
  });

  it("reads a match copied from Firestore, which fills only the person_* columns", async () => {
    await query(
      `insert into public.kundli_matches (id, member_id, person_a_name, person_a_birth_date, person_a_birth_time, person_a_birth_place,
         person_b_name, person_b_birth_date, person_b_birth_time, person_b_birth_place, compatibility_score, narrative, timeline)
       values ('readings_itest_copied', $1, 'Asha', '1992-03-14', '08:30', 'Jaipur, India', 'Ravi', '1990-11-02', '19:45', 'Mumbai, India', 24.5, 'Copied.', '[]')`,
      [MEMBER],
    );
    expect((await getKundliMatchById("readings_itest_copied", MEMBER))?.record).toMatchObject({ nameA: "Asha", nameB: "Ravi", narrative: "Copied." });
    expect((await getShareableKundliMatch("readings_itest_copied"))?.score).toBe(24.5);
  });

  it("stores a numerology reading's result", async () => {
    const reading = await createNumerologyReading({ memberId: MEMBER, name: "Readings Itest", birthDate: "1990-01-01" });
    const { rows } = await query(`select member_id, life_path_number, destiny_number, narrative from public.numerology_readings where id = $1`, [reading.id]);
    expect(rows[0]).toEqual({ member_id: MEMBER, life_path_number: reading.lifePathNumber, destiny_number: reading.destinyNumber, narrative: reading.narrative });
  });
});
