import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function getFirebaseAdminApp() {
  const existing = getApps()[0];
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is required to reach Firestore.");
  }
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
