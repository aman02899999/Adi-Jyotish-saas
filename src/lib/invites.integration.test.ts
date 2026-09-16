import { beforeAll, describe, expect, it } from "vitest";

import { query } from "@/lib/postgres";
import {
  createAdminInSupabase,
  getActiveAdminInSupabase,
} from "@/lib/admin-auth-supabase";
import { upsertSystemRoleInSupabase, getRoleInSupabase } from "@/lib/admin-roles-supabase";
import {
  deleteAdminInvitesByEmailInSupabase,
  findAdminInviteByTokenHashInSupabase,
  insertAdminInviteInSupabase,
  listPendingAdminInvitesInSupabase,
  markAdminInviteAcceptedInSupabase,
} from "@/lib/admin-invites-supabase";
import {
  deletePendingPractitionerInvitesInSupabase,
  findPractitionerInviteByTokenHashInSupabase,
  insertPractitionerInviteInSupabase,
  markPractitionerInviteAcceptedInSupabase,
} from "@/lib/practitioner-invites-supabase";
import {
  findPractitionerByEmailInSupabase,
  findPractitionerForLinkInSupabase,
  getInvitedPractitionerInSupabase,
  linkPractitionerGoogleUidInSupabase,
  linkPractitionerUidInSupabase,
} from "@/lib/practitioner-auth-supabase";

/**
 * Integration tests for the invitation and account-creation data access behind the
 * bootstrap, team-invite and practitioner-invite routes. Skipped unless SUPABASE_DB_URL
 * points at a reachable database.
 *
 * The GoTrue user creation those routes also perform is not covered: it is an HTTPS call
 * to the Supabase Auth admin API, which this sandbox cannot reach.
 */
const describeDb = process.env.SUPABASE_DB_URL ? describe : describe.skip;

const P = "invites_itest_";
const IN_FUTURE = new Date(Date.now() + 86_400_000);
const IN_PAST = new Date(Date.now() - 86_400_000);

async function seedPractitioner(id: string, email: string, firebaseUid: string | null, active = true) {
  await query(
    `insert into public.practitioners (id, name, slug, email, firebase_uid, active, created_at, updated_at)
     values ($1, $2, $1, $3, $4, $5, now(), now())
     on conflict do nothing`,
    [id, `Practitioner ${id}`, email, firebaseUid, active],
  );
}

