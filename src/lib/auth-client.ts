"use client";

/**
 * One entry point for browser authentication, over either provider.
 *
 * Components import from here rather than from firebase-client.ts or
 * supabase-client.ts, so moving an account over is an environment change and not
 * a code change. The two implementations export the same eight functions with the
 * same signatures; the only difference a caller can observe is that
 * signInWithGoogle() always resolves to null under Supabase, because that
 * provider signs in by redirect and has no popup path.
 *
 * The provider modules are imported dynamically so the unused SDK stays out of
 * the bundle — the Firebase client is not a small dependency.
 */

const USE_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_AUTH === "supabase";

/** Which provider this build authenticates against. Exposed so error messages and
 * the setup page can say which one is misconfigured. */
export function authProvider(): "firebase" | "supabase" {
  return USE_SUPABASE ? "supabase" : "firebase";
}

async function provider() {
  return USE_SUPABASE ? await import("@/lib/supabase-client") : await import("@/lib/firebase-client");
}

/** Synchronous because callers use it during render to decide whether to show the
 * Google button at all. Reads the same variables each implementation needs. */
export function isGoogleSignInAvailable(): boolean {
  if (USE_SUPABASE) {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
}

export async function signInWithGoogle(): Promise<string | null> {
  return (await provider()).signInWithGoogle();
}

export async function completeGoogleRedirectSignIn(): Promise<string | null> {
  return (await provider()).completeGoogleRedirectSignIn();
}

export async function signInWithEmailAndPassword(email: string, password: string): Promise<string> {
  return (await provider()).signInWithEmailAndPassword(email, password);
}

export async function createUserWithEmailAndPassword(email: string, password: string): Promise<string> {
  return (await provider()).createUserWithEmailAndPassword(email, password);
}

export async function sendPasswordReset(email: string, continueUrl: string): Promise<void> {
  return (await provider()).sendPasswordReset(email, continueUrl);
}

/** Resolves to the email address behind the reset link. Firebase's SDK returns
 * the bare string, so supabase-client.ts is written to match — the reset form
 * pipes this straight into setEmail(). */
export async function verifyPasswordResetCode(code: string): Promise<string> {
  return (await provider()).verifyPasswordResetCode(code);
}

export async function confirmPasswordReset(code: string, newPassword: string): Promise<void> {
  return (await provider()).confirmPasswordReset(code, newPassword);
}
