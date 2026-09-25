// Firestore → Supabase (Postgres) data copy.
//
// Copies every collection the app uses into the schema created by
// supabase/migrations/0001-0004. Table ids are the Firestore document ids copied
// VERBATIM, so nothing downstream needs re-pointing — except auth uids, which are
// handled separately by scripts/migrate-auth-users.mjs + rewrite-auth-uids.sql.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT_KEY='<service-account-json>' \
//   SUPABASE_DB_URL='postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres' \
//   node scripts/migrate-firestore-to-supabase.mjs [--dry-run] [--only=members,bookings] [--verify]
//
// Safe to re-run: every write is an upsert on the primary key, so a second pass
// overwrites rather than duplicates. That matters because the copy is expected to
// run at least twice — once as a rehearsal, once for real at cutover.
//
// This script READS production Firestore. It never writes to it.
import { pathToFileURL } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import pg from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const VERIFY = process.argv.includes("--verify");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null;

// ---------------------------------------------------------------------------
// Collection → table map.
//
// `parent` names the column that Firestore implied by nesting; the copy fills it
// from the parent document path, because the child document itself does not carry
// it. `idFrom` covers the cases where the Firestore doc id is NOT a unique primary
// key once the subcollection is flattened — see the note on gemstone_wishlist.
// `jsonb` lists columns whose Firestore value must be serialised rather than
// mapped field-by-field.
// ---------------------------------------------------------------------------
const TABLES = [
  // --- 0001 identity / RBAC / scheduling -----------------------------------
  { collection: "members", table: "members" },
  { collection: "adminUsers", table: "admin_users" },
  { collection: "adminRoles", table: "admin_roles" },
  { collection: "adminInvites", table: "admin_invites" },
  { collection: "practitionerInvites", table: "practitioner_invites" },
  { collection: "practitioners", table: "practitioners" },
  { collection: "services", table: "services" },
  { collection: "practitioners", sub: "availabilityRules", table: "availability_rules", parent: "practitioner_id" },
  { collection: "practitioners", sub: "timeOff", table: "practitioner_time_off", parent: "practitioner_id" },

  // --- 0002 commerce -------------------------------------------------------
  { collection: "bookings", table: "bookings" },
  { collection: "invoices", table: "invoices" },
  { collection: "payments", table: "payments" },
  { collection: "razorpayEvents", table: "razorpay_events" },
  { collection: "membershipPlans", table: "membership_plans" },
  { collection: "memberSubscriptions", table: "member_subscriptions" },
  { collection: "subscriptionInvoices", table: "subscription_invoices" },
  { collection: "paymentFailureCounters", table: "payment_failure_counters" },
  { collection: "practitionerReviews", table: "practitioner_reviews" },
  { collection: "practitionerPayouts", table: "practitioner_payouts" },
  { collection: "referrals", table: "referrals" },
  { collection: "wallets", table: "wallets" },
  { collection: "wallets", sub: "entries", table: "wallet_entries", parent: "wallet_id" },
  { collection: "wallets", sub: "holds", table: "wallet_holds", parent: "wallet_id" },
  // Both are keyed by a value the document body does not repeat (the gift code, the Razorpay
  // payment id), and both columns are NOT NULL, so the copy fills them from the document id.
  { collection: "giftCards", table: "gift_cards", docIdColumn: "code" },
  { collection: "giftCardPaymentIndex", table: "gift_card_payment_index", docIdColumn: "razorpay_payment_id" },

  // --- 0003 gemstones / content -------------------------------------------
  { collection: "gemstoneCategories", table: "gemstone_categories" },
  { collection: "gemstoneProducts", table: "gemstone_products" },
  { collection: "gemstoneProducts", sub: "variants", table: "gemstone_product_variants", parent: "product_id" },
  { collection: "gemstoneProducts", sub: "images", table: "gemstone_product_images", parent: "product_id" },
  { collection: "gemstoneCoupons", table: "gemstone_coupons" },
  // The document field is `count` (see gemstone-orders.ts), but `count` is a
  // SQL aggregate name and reads badly as a column, so the table calls it
  // `usage_count`. Without this rename camelToSnake produces `count`, which is
  // not a column — stripUnknownColumns would then silently drop it and every
  // customer's per-coupon usage limit would reset at cutover, letting "once per
  // customer" coupons be reused.
  { collection: "gemstoneCouponCustomerUsage", table: "gemstone_coupon_customer_usage", rename: { count: "usage_count" } },
  { collection: "gemstoneOrders", table: "gemstone_orders" },
  { collection: "gemstoneOrders", sub: "items", table: "gemstone_order_items", parent: "order_id" },
  { collection: "gemstoneReviews", table: "gemstone_reviews" },
  { collection: "gemstoneRecommendations", table: "gemstone_recommendations" },
  // Firestore path members/{m}/wishlist/{productId}: the doc id is the PRODUCT id,
  // so the same product wishlisted by two members yields the same doc id twice.
  // Flattened, that collides — synthesise a composite id instead.
  { collection: "members", sub: "wishlist", table: "gemstone_wishlist", parent: "member_id", idFrom: (parentId, docId) => `${parentId}_${docId}`, docIdColumn: "product_id" },
  // Same shape for favourites: members/{m}/favorites/{practitionerId}.
  { collection: "members", sub: "favorites", table: "member_favorites", parent: "member_id", idFrom: (parentId, docId) => `${parentId}_${docId}`, docIdColumn: "practitioner_id" },
  { collection: "customPages", table: "custom_pages", jsonb: ["blocks"] },
  // site_content stores the whole document as one jsonb blob — the app edits it
  // as a unit and never queries inside it.
  { collection: "siteContent", table: "site_content", wholeDocJsonb: "data" },
  { collection: "studioSettings", table: "studio_settings" },
  { collection: "promoBanner", table: "promo_banner" },
  { collection: "dailyHoroscopes", table: "daily_horoscopes" },

  // --- 0004 engagement / audit --------------------------------------------
  { collection: "chatSessions", table: "chat_sessions" },
  // chat_active_locks has no `id` column at all — member_id IS the primary key.
  { collection: "chatActiveLocks", table: "chat_active_locks", pkColumn: "member_id", pkFromDocId: true },
  { collection: "chatSessions", sub: "messages", table: "chat_messages", parent: "session_id" },
  { collection: "aiPersonas", table: "ai_personas" },
  { collection: "aiReadings", table: "ai_readings", jsonb: ["tarotCards", "faceImagePaths"] },
  { collection: "aiReadingFreeClaims", table: "ai_reading_free_claims" },
  { collection: "notifications", table: "notifications" },
  { collection: "messageThreads", table: "message_threads" },
  { collection: "messageThreads", sub: "messages", table: "inbox_messages", parent: "thread_id" },
  { collection: "journalEntries", table: "journal_entries" },
  { collection: "familyMembers", table: "family_members" },
  { collection: "kundliMatches", table: "kundli_matches", jsonb: ["breakdown", "timeline"] },
  { collection: "numerologyReadings", table: "numerology_readings" },
  { collection: "predictions", table: "predictions" },
  { collection: "milestones", table: "milestones" },
  { collection: "memberStreaks", table: "member_streaks", pkColumn: "member_id", pkFromDocId: true },
  { collection: "auditLogs", table: "audit_logs", jsonb: ["before", "after"] },
  // gemini_usage is keyed by the YYYY-MM-DD doc id, in a column called `day`.
  { collection: "geminiUsage", table: "gemini_usage", pkColumn: "day", pkFromDocId: true },
  // experiments.ts writes only experiments/{key}/variants/{variant}; the parent document never
  // exists, so a plain get() finds no experiments and every variant fails its foreign key.
  { collection: "experiments", table: "experiments", includeMissingDocs: true },
  // experiments/{key}/variants/{variant}: the doc id is the variant name, unique
  // only within its parent. Composite id keeps it unique once flattened.
  { collection: "experiments", sub: "variants", table: "experiment_variants", parent: "experiment_key", idFrom: (parentId, docId) => `${parentId}/${docId}`, docIdColumn: "variant" },
  { collection: "cosmicProfileCards", table: "cosmic_profile_cards", pkColumn: "member_id", pkFromDocId: true },
  { collection: "cosmicWeather", table: "cosmic_weather" },
];

