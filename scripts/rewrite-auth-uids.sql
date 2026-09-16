-- =============================================================================
-- rewrite-auth-uids.sql — the ONE id remap of the whole migration.
--
-- Every other table id was copied from Firestore verbatim, so it still matches.
-- Auth ids cannot be: auth.users.id is a uuid and a Firebase uid is a 28-char
-- opaque string, so scripts/migrate-auth-users.mjs minted a new uuid per user and
-- recorded the pair in public.auth_uid_map. This script rewrites every column that
-- stored a Firebase uid to the corresponding Supabase uuid.
--
-- Run it ONCE, after both the data copy and the auth migration, inside a single
-- transaction. It is idempotent: a second run finds no rows in auth_uid_map whose
-- firebase_uid still appears anywhere, so it changes nothing.
--
-- WHY THIS ISN'T A PLAIN UPDATE. members.id is a primary key with 29 foreign keys
-- pointing at it, all declared ON UPDATE NO ACTION. Updating it directly fails:
-- updating the parent breaks the children's references, and updating the children
-- first breaks the parent's. Neither order works. So step 1 re-installs those
-- foreign keys with ON UPDATE CASCADE (preserving each one's original ON DELETE),
-- after which a single UPDATE on members.id propagates to all 29 children.
-- Step 4 restores the original actions, so the schema afterwards is byte-for-byte
-- what the migrations created.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Safety: refuse to run if the map is empty, which almost always means the
--    auth migration has not run yet. Rewriting against an empty map would silently
--    null out every member reference via the ON DELETE SET NULL keys.
-- -----------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from public.auth_uid_map;
  if n = 0 then
    raise exception 'auth_uid_map is empty — run scripts/migrate-auth-users.mjs first';
  end if;
  raise notice 'auth_uid_map holds % uid pairs', n;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Temporarily add ON UPDATE CASCADE to every foreign key that points at one of
--    the four tables whose primary key IS an auth uid (or a value derived from
--    one). Discovered from the catalog rather than hardcoded, so this keeps working
--    if a later migration adds another reference.
-- -----------------------------------------------------------------------------
create temporary table if not exists _fk_backup (
  conname text, tbl regclass, col text, reftable regclass, refcol text, deltype "char"
);

do $$
declare
  r record;
  del_sql text;
begin
  for r in
    select con.conname,
           con.conrelid::regclass as tbl,
           (select attname from pg_attribute where attrelid = con.conrelid and attnum = con.conkey[1]) as col,
           con.confrelid::regclass as reftable,
           (select attname from pg_attribute where attrelid = con.confrelid and attnum = con.confkey[1]) as refcol,
           con.confdeltype as deltype,
           cardinality(con.conkey) as ncols
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where con.contype = 'f'
      and nsp.nspname = 'public'
      and con.confrelid in (
        -- Compare by OID, not by ::regclass::text. The text rendering of a regclass
        -- is qualified only when the schema is not on search_path, so with public
        -- on the path this yields 'members' and a literal 'public.members' filter
        -- silently matches nothing — which leaves the FKs at ON UPDATE NO ACTION
        -- and the members.id rewrite below then fails on the first child table.
        'public.members'::regclass,
        'public.admin_users'::regclass,
        'public.wallets'::regclass,
        'public.member_subscriptions'::regclass)
  loop
    if r.ncols <> 1 then
      raise exception 'composite FK %.% is not handled by this script', r.tbl, r.conname;
    end if;

    insert into _fk_backup values (r.conname, r.tbl, r.col, r.reftable, r.refcol, r.deltype);

    del_sql := case r.deltype
      when 'c' then 'cascade'
      when 'n' then 'set null'
      when 'd' then 'set default'
      when 'r' then 'restrict'
      else 'no action'
    end;

    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references %s (%I) on delete %s on update cascade',
      r.tbl, r.conname, r.col, r.reftable, r.refcol, del_sql);
  end loop;
  if (select count(*) from _fk_backup) = 0 then
    -- Guard against the exact failure mode described above: a filter that matches
    -- nothing produces no error until the rewrite itself explodes on a child table,
    -- which is a much more confusing place to debug it.
    raise exception 'no foreign keys matched the four uid-bearing tables — the schema is not the one this script expects';
  end if;
  raise notice 're-installed % foreign keys with ON UPDATE CASCADE', (select count(*) from _fk_backup);
end $$;

-- -----------------------------------------------------------------------------
-- 2. members.id — the primary key. Cascades to all 29 child columns.
-- -----------------------------------------------------------------------------
update public.members m
   set id = map.supabase_uid
  from public.auth_uid_map map
 where m.id = map.firebase_uid;

