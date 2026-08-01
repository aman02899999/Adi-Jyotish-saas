import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Deliberately does not throw when FIREBASE_SERVICE_ACCOUNT_KEY is absent: this module is
// imported by every route (including ones that only reach Firestore inside request handlers),
// and Next.js's build-time "collect page data" step loads every route module regardless of its
// runtime `dynamic` config. Falling back to `initializeApp()` (application-default credential
// resolution) keeps that import side-effect-free — credential errors only surface if the app
// genuinely tries to make a Firestore/Storage call without real credentials at request time.
function getFirebaseAdminApp() {
  const existing = getApps()[0];
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return initializeApp();

  const serviceAccount = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
  return initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

const globalForFirestore = globalThis as typeof globalThis & {
  __firestoreDb?: FirebaseFirestore.Firestore;
};

export const db = globalForFirestore.__firestoreDb ?? getFirestore(getFirebaseAdminApp());

if (process.env.NODE_ENV !== "production") {
  globalForFirestore.__firestoreDb = db;
}

export const storage = getStorage(getFirebaseAdminApp());
export const bucket = () => storage.bucket();

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
