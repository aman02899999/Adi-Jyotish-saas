/**
 * Copies the Firebase Storage bucket to Supabase Storage.
 *
 * Complements scripts/migrate-firestore-to-supabase.mjs, which moves the
 * documents but not the bytes those documents point at. The paths are stored
 * verbatim in ai_readings documents, so every object must land at exactly the
 * same name in the destination bucket — nothing here rewrites paths.
 *
 * Usage:
 *   node scripts/migrate-storage-to-supabase.mjs [--dry-run] [--only=<prefix>] [--verify] [--bucket=<name>]
 *
 *   --dry-run      list what would be copied, write nothing
 *   --only=PREFIX  copy only objects whose name starts with PREFIX
 *   --verify       download each object back after upload and compare bytes
 *   --bucket=NAME  destination bucket (default: SUPABASE_STORAGE_BUCKET or "readings")
 *
 * Required env:
 *   GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_STORAGE_BUCKET
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotent: uploads use x-upsert, so a re-run overwrites in place.
 */
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { config as loadEnv } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) loadEnv({ path: file, override: false });
}

/** Canonical path normalisation — mirrors normalizeStoragePath() in
 * src/lib/supabase-storage.ts. Kept in sync by supabase-storage-path.test.ts. */
export function normalizeStoragePath(path) {
  return path.replace(/^\/+/, "").replace(/\/{2,}/g, "/").replace(/\/+$/, "");
}

export function storageObjectUrl(projectUrl, bucket, path) {
  const normalized = normalizeStoragePath(path);
  if (!normalized) throw new Error("Storage path is empty.");
  const encoded = normalized.split("/").map(encodeURIComponent).join("/");
  return `${projectUrl.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`;
}

export function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    verify: argv.includes("--verify"),
    only: (argv.find((a) => a.startsWith("--only=")) ?? "").slice("--only=".length) || null,
    bucket: (argv.find((a) => a.startsWith("--bucket=")) ?? "").slice("--bucket=".length) || null,
  };
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function authHeaders(key) {
  // Non-JWT secret keys are rejected in Authorization, so apikey is always sent.
  return { apikey: key, Authorization: `Bearer ${key}` };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const firebaseBucketName = requireEnv("FIREBASE_STORAGE_BUCKET");
  // The server-side scripts all use SUPABASE_URL; only the browser needs the
  // NEXT_PUBLIC_ spelling. Accept either so an operator who has already set up
  // for migrate-firestore-to-supabase.mjs does not need a second variable.
  const projectUrl = process.env.SUPABASE_URL?.trim() || requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const destBucket = args.bucket || process.env.SUPABASE_STORAGE_BUCKET?.trim() || "readings";

  const credentialsPath = requireEnv("GOOGLE_APPLICATION_CREDENTIALS");
  if (!existsSync(credentialsPath)) throw new Error(`Service account file not found: ${credentialsPath}`);
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(readFileSync(credentialsPath, "utf8"))) });
  const bucket = getStorage().bucket(firebaseBucketName);

  console.log(`\nCopying gs://${firebaseBucketName} -> Supabase bucket "${destBucket}"`);
  if (args.only) console.log(`Only prefix: ${args.only}`);
  if (args.dryRun) console.log("DRY RUN — nothing will be written.\n");
  else console.log();

  const [files] = await bucket.getFiles(args.only ? { prefix: args.only } : {});
  const targets = files.filter((file) => !file.name.endsWith("/"));
  console.log(`Found ${targets.length} object(s) to copy.`);

  let uploaded = 0;
  let skipped = 0;
  let verified = 0;
  let bytes = 0;
  const failures = [];

  for (const file of targets) {
    const path = normalizeStoragePath(file.name);
    if (args.dryRun) {
      console.log(`  [dry-run] would copy ${path}`);
      skipped += 1;
      continue;
    }

    const [buffer] = await file.download();
    const contentType = file.metadata.contentType || "application/octet-stream";
    const url = storageObjectUrl(projectUrl, destBucket, path);

    const put = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(serviceRoleKey), "content-type": contentType, "x-upsert": "true" },
      body: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    });
    if (!put.ok) {
      failures.push({ path, status: put.status, body: await put.text() });
      console.log(`  [fail] ${path} -> HTTP ${put.status}`);
      continue;
    }
    uploaded += 1;
    bytes += buffer.length;

    if (args.verify) {
      const get = await fetch(url, { headers: authHeaders(serviceRoleKey) });
      if (!get.ok) {
        failures.push({ path, status: get.status, body: "verify: download failed" });
        console.log(`  [fail] ${path} -> verify HTTP ${get.status}`);
        continue;
      }
      const back = Buffer.from(await get.arrayBuffer());
      if (!back.equals(buffer)) {
        failures.push({ path, status: 0, body: "verify: bytes differ" });
        console.log(`  [fail] ${path} -> verify byte mismatch`);
        continue;
      }
      verified += 1;
    }
  }

  console.log(`\nCopied ${uploaded} object(s) (${(bytes / 1024 / 1024).toFixed(2)} MB).`);
  if (args.dryRun) console.log(`Dry run: ${skipped} object(s) skipped.`);
  if (args.verify) console.log(`Verified byte-for-byte: ${verified} of ${uploaded}.`);
  if (failures.length) {
    console.log(`\n${failures.length} FAILURE(S):`);
    for (const failure of failures) console.log(`  - ${failure.path}: ${failure.status} ${failure.body.slice(0, 200)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("\nStorage migration failed:", error?.message || error);
    process.exitCode = 1;
  });
}