// Columns the schema declares but Firestore documents do not carry, because they
// are computed/derived on read. Copied as null rather than defaulted, so a later
// column addition does not silently invent data.
const SKIP_FIELDS = new Set(["messages"]);

const camelToSnake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function log(...args) {
  console.log(...args);
}

function connectFirestore() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    console.error("FIREBASE_SERVICE_ACCOUNT_KEY is required.");
    process.exit(1);
  }
  const sa = JSON.parse(raw);
  const app = initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      // Same normalization src/lib/firestore.ts applies: env vars commonly carry \n.
      privateKey: sa.private_key.replace(/\\n/g, "\n"),
    }),
  });
  return getFirestore(app);
}

/**
 * Firestore value → something node-postgres can bind.
 *
 * Timestamps become ISO strings (timestamptz parses them). Firestore string dates
 * (birthDate, entryDate, …) are already strings and pass through untouched — the
 * schema deliberately keeps them text. Maps and arrays become jsonb where the
 * column is jsonb, and Postgres arrays otherwise.
 */
function toPg(value, { jsonb = false } = {}) {
  if (value === undefined || value === null) return null;
  // firebase-admin Timestamp: has toDate(). Must be tested before the plain-object
  // branch, or it serialises as an empty object and the date is lost silently.
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (jsonb) return JSON.stringify(value);
    // Nested arrays/objects cannot go into a Postgres array column — fall back to
    // jsonb text so nothing is dropped.
    if (value.some((v) => v !== null && typeof v === "object")) return JSON.stringify(value);
    return value;
  }
  if (typeof value === "object") {
    if (jsonb) return JSON.stringify(value);
    return JSON.stringify(value);
  }
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

