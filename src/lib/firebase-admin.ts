import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export function isFirebaseConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
}

function getFirebaseAdminApp() {
  const existing = getApps()[0];
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  const serviceAccount = JSON.parse(raw) as { project_id: string; client_email: string; private_key: string };
  return initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
    }),
  });
}

export type GoogleIdentity = { uid: string; email: string; name: string; picture: string | null };

/** Returns null both when Firebase isn't configured and when the token fails verification — callers treat both as "cannot sign in with Google right now." */
export async function verifyFirebaseIdToken(idToken: string): Promise<GoogleIdentity | null> {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  try {
    const decoded = await getAuth(app).verifyIdToken(idToken);
    if (!decoded.email) return null;
    return {
      uid: decoded.uid,
      email: decoded.email.toLowerCase(),
      name: (decoded.name as string | undefined) ?? decoded.email.split("@")[0],
      picture: (decoded.picture as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}