-- -----------------------------------------------------------------------------
-- 3. admin_users.id — also a Firebase uid. No foreign key references it, so this
--    is a direct update. firebase_uid is the login linkage column and must become
--    the Supabase uuid too, or practitioner portal sign-in stops resolving.
-- -----------------------------------------------------------------------------
update public.admin_users a
   set id = map.supabase_uid
  from public.auth_uid_map map
 where a.id = map.firebase_uid;

update public.admin_users a
   set firebase_uid = map.supabase_uid
  from public.auth_uid_map map
 where a.firebase_uid = map.firebase_uid;

update public.practitioners p
   set firebase_uid = map.supabase_uid
  from public.auth_uid_map map
 where p.firebase_uid = map.firebase_uid;

-- -----------------------------------------------------------------------------
-- 4. Composite-id tables whose PRIMARY KEY is a member uid rather than an opaque
--    id. Their member_id column already cascaded above; the id column did not,
--    because nothing references it as "the member".
--    wallets.id and member_subscriptions.id each have their own children, which is
--    why step 1 covered foreign keys pointing at those tables as well.
-- -----------------------------------------------------------------------------
update public.wallets w
   set id = map.supabase_uid
  from public.auth_uid_map map
 where w.id = map.firebase_uid;

update public.member_subscriptions s
   set id = map.supabase_uid
  from public.auth_uid_map map
 where s.id = map.firebase_uid;

-- -----------------------------------------------------------------------------
-- 5. Polymorphic and unconstrained columns. These hold a uid but have no foreign
--    key (deliberately — they span several tables), so no cascade reaches them.
-- -----------------------------------------------------------------------------
update public.notifications n
   set recipient_id = map.supabase_uid
  from public.auth_uid_map map
 where n.recipient_type in ('member','admin')
   and n.recipient_id = map.firebase_uid;

update public.audit_logs a
   set admin_id = map.supabase_uid
  from public.auth_uid_map map
 where a.admin_id = map.firebase_uid;

update public.gift_card_payment_index g
   set redeemed_by = map.supabase_uid
  from public.auth_uid_map map
 where g.redeemed_by = map.firebase_uid;

-- -----------------------------------------------------------------------------
-- 6. Restore the original ON DELETE / ON UPDATE NO ACTION actions, so the schema
--    matches what the migrations declared.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  del_sql text;
begin
  for r in select * from _fk_backup loop
    del_sql := case r.deltype
      when 'c' then 'cascade'
      when 'n' then 'set null'
      when 'd' then 'set default'
      when 'r' then 'restrict'
      else 'no action'
    end;
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references %s (%I) on delete %s on update no action',
      r.tbl, r.conname, r.col, r.reftable, r.refcol, del_sql);
  end loop;
  raise notice 'restored % foreign keys to ON UPDATE NO ACTION', (select count(*) from _fk_backup);
end $$;

-- -----------------------------------------------------------------------------
-- 7. Post-conditions. If any Firebase uid survives in a remapped column the whole
--    transaction rolls back — a partial remap is far worse than no remap, because
--    the orphaned rows look like valid data and only fail at login time.
-- -----------------------------------------------------------------------------
do $$
declare n int;
begin
  select count(*) into n from public.members m
    join public.auth_uid_map map on m.id = map.firebase_uid;
  if n > 0 then raise exception '% members.id still hold a Firebase uid', n; end if;

  select count(*) into n from public.wallets w
    join public.auth_uid_map map on w.id = map.firebase_uid;
  if n > 0 then raise exception '% wallets.id still hold a Firebase uid', n; end if;

  select count(*) into n from public.member_subscriptions s
    join public.auth_uid_map map on s.id = map.firebase_uid;
  if n > 0 then raise exception '% member_subscriptions.id still hold a Firebase uid', n; end if;

  select count(*) into n from public.bookings b
    join public.auth_uid_map map on b.member_id = map.firebase_uid;
  if n > 0 then raise exception '% bookings still reference a Firebase uid', n; end if;

  select count(*) into n from public.notifications x
    join public.auth_uid_map map on x.recipient_id = map.firebase_uid
   where x.recipient_type in ('member','admin');
  if n > 0 then raise exception '% notifications still reference a Firebase uid', n; end if;

  raise notice 'remap verified: no Firebase uids remain in remapped columns';
end $$;

commit;

-- auth_uid_map is intentionally KEPT. It is the audit trail of who became whom,
-- and the only way to re-run this safely. Drop it only once the cutover has been
-- live and verified for a full billing cycle.
