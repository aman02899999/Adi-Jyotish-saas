import "server-only";

import { getFirebaseAdminApp, isFirebaseConfigured } from "@/lib/firestore";
import { verifyAuthToken } from "@/lib/auth-verify";
import { isSupabaseCutoverActive } from "@/lib/supabase-config";

export type GoogleIdentity = { uid: string; email: string; name: string; picture: string | null };

/** Returns the same shared, lazily-created Admin app used by Firestore/Storage. */
function firebaseApp() {
  return getFirebaseAdminApp();
}

/** Returns null both when Firebase isn't configured and when the token fails verification — callers treat both as "cannot sign in with Google right now." */
export async function verifyFirebaseIdToken(idToken: string): Promise<GoogleIdentity | null> {
  // Firebase credentials are absent once the project is on Supabase Auth, so the
  // old guard would have returned null for every token after cutover.
  if (!isFirebaseConfigured() && !isSupabaseCutoverActive()) return null;
  try {
    const decoded = await verifyAuthToken(idToken);
    if (!decoded.email) return null;
    return {
      uid: decoded.uid,
      email: decoded.email.toLowerCase(),
      name: decoded.name ?? decoded.email.split("@")[0],
      picture: decoded.picture,
    };
  } catch {
    return null;
  }
}
