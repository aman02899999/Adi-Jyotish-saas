// Firebase Auth → Supabase Auth (GoTrue) user migration, with passwords preserved.
//
// Passwords are NOT reset. Firebase stores them with a modified scrypt; Supabase
// Auth can verify that format directly, because GoTrue implements the `$fbscrypt$`
// prefix (supabase/auth internal/crypto/password.go, FirebaseScryptPrefix). So we
// carry the existing hash across verbatim and GoTrue re-derives it on next login.
//
// The `$fbscrypt$` modular string GoTrue parses is (from fbscryptHashRegexp):
//
//   $fbscrypt$v=1,n=<log2N>,r=<blockSize>,p=<parallel>,ss=<saltSeparator_b64>,sk=<signerKey_b64>$<salt_b64>$<hash_b64>
//
// and its verifier is:
//
//   key  = scrypt(password, salt || saltSeparator, N = 1<<n, r, p, 32)
//   out  = AES-CTR(key, iv = 16 zero bytes).XOR(signerKey)
//
// Mapping from Firebase's per-project hashConfig:
//   n  = hashConfig.rounds     (Firebase stores N as 2^rounds)
//   r  = hashConfig.memCost    (this is scrypt's block size, despite the name)
//   p  = 1                     (Firebase scrypt is always single-threaded)
//   ss = hashConfig.base64SaltSeparator
//   sk = hashConfig.base64SignerKey
// Every base64 section is STANDARD encoding with padding — GoTrue uses
// base64.StdEncoding for all of them, so do not strip padding or use URL-safe.
//
// WHY auth_uid_map EXISTS. auth.users.id is a uuid; a Firebase uid is a 28-char
// opaque string, so uids cannot be preserved. Each user therefore gets a new
// Supabase uuid, and every column in the public schema that stored a Firebase uid
// has to be rewritten once — that is what scripts/rewrite-auth-uids.sql does, using
// the map this script writes.
//
// Usage:
//   FIREBASE_SERVICE_ACCOUNT_KEY='<service-account-json>' \
//   SUPABASE_URL='https://<ref>.supabase.co' \
//   SUPABASE_SERVICE_ROLE_KEY='<service-role-key>' \
//   SUPABASE_DB_URL='postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres' \
//   node scripts/migrate-auth-users.mjs [--dry-run] [--limit=10]
//
// Idempotent: a second run skips any Firebase uid already present in auth_uid_map.
import { cert } from "firebase-admin/app";
import pg from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.slice(8)) : Infinity;

const log = (...a) => console.log(...a);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is required.`);
    process.exit(1);
  }
  return v;
}

const rawSa = requireEnv("FIREBASE_SERVICE_ACCOUNT_KEY");
const sa = JSON.parse(rawSa);
const credential = cert({
  projectId: sa.project_id,
  clientEmail: sa.client_email,
  privateKey: sa.private_key.replace(/\\n/g, "\n"),
});
const PROJECT_ID = sa.project_id;

const SUPABASE_URL = requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_ROLE = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

async function firebaseToken() {
  const { access_token } = await credential.getAccessToken();
  return access_token;
}

/**
 * Per-project scrypt parameters. These are project-specific and secret — the
 * signer key alone lets anyone verify guesses offline, so this script never logs
 * it and the runbook says not to paste it into chat.
 */
async function getHashConfig(token) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/config`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`hashConfig fetch failed: ${res.status} ${await res.text()}`);
  const cfg = await res.json();
  if (cfg.hashConfig?.algorithm !== "SCRYPT") {
    throw new Error(`Unexpected hash algorithm: ${JSON.stringify(cfg.hashConfig)}. Only SCRYPT can be carried over as $fbscrypt$.`);
  }
  return cfg.hashConfig;
}

/**
 * accounts:batchGet is the raw export behind firebase-admin's listUsers().
 * We call it directly because the Admin SDK's UserRecord deliberately omits
 * passwordHash and salt — and those are the whole point here.
 */
async function* listFirebaseUsers(token) {
  let pageToken;
  do {
    const body = { maxResults: 1000 };
    if (pageToken) body.nextPageToken = pageToken;
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`,
      { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (!res.ok) throw new Error(`accounts:batchGet failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const user of data.users ?? []) yield user;
    pageToken = data.nextPageToken;
  } while (pageToken);
}

/** Build the modular crypt string GoTrue's ParseFirebaseScryptHash expects. */
function toFbscrypt(hashConfig, user) {
  const n = hashConfig.rounds;
  const r = hashConfig.memCost;
  const ss = hashConfig.base64SaltSeparator ?? "";
  const sk = hashConfig.base64SignerKey ?? "";
  // Both are already standard-base64 in the API response. Firebase's salt may be
  // empty for some legacy accounts; GoTrue's regex requires a non-empty salt
  // section, so those accounts cannot be carried over and are reported instead.
  if (!user.passwordHash) return null;
  const salt = user.salt ?? "";
  if (!salt) return null;
  return `$fbscrypt$v=1,n=${n},r=${r},p=1,ss=${ss},sk=${sk}$${salt}$${user.passwordHash}`;
}