async function readDocs(db, spec) {
  const out = [];
  if (spec.sub) {
    const parents = await db.collection(spec.collection).listDocuments();
    for (const parentRef of parents) {
      const kids = await parentRef.collection(spec.sub).get();
      for (const doc of kids.docs) out.push({ parentId: parentRef.id, doc });
    }
  } else if (spec.includeMissingDocs) {
    // listDocuments() also returns documents that exist only as the parent of a subcollection;
    // those become a row carrying just their id.
    const refs = await db.collection(spec.collection).listDocuments();
    const snaps = refs.length ? await db.getAll(...refs) : [];
    for (const snap of snaps) out.push({ parentId: null, doc: snap.exists ? snap : { id: snap.id, data: () => ({}) } });
  } else {
    const snap = await db.collection(spec.collection).get();
    for (const doc of snap.docs) out.push({ parentId: null, doc });
  }
  return out;
}

function buildRow(spec, parentId, doc) {
  const data = doc.data() ?? {};
  const row = {};

  if (spec.wholeDocJsonb) {
    row.id = doc.id;
    row[spec.wholeDocJsonb] = JSON.stringify(data);
    if (data.updatedAt !== undefined) row.updated_at = toPg(data.updatedAt);
    return row;
  }

  // Primary key. Most tables use `id`; the existence-lock and day-keyed tables
  // key on something else and have no id column.
  if (spec.pkFromDocId) {
    row[spec.pkColumn] = doc.id;
  } else {
    row.id = spec.idFrom ? spec.idFrom(parentId, doc.id) : doc.id;
    if (spec.docIdColumn) row[spec.docIdColumn] = doc.id;
  }
  if (spec.parent && parentId !== null) row[spec.parent] = parentId;

  for (const [key, value] of Object.entries(data)) {
    if (SKIP_FIELDS.has(key)) continue;
    const col = spec.rename?.[key] ?? camelToSnake(key);
    // Never let a document field clobber the parent/pk column we just set.
    if (col === spec.parent || col === spec.pkColumn || col === "id") continue;
    row[col] = toPg(value, { jsonb: (spec.jsonb ?? []).includes(key) });
  }
  return row;
}

