import "server-only";

import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp, isFirebaseConfigured } from "@/lib/firestore";

export type GoogleIdentity = { uid: string; email: string; name: string; picture: string | null };

/** Returns the same shared, lazily-created Admin app used by Firestore/Storage. */
function firebaseApp() {
  return getFirebaseAdminApp();
}

/** Returns null both when Firebase isn't configured and when the token fails verification — callers treat both as "cannot sign in with Google right now." */
export async function verifyFirebaseIdToken(idToken: string): Promise<GoogleIdentity | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const decoded = await getAuth(firebaseApp()).verifyIdToken(idToken);
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
