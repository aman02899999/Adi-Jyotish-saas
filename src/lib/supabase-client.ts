"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth in the browser — the counterpart to firebase-client.ts.
 *
 * Same eight exports, same shapes, so auth-client.ts can switch between the two
 * without any component knowing which provider is live.
 *
 * WHAT DIFFERS FROM FIREBASE, and why:
 *
 * - Google sign-in is redirect-only. The Firebase version tried a popup first and
 *   fell back to a redirect; its own comment says popups are unreliable (popup
 *   blockers, mobile Safari tracking prevention, in-app webviews). Supabase's flow
 *   is redirect-based, which is the path that already worked everywhere, so there
 *   is no popup branch to maintain. signInWithGoogle() therefore always returns
 *   null and the caller picks the session up after the reload.
 *
 * - The token handed to our backend is the access token, not an "ID token". It is
 *   still a signed JWT; src/lib/auth-verify.ts verifies it against
 *   SUPABASE_JWT_SECRET.
 *
 * - Password reset is a two-step exchange rather than an oobCode. The emailed link
 *   carries ?code=...; verifyPasswordResetCode() exchanges it for a session (which
 *   Supabase then persists), and confirmPasswordReset() calls updateUser() on that
 *   session. The code is single-use, so it is exchanged exactly once.
 *
 * NOT YET EXERCISED AGAINST A LIVE PROJECT. The sandbox cannot reach Supabase, so
 * this file is written against the documented @supabase/supabase-js v2 API and
 * type-checks, but the sign-in and reset flows need a manual pass on a real
 * project before cutover — see docs/supabase-migration.md.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isGoogleSignInAvailable() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

let client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!isGoogleSignInAvailable()) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for Supabase sign-in.");
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // The reset and invite links land on our own pages, which read the code
        // from the query string — so let the SDK pick the session up from the URL.
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        flowType: "pkce",
      },
    });
  }
  return client;
}

/** Always resolves to null: this provider signs in by full-page redirect. Kept
 * async and nullable so it is interchangeable with the Firebase version. */
export async function signInWithGoogle(): Promise<string | null> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: typeof window === "undefined" ? undefined : window.location.origin },
  });
  if (error) throw error;
  return null;
}

/** Picks up the session after the Google redirect reloads the page. Resolves to
 * null when there is no pending session, which is the normal case on every load. */
export async function completeGoogleRedirectSignIn(): Promise<string | null> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
}

export async function signInWithEmailAndPassword(email: string, password: string): Promise<string> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error("Sign-in did not return a session.");
  return data.session.access_token;
}

/**
 * Creates the account and signs in.
 *
 * Throws if the project has "Confirm email" enabled, because signUp then returns
 * no session and there is nothing to hand the backend. Turn that setting off for
 * this project, or the member self-registration flow will fail here with a clear
 * message rather than silently producing a broken session.
 */
export async function createUserWithEmailAndPassword(email: string, password: string): Promise<string> {
  const { data, error } = await getSupabase().auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) {
    throw new Error("This project requires email confirmation, so no session was returned. Disable 'Confirm email' in Supabase Auth settings.");
  }
  return data.session.access_token;
}

/** Emails a password-recovery link that lands on our own reset page. Like
 * Firebase, this resolves whether or not the address exists. */
export async function sendPasswordReset(email: string, continueUrl: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: continueUrl });
  if (error) throw error;
}

/**
 * Exchanges the recovery link's code for a session and returns the address behind
 * it, so the reset page can show "Resetting the password for you@example.com".
 *
 * The code is consumed here; confirmPasswordReset() then uses the session Supabase
 * persisted, so it must not be exchanged a second time.
 */
export async function verifyPasswordResetCode(code: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  const email = data.user?.email;
  if (!email) throw new Error("That reset link is no longer valid.");
  // A plain string, not { email }: Firebase's verifyPasswordResetCode resolves to
  // the address itself and reset-password-form.tsx feeds the result straight into
  // setEmail(). Returning an object would render "[object Object]".
  return email;
}

/** Completes the reset by setting a new password on the session the code produced. */
export async function confirmPasswordReset(_code: string, newPassword: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw error;
}