/**
 * The columns a table actually has.
 *
 * Firestore is schemaless and production documents routinely carry fields the
 * TypeScript types never declared — a field left over from an abandoned feature,
 * an old spelling, a one-off written by hand. The schema was derived from the
 * types, so those fields have no column. Inserting one aborts the entire batch
 * with `column "x" of relation "y" does not exist`, which would land in the
 * middle of a cutover with writes frozen. Unknown fields are dropped and
 * reported instead; see stripUnknownColumns.
 */
async function knownColumns(client, table) {
  const { rows } = await client.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table],
  );
  if (!rows.length) throw new Error(`no such table: public.${table}`);
  return new Set(rows.map((r) => r.column_name));
}

/**
 * Drops keys with no matching column, returning the surviving rows plus the set
 * of field names that were dropped so the operator can see them. Dropping is the
 * safe direction: an unmapped field means data the app no longer reads, whereas
 * aborting means no data at all.
 */
function stripUnknownColumns(rows, allowed) {
  const dropped = new Set();
  const kept = rows.map((row) => {
    const out = {};
    for (const [column, value] of Object.entries(row)) {
      if (allowed.has(column)) out[column] = value;
      else dropped.add(column);
    }
    return out;
  });
  return { rows: kept, dropped };
}

/**
 * Collapses rows that share a primary key, keeping the last one.
 *
 * Postgres rejects a multi-row `insert ... on conflict do update` that touches
 * the same row twice — "ON CONFLICT DO UPDATE command cannot affect row a second
 * time" — and that kills the whole batch. Two documents can land on one key when
 * an id is synthesised from a parent path, so this is reachable with real data.
 * Last wins, matching what separate upserts would have done, and the collisions
 * are returned so the operator can see them.
 */
function dedupeByPk(rows, pk) {
  const byPk = new Map();
  const duplicates = new Set();
  for (const row of rows) {
    const key = row[pk];
    if (byPk.has(key)) duplicates.add(String(key));
    byPk.set(key, row);
  }
  return { rows: [...byPk.values()], duplicates };
}

async function upsert(client, spec, rows) {
  if (!rows.length) return 0;
  // Union of keys across the batch: documents in one collection routinely
  // disagree about which optional fields they carry.
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  // The primary key is a property of the table, not something to infer from the
  // first row's shape — the previous heuristic fell through to `columns[0]`,
  // which is whatever key happened to be inserted first.
  const pk = spec.pkFromDocId ? spec.pkColumn : "id";
  if (!columns.includes(pk)) throw new Error(`${spec.table}: no value for primary key "${pk}"`);

  const deduped = dedupeByPk(rows, pk);
  if (deduped.duplicates.size) {
    const keys = [...deduped.duplicates].sort();
    log(`  NOTE  ${spec.table.padEnd(34)} ${keys.length} duplicate ${pk} in one batch, last kept: ${keys.slice(0, 10).join(", ")}`);
  }
  const batch = deduped.rows;

  const values = [];
  const params = [];
  for (const row of batch) {
    const tuple = columns.map((c) => {
      params.push(row[c] === undefined ? null : row[c]);
      return `$${params.length}`;
    });
    values.push(`(${tuple.join(", ")})`);
  }
  const updates = columns.filter((c) => c !== pk);
  // A row carrying only its key (a phantom parent) has nothing to update.
  const onConflict = updates.length
    ? `do update set ${updates.map((c) => `"${c}" = excluded."${c}"`).join(", ")}`
    : "do nothing";
  const sql =
    `insert into public.${spec.table} (${columns.map((c) => `"${c}"`).join(", ")}) values ${values.join(", ")} ` +
    `on conflict ("${pk}") ${onConflict}`;
  const res = await client.query(sql, params);
  return res.rowCount ?? 0;
}


