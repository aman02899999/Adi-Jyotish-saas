import "server-only";

import { getSupabaseConfig } from "@/lib/supabase-config";

/**
 * Supabase Storage — the counterpart to Firebase Storage for the palm and face
 * reading images.
 *
 * Same private-bucket, server-only-read pattern as the Firebase version: nothing
 * here produces a public URL, and every call is made with the service-role key so
 * it bypasses RLS exactly as the Admin SDK did.
 *
 * Uses the Storage REST API rather than @supabase/supabase-js because that client
 * is built for the browser; on the server a plain fetch is fewer moving parts and
 * keeps the key handling in one obvious place.
 *
 * The pure path helpers below are exported so the URL construction can be tested
 * without a bucket to talk to — a wrong path here is a silent 404 at read time,
 * long after the image was written.
 */

/** Bucket the reading images live in. Created by the setup step in the runbook. */
export function storageBucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "readings";
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(getSupabaseConfig()?.serviceRoleKey && storageBucketName());
}

/**
 * Firestore paths and Supabase object names are the same shape, but Supabase
 * rejects a leading slash and an empty segment. Normalising on the way in means
 * the paths already stored in the database keep working unchanged.
 */
export function normalizeStoragePath(path: string): string {
  return path
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
}

/** Full REST URL for an object. Throws rather than building a URL against an
 * unconfigured project, so a missing env var fails loudly instead of 404ing. */
export function storageObjectUrl(projectUrl: string, bucket: string, path: string): string {
  const normalized = normalizeStoragePath(path);
  if (!normalized) throw new Error("Storage path is empty.");
  const encoded = normalized.split("/").map(encodeURIComponent).join("/");
  return `${projectUrl.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`;
}

function authHeaders(serviceRoleKey: string, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    // The service-role key is not always a JWT, and a non-JWT in Authorization
    // is rejected outright — apikey is the header that works for both formats.
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
  if (contentType) headers["content-type"] = contentType;
  return headers;
}

export class SupabaseStorageError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SupabaseStorageError";
  }
}

function requireConfig(): { url: string; key: string; bucket: string } {
  const config = getSupabaseConfig();
  if (!config?.serviceRoleKey) throw new SupabaseStorageError("Supabase is not configured for Storage.", 0);
  return { url: config.url, key: config.serviceRoleKey, bucket: storageBucketName() };
}

/** Writes an object, overwriting anything already at that path. */
export async function uploadToSupabaseStorage(path: string, body: Buffer, contentType: string): Promise<string> {
  const { url, key, bucket } = requireConfig();
  const response = await fetch(storageObjectUrl(url, bucket, path), {
    method: "POST",
    headers: { ...authHeaders(key, contentType), "x-upsert": "true" },
    // A Buffer is not a BodyInit under these lib types: they want
    // Uint8Array<ArrayBuffer> and Buffer exposes ArrayBufferLike. This is a view
    // over the same memory rather than a copy — these are multi-megabyte photos —
    // and the cast is sound because Node backs Buffers with an ArrayBuffer and
    // byteOffset/byteLength already scope it to this slice.
    body: new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength),
  });
  if (!response.ok) {
    throw new SupabaseStorageError(`Upload to ${normalizeStoragePath(path)} failed: ${await response.text()}`, response.status);
  }
  return normalizeStoragePath(path);
}

export type StoredObject = { buffer: Buffer; contentType: string };

/** Reads an object back. Mirrors the Firebase download + getMetadata pair. */
export async function downloadFromSupabaseStorage(path: string): Promise<StoredObject> {
  const { url, key, bucket } = requireConfig();
  const response = await fetch(storageObjectUrl(url, bucket, path), { headers: authHeaders(key) });
  if (!response.ok) {
    throw new SupabaseStorageError(`Download of ${normalizeStoragePath(path)} failed: ${await response.text()}`, response.status);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
}