describeDb("invitations and account creation (live database)", () => {
  beforeAll(async () => {
    // Every insert below uses a fixed id, so a second run would collide on the primary
    // key. (`_` is a LIKE wildcard, hence the escapes.)
    for (const table of ["admin_invites", "practitioner_invites", "admin_users", "admin_roles", "practitioners"]) {
      await query(`delete from public.${table} where id like 'invites\\_itest\\_%'`);
    }
  });

  it("creates an administrator and only stamps a login when asked", async () => {
    expect(await createAdminInSupabase({ id: `${P}admin_boot`, name: "Boot", email: `${P}boot@example.test`, role: "owner", stampLogin: true })).toBe(true);
    expect(await createAdminInSupabase({ id: `${P}admin_invited`, name: "Invited", email: `${P}invited@example.test`, role: "editor", stampLogin: false })).toBe(true);

    const { rows } = await query<{ id: string; last_login_at: Date | null }>(
      `select id, last_login_at from public.admin_users where id like '${P}admin\\_%' order by id`,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === `${P}admin_boot`)?.last_login_at).toBeInstanceOf(Date);
    expect(rows.find((r) => r.id === `${P}admin_invited`)?.last_login_at).toBeNull();

    const roles = await query<{ id: string; role: string }>(
      `select id, role from public.admin_users where id like '${P}admin\\_%'`,
    );
    expect(roles.rows.find((r) => r.id === `${P}admin_boot`)?.role).toBe("owner");
    expect(roles.rows.find((r) => r.id === `${P}admin_invited`)?.role).toBe("editor");
  });

  it("reports not-created rather than throwing when the email is already taken", async () => {
    // admin_users has a unique index on email as well as the primary key.
    const created = await createAdminInSupabase({
      id: `${P}admin_dupe`,
      name: "Dupe",
      email: `${P}boot@example.test`,
      role: "editor",
      stampLogin: false,
    });
    expect(created).toBe(false);

    const { rows } = await query<{ n: number }>(
      `select count(*)::int n from public.admin_users where id = $1`,
      [`${P}admin_dupe`],
    );
    expect(rows[0]?.n).toBe(0);
  });

  it("upserts the owner role and keeps it system-flagged", async () => {
    await upsertSystemRoleInSupabase(`${P}owner`, "Owner", ["a", "b"]);
    expect(await getRoleInSupabase(`${P}owner`)).toMatchObject({ isSystem: true, permissions: ["a", "b"] });

    // Re-running bootstrap replaces the permission set but must not clear is_system.
    await upsertSystemRoleInSupabase(`${P}owner`, "Owner", ["a", "b", "c"]);
    const role = await getRoleInSupabase(`${P}owner`);
    expect(role?.isSystem).toBe(true);
    expect(role?.permissions).toEqual(["a", "b", "c"]);

    const { rows } = await query<{ n: number }>(
      `select count(*)::int n from public.admin_roles where id = $1`,
      [`${P}owner`],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it("finds a live admin invitation by token hash and hides accepted and expired ones", async () => {
    const email = `${P}invitee@example.test`;
    await insertAdminInviteInSupabase({ id: `${P}inv_live`, email, role: "editor", invitedBy: `${P}admin_boot`, tokenHash: `${P}hash_live`, expiresAt: IN_FUTURE });
    await insertAdminInviteInSupabase({ id: `${P}inv_expired`, email, role: "editor", invitedBy: `${P}admin_boot`, tokenHash: `${P}hash_expired`, expiresAt: IN_PAST });

    const live = await findAdminInviteByTokenHashInSupabase(`${P}hash_live`);
    expect(live).toMatchObject({ id: `${P}inv_live`, email, role: "editor", acceptedAt: null });
    expect(live?.expiresAt).toBeInstanceOf(Date);

    expect(await findAdminInviteByTokenHashInSupabase(`${P}hash_expired`)).toBeNull();
    expect(await findAdminInviteByTokenHashInSupabase(`${P}hash_missing`)).toBeNull();

    // Accepting hides it from the lookup rather than leaving a reusable link.
    expect(await markAdminInviteAcceptedInSupabase(`${P}inv_live`)).toBe(true);
    expect(await findAdminInviteByTokenHashInSupabase(`${P}hash_live`)).toBeNull();
    expect(await markAdminInviteAcceptedInSupabase(`${P}inv_live`)).toBe(false);
  });

  it("discards every invitation for an email when a new one is issued", async () => {
    const email = `${P}reinvite@example.test`;
    await insertAdminInviteInSupabase({ id: `${P}re_old`, email, role: "editor", invitedBy: "x", tokenHash: `${P}re_old`, expiresAt: IN_FUTURE });
    await insertAdminInviteInSupabase({ id: `${P}re_accepted`, email, role: "editor", invitedBy: "x", tokenHash: `${P}re_acc`, expiresAt: IN_FUTURE });
    await markAdminInviteAcceptedInSupabase(`${P}re_accepted`);
    // A different email must survive the sweep.
    await insertAdminInviteInSupabase({ id: `${P}re_other`, email: `${P}someoneelse@example.test`, role: "editor", invitedBy: "x", tokenHash: `${P}re_other`, expiresAt: IN_FUTURE });

    const removed = await deleteAdminInvitesByEmailInSupabase(email);
    expect(removed).toBe(2);
    expect(await findAdminInviteByTokenHashInSupabase(`${P}re_other`)).not.toBeNull();
  });

  it("lists only pending invitations, oldest first", async () => {
    // Two rows with a deliberate age gap: at this point in the suite only one pending
    // invite would otherwise survive, and sorting a one-element list proves nothing.
    await insertAdminInviteInSupabase({ id: `${P}ord_new`, email: `${P}ordnew@example.test`, role: "editor", invitedBy: "x", tokenHash: `${P}ord_new`, expiresAt: IN_FUTURE });
    await insertAdminInviteInSupabase({ id: `${P}ord_old`, email: `${P}ordold@example.test`, role: "editor", invitedBy: "x", tokenHash: `${P}ord_old`, expiresAt: IN_FUTURE });
    await query(`update public.admin_invites set created_at = now() - interval '3 days' where id = $1`, [`${P}ord_old`]);

    const invites = await listPendingAdminInvitesInSupabase();
    expect(invites.every((invite) => invite.acceptedAt === null)).toBe(true);
    expect(invites.every((invite) => invite.expiresAt.getTime() > Date.now())).toBe(true);

    const ordered = invites.filter((invite) => invite.id.startsWith(`${P}ord_`)).map((invite) => invite.id);
    expect(ordered).toEqual([`${P}ord_old`, `${P}ord_new`]);
  });

  it("keeps only the newest practitioner invitation per practitioner", async () => {
    const slug = `${P}prac`;
    await seedPractitioner(slug, `${P}prac@example.test`, null);
    await insertPractitionerInviteInSupabase({ id: `${P}p_old`, email: `${P}prac@example.test`, practitionerSlug: slug, invitedBy: "x", tokenHash: `${P}p_old`, expiresAt: IN_FUTURE });
    await insertPractitionerInviteInSupabase({ id: `${P}p_new`, email: `${P}prac@example.test`, practitionerSlug: slug, invitedBy: "x", tokenHash: `${P}p_new`, expiresAt: IN_FUTURE });

    // An accepted invite must survive the sweep; an expired one must never be findable.
    await insertPractitionerInviteInSupabase({ id: `${P}p_done`, email: `${P}prac@example.test`, practitionerSlug: slug, invitedBy: "x", tokenHash: `${P}p_done`, expiresAt: IN_FUTURE });
    await markPractitionerInviteAcceptedInSupabase(`${P}p_done`);
    await insertPractitionerInviteInSupabase({ id: `${P}p_stale`, email: `${P}prac@example.test`, practitionerSlug: slug, invitedBy: "x", tokenHash: `${P}p_stale`, expiresAt: IN_PAST });
    expect(await findPractitionerInviteByTokenHashInSupabase(`${P}p_stale`)).toBeNull();

    // Three pending rows go: the two superseded ones and the expired one. The sweep
    // filters on accepted_at only, exactly as the Firestore batch delete did -- an
    // expired invite is still unaccepted, and leaving it behind would let it be found
    // again if the clock were ever wrong.
    expect(await deletePendingPractitionerInvitesInSupabase(slug)).toBe(3);
    expect(await findPractitionerInviteByTokenHashInSupabase(`${P}p_old`)).toBeNull();
    // Accepted invites are history, not pending: the sweep must not have removed it.
    expect(await findPractitionerInviteByTokenHashInSupabase(`${P}p_done`)).toBeNull();
    const { rows: doneRows } = await query<{ n: number }>(
      `select count(*)::int n from public.practitioner_invites where id = $1`,
      [`${P}p_done`],
    );
    expect(doneRows[0]?.n).toBe(1);

    await insertPractitionerInviteInSupabase({ id: `${P}p_fresh`, email: `${P}prac@example.test`, practitionerSlug: slug, invitedBy: "x", tokenHash: `${P}p_fresh`, expiresAt: IN_FUTURE });
    const found = await findPractitionerInviteByTokenHashInSupabase(`${P}p_fresh`);
    expect(found).toMatchObject({ id: `${P}p_fresh`, practitionerSlug: slug });

    expect(await markPractitionerInviteAcceptedInSupabase(`${P}p_fresh`)).toBe(true);
    expect(await markPractitionerInviteAcceptedInSupabase(`${P}p_fresh`)).toBe(false);
    expect(await findPractitionerInviteByTokenHashInSupabase(`${P}p_fresh`)).toBeNull();
  });

  it("reads the invited practitioner the accept route needs", async () => {
    await seedPractitioner(`${P}invitee`, `${P}Invitee@Example.test`, null);
    expect(await getInvitedPractitionerInSupabase(`${P}invitee`)).toMatchObject({
      id: `${P}invitee`,
      email: `${P}Invitee@Example.test`,
      firebaseUid: null,
    });
    expect(await getInvitedPractitionerInSupabase(`${P}nobody`)).toBeNull();
  });

  it("finds a practitioner by email case-insensitively and links a verified Google uid", async () => {
    await seedPractitioner(`${P}google`, `${P}Google@Example.test`, null);

    const found = await findPractitionerByEmailInSupabase(`${P}google@example.test`);
    expect(found).toMatchObject({ id: `${P}google`, active: true });
    expect(await findPractitionerByEmailInSupabase(`${P}absent@example.test`)).toBeNull();

    expect(await linkPractitionerGoogleUidInSupabase(`${P}google`, `${P}google_uid`)).toBe(true);
    expect(await findPractitionerForLinkInSupabase(`${P}google_uid`)).toMatchObject({ id: `${P}google`, active: true });

    const { rows } = await query<{ email_verified: boolean }>(
      `select email_verified from public.practitioners where id = $1`,
      [`${P}google`],
    );
    expect(rows[0]?.email_verified).toBe(true);
  });

  it("reports a deactivated practitioner as inactive rather than missing", async () => {
    await seedPractitioner(`${P}inactive`, `${P}inactive@example.test`, `${P}inactive_uid`, false);
    expect(await findPractitionerForLinkInSupabase(`${P}inactive_uid`)).toMatchObject({ id: `${P}inactive`, active: false });
  });

  it("links an accepted invite's uid and stamps the login", async () => {
    await seedPractitioner(`${P}linked`, `${P}linked@example.test`, null);
    expect(await linkPractitionerUidInSupabase(`${P}linked`, `${P}linked_uid`)).toBe(true);

    const { rows } = await query<{ firebase_uid: string | null; last_login_at: Date | null }>(
      `select firebase_uid, last_login_at from public.practitioners where id = $1`,
      [`${P}linked`],
    );
    expect(rows[0]?.firebase_uid).toBe(`${P}linked_uid`);
    expect(rows[0]?.last_login_at).toBeInstanceOf(Date);
  });

  it("surfaces a linked practitioner to the sign-in gate", async () => {
    await seedPractitioner(`${P}gateable`, `${P}gateable@example.test`, `${P}gateable_uid`);
    await query(`update public.practitioners set active = true where id = $1`, [`${P}gateable`]);
    expect(await getActiveAdminInSupabase(`${P}admin_boot`)).toMatchObject({ role: "owner", name: "Boot" });
    expect(await findPractitionerForLinkInSupabase(`${P}gateable_uid`)).toMatchObject({ active: true });
  });
});