// Same certificate-verification reasoning as src/lib/postgres.ts: an unverified TLS session
// authenticates nobody, and this script carries the service_role connection password.
// SUPABASE_CA_CERT (PEM, \n-escaped) pins Supabase's CA; without it Node's default trust store
// is used and a failure is the correct outcome. PGSSLMODE=disable stays the local-Postgres escape.
function pgSslOptions() {
  if (process.env.PGSSLMODE?.trim().toLowerCase() === "disable") return undefined;
  const ca = process.env.SUPABASE_CA_CERT?.trim().replace(/\\n/g, "\n");
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

async function main() {
  const db = connectFirestore();
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString && !DRY_RUN) {
    console.error("SUPABASE_DB_URL is required (or pass --dry-run to just read and count).");
    process.exit(1);
  }

  const client = connectionString ? new pg.Client({ connectionString, ssl: pgSslOptions() }) : null;
  if (client) await client.connect();

  const selected = TABLES.filter((s) => !ONLY || ONLY.includes(s.table) || ONLY.includes(s.collection));
  log(`Copying ${selected.length} collections${DRY_RUN ? " (DRY RUN — no writes)" : ""}\n`);

  const results = [];
  // table -> document fields that had no column, for the summary at the end.
  const unmapped = new Map();
  for (const spec of selected) {
    const started = Date.now();
    let docs;
    try {
      docs = await readDocs(db, spec);
    } catch (error) {
      // A missing collection is normal for a feature that was never used; a
      // permission error is not. Report and continue rather than aborting a
      // multi-hour copy at collection 40 of 62.
      log(`  SKIP  ${spec.table.padEnd(34)} read failed: ${error.message.split("\n")[0]}`);
      results.push({ table: spec.table, read: 0, wrote: 0, skipped: true });
      continue;
    }
    let rows = docs.map(({ parentId, doc }) => buildRow(spec, parentId, doc));
    let wrote = 0;
    if (!DRY_RUN && rows.length) {
      const allowed = await knownColumns(client, spec.table);
      const stripped = stripUnknownColumns(rows, allowed);
      rows = stripped.rows;
      if (stripped.dropped.size) {
        const names = [...stripped.dropped].sort();
        unmapped.set(spec.table, names);
        log(`  NOTE  ${spec.table.padEnd(34)} no column for: ${names.join(", ")}`);
      }
      // Chunked: one giant multi-row insert can exceed Postgres' 65535 bind params.
      for (let i = 0; i < rows.length; i += 500) {
        wrote += await upsert(client, spec, rows.slice(i, i + 500));
      }
    }
    results.push({ table: spec.table, read: docs.length, wrote });
    log(`  ${DRY_RUN ? "read " : "done "}  ${spec.table.padEnd(34)} ${String(docs.length).padStart(6)} docs  (${Date.now() - started}ms)`);
  }

  const totalRead = results.reduce((n, r) => n + r.read, 0);
  const totalWrote = results.reduce((n, r) => n + r.wrote, 0);
  log(`\n${totalRead} documents read, ${totalWrote} rows written, ${results.filter((r) => r.skipped).length} collections skipped.`);

  if (unmapped.size) {
    log(`\n-- ${unmapped.size} table(s) had document fields with no column --`);
    log("   Skipped, not copied. Each is either data the app no longer reads or a column the schema is missing.");
    log("   Review this list before cutover; a real field here means the schema needs it.");
    for (const [table, names] of unmapped) log(`  ${table.padEnd(34)} ${names.join(", ")}`);
  }

  if (VERIFY && client) {
    log("\n-- verify: Firestore count vs Postgres count --");
    let mismatch = 0;
    for (const spec of selected) {
      const r = results.find((x) => x.table === spec.table);
      if (!r || r.skipped) continue;
      const { rows } = await client.query(`select count(*)::int n from public.${spec.table}`);
      const ok = rows[0].n >= r.read;
      if (!ok) mismatch++;
      log(`  ${ok ? "ok      " : "MISMATCH"}  ${spec.table.padEnd(34)} firestore=${r.read}  postgres=${rows[0].n}`);
    }
    log(mismatch ? `\n${mismatch} table(s) short — investigate before cutover.` : "\nAll target tables hold at least as many rows as their source collection.");
  }

  if (client) await client.end();
}

// Only run when executed directly, so the pure functions above can be imported
// and tested without touching Firestore.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { TABLES, camelToSnake, buildRow, dedupeByPk, knownColumns, readDocs, stripUnknownColumns, upsert, SKIP_FIELDS };
