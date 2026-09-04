import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Deliberate, single source of truth for the Firebase Admin app. The client SDK
// (src/lib/firebase-client.ts) uses the browser SDK and never touches this module;
// server code that needs Auth, Firestore, or Storage should all come through here
// so the Admin SDK is initialized exactly once per runtime.

export class FirebaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseConfigError";
  }
}

type ServiceAccountShape = {
  project_id?: unknown;
  client_email?: unknown;
  private_key?: unknown;
};

const globalForFirestore = globalThis as typeof globalThis & {
  __firebaseAdminApp?: App;
  __firestoreDb?: Firestore;
};

/**
 * Normalize the private key that arrives from an environment variable. The Admin SDK
 * accepts PEM text with real newlines; Vercel environment variables commonly carry it
 * either as a JSON-escaped string (`\n`) or with literal newlines. We accept both
 * without logging anything.
 */
function normalizePrivateKey(value: string): string {
  return value
    .replace(/\\\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\r/g, "\n");
}

function fallbackApp(): App {
  return initializeApp({ storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
}

/**
 * Returns the shared Firebase Admin App. Never logs credential data.
 *
 * A malformed or incomplete service-account secret is treated as a configuration
 * error: we log the *category* of failure but continue with an unauthenticated app so
 * importing this module never crashes pages that could otherwise still render. The
 * business operation that eventually needs Firebase will fail with a normal
 * Firebase/Admin error at request time instead.
 */
export function getFirebaseAdminApp(): App {
  if (globalForFirestore.__firebaseAdminApp) return globalForFirestore.__firebaseAdminApp;

  const existing = getApps()[0];
  if (existing) {
    globalForFirestore.__firebaseAdminApp = existing;
    return existing;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw || raw.trim() === "") {
    globalForFirestore.__firebaseAdminApp = fallbackApp();
    return globalForFirestore.__firebaseAdminApp;
  }

  let parsed: ServiceAccountShape;
  try {
    parsed = JSON.parse(raw) as ServiceAccountShape;
  } catch {
    console.error(
      "[firebase] FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON; Firebase operations will fail until the secret is replaced. No credential contents were logged.",
    );
    globalForFirestore.__firebaseAdminApp = fallbackApp();
    return globalForFirestore.__firebaseAdminApp;
  }

  const projectId = typeof parsed.project_id === "string" ? parsed.project_id.trim() : "";
  const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
  const privateKey = typeof parsed.private_key === "string" ? parsed.private_key : "";

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "[firebase] FIREBASE_SERVICE_ACCOUNT_KEY is missing project_id/client_email/private_key; Firebase operations will fail until the secret is replaced. No credential contents were logged.",
    );
    globalForFirestore.__firebaseAdminApp = fallbackApp();
    return globalForFirestore.__firebaseAdminApp;
  }

  globalForFirestore.__firebaseAdminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: normalizePrivateKey(privateKey),
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
  return globalForFirestore.__firebaseAdminApp;
}

export function getFirestoreDb(): Firestore {
  if (!globalForFirestore.__firestoreDb) {
    globalForFirestore.__firestoreDb = getFirestore(getFirebaseAdminApp());
  }
  return globalForFirestore.__firestoreDb;
}

export const db = getFirestoreDb();

export function isFirebaseServiceAccountPresent(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim());
}

export function isFirebaseConfigured(): boolean {
  if (!isFirebaseServiceAccountPresent()) return false;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY!;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountShape;
    return typeof parsed.project_id === "string" &&
      typeof parsed.client_email === "string" &&
      typeof parsed.private_key === "string";
  } catch {
    return false;
  }
}

export function isFirebaseProjectConfigured(): boolean {
  if (process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT) return true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountShape;
    return Boolean(parsed.project_id);
  } catch {
    return false;
  }
}

export function isMissingFirebaseProjectError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const code = "code" in error ? (error as { code: unknown }).code : undefined;
  const normalised = message.trim().toLowerCase();
  // Firebase/Admin SDK error codes: 7=PERMISSION_DENIED, 16=UNAUTHENTICATED,
  // 14=UNAVAILABLE, 13=INTERNAL, 9=FAILED_PRECONDITION, 3=INVALID_ARGUMENT,
  // 2=UNKNOWN. For public read fallbacks this is intentionally a broad set so a
  // missing IAM grant, an unreachable backend, or a misconfigured project all
  // degrade the optional section rather than 500ing a marketing page.
  if ([2, 3, 7, 9, 13, 14, 16].includes(Number(code))) return true;
  return (
    normalised.includes("unable to detect a project id") ||
    normalised.includes("project id") ||
    normalised.includes("could not load the default credentials") ||
    normalised.includes("permission") ||
    normalised.includes("insufficient permission") ||
    normalised.includes("bucket name not specified") ||
    normalised.includes("invalid argument")
  );
}

export async function withFirebaseFallback<T>(operation: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isMissingFirebaseProjectError(error)) {
      console.warn(`${label}: Firebase unavailable; using fallback.`, error);
      return fallback;
    }
    throw error;
  }
}

/** Lazily resolved Storage bucket; only initialized when an upload/download needs it. */
export function getStorageBucket() {
  return getStorage(getFirebaseAdminApp()).bucket();
}

/** Backwards-compatible alias used by media upload/generation modules. */
export const bucket = () => getStorageBucket();

export function isStorageConfigured(): boolean {
  return Boolean(process.env.FIREBASE_STORAGE_BUCKET);
}

/** gRPC FAILED_PRECONDITION: thrown for a missing composite index, and (transiently) while a
 * just-deployed one is still building. Distinguishes that from real query bugs. */
export function isIndexBuildingError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === 9;
}

/** Runs a Firestore query that depends on a composite index and falls back instead of crashing
 * the whole page if that index doesn't exist yet or is still building — logs loudly so it's
 * still visible in Cloud Run logs, but degrades one section instead of the entire request. */
export async function withIndexFallback<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isIndexBuildingError(error)) {
      console.error("Firestore composite index unavailable, using fallback:", error);
      return fallback;
    }
    throw error;
  }
}