/**
 * Auth headers for the Supabase admin API, valid for BOTH key formats.
 *
 * Supabase is deprecating the legacy anon/service_role JWTs (end of 2026) in
 * favour of publishable/secret keys. The distinction matters here:
 *
 *   legacy service_role  → a JWT ("eyJ…"). Works in both `apikey` and
 *                          `Authorization: Bearer`.
 *   new secret key       → "sb_secret_…", which is NOT a JWT. Putting it in
 *                          `Authorization: Bearer` gets rejected; it must go in
 *                          `apikey` only.
 *
 * So the Bearer header is only sent for something that is actually a JWT. This is
 * what lets the same script run against an old project and a newly created one.
 */
function supabaseHeaders() {
  const isJwt = SERVICE_ROLE.startsWith("eyJ");
  return {
    apikey: SERVICE_ROLE,
    ...(isJwt ? { Authorization: `Bearer ${SERVICE_ROLE}` } : {}),
    "Content-Type": "application/json",
  };
}

function primaryEmail(user) {
  return (user.email ?? "").trim().toLowerCase() || null;
}

async function createSupabaseUser(user) {
  const payload = {
    email_confirm: true, // they already verified on Firebase; do not re-challenge
    email: primaryEmail(user),
    user_metadata: {
      firebase_uid: user.localId,
      name: user.displayName ?? null,
      migrated_from: "firebase",
    },
    app_metadata: { provider: "email", providers: ["email"] },
  };
  if (user.phoneNumber) payload.phone = user.phoneNumber;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    // Already exists means a previous run created it — not a failure, but we have
    // no id back, so the caller must look it up.
    if (res.status === 422 && /already been registered|already exists/i.test(text)) return { conflict: true };
    throw new Error(`create user failed (${res.status}): ${text}`);
  }
  return res.json();
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
  const connectionString = requireEnv("SUPABASE_DB_URL");
  const client = new pg.Client({ connectionString, ssl: pgSslOptions() });
  await client.connect();

  const token = await firebaseToken();
  const hashConfig = await getHashConfig(token);
  log(`Firebase project ${PROJECT_ID}: scrypt rounds=${hashConfig.rounds} memCost=${hashConfig.memCost}`);
  log(`Supabase: ${SUPABASE_URL}\n`);

  const stats = { total: 0, created: 0, hashed: 0, noPassword: 0, skipped: 0, failed: 0, noSalt: 0 };

  for await (const user of listFirebaseUsers(token)) {
    if (stats.total >= LIMIT) break;
    stats.total++;
    const uid = user.localId;
    const email = primaryEmail(user);

    const existing = await client.query("select supabase_uid from public.auth_uid_map where firebase_uid = $1", [uid]);
    if (existing.rowCount) {
      stats.skipped++;
      continue;
    }
    if (!email) {
      log(`  SKIP  ${uid} has no email`);
      stats.failed++;
      continue;
    }

    try {
      let created = await createSupabaseUser(user);
      if (created.conflict) {
        const found = await client.query("select id from auth.users where lower(email) = $1", [email]);
        if (!found.rowCount) throw new Error("create reported a conflict but no auth.users row matches");
        created = { id: found.rows[0].id };
      }
      const supabaseUid = created.id;

      const modular = toFbscrypt(hashConfig, user);
      if (modular) {
        if (!DRY_RUN) {
          // Installed by SQL, not the admin API: GoTrue's admin endpoints accept a
          // plaintext `password` (which it re-hashes to bcrypt) but have no field
          // for a pre-computed hash in a non-bcrypt format.
          await client.query("update auth.users set encrypted_password = $1, updated_at = now() where id = $2", [modular, supabaseUid]);
        }
        stats.hashed++;
      } else if (user.passwordHash && !user.salt) {
        log(`  WARN  ${uid} has a password hash but an empty salt — cannot carry it over; user will need a reset`);
        stats.noSalt++;
      } else {
        // OAuth-only account (Google sign-in). No password to carry; the user signs
        // in with the same provider once identities are configured.
        stats.noPassword++;
      }

      if (!DRY_RUN) {
        await client.query(
          "insert into public.auth_uid_map (firebase_uid, supabase_uid, email) values ($1, $2, $3) on conflict (firebase_uid) do nothing",
          [uid, supabaseUid, email],
        );
      }
      stats.created++;
      if (stats.created % 50 === 0) log(`  …${stats.created} migrated`);
    } catch (error) {
      log(`  FAIL  ${uid} (${email ?? "no email"}): ${error.message.split("\n")[0]}`);
      stats.failed++;
    }
  }

  log(`\nseen=${stats.total} created=${stats.created} password-carryover=${stats.hashed} oauth-only=${stats.noPassword} already-done=${stats.skipped} no-salt=${stats.noSalt} failed=${stats.failed}`);
  if (DRY_RUN) log("\nDRY RUN: no auth.users rows and no auth_uid_map rows were written.");
  else log("\nNext: run scripts/rewrite-auth-uids.sql to re-point the public schema at the new uuids.");

  await client.end();
  if (stats.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
