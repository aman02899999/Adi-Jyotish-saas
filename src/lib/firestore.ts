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
