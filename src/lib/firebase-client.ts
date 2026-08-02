"use client";

import { getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, getRedirectResult, signInWithPopup, signInWithRedirect, signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword, createUserWithEmailAndPassword as firebaseCreateUserWithEmailAndPassword } from "firebase/auth";

// Password reset (sendPasswordResetEmail) and email verification (sendEmailVerification) are
// now handled entirely by Firebase Auth's client SDK — see MDN-style usage at
// https://firebase.google.com/docs/auth/web/manage-users#send_a_password_reset_email — rather
// than the old custom token-based recovery-tokens.ts flow, which has been removed.

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isGoogleSignInAvailable() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

function getFirebaseApp() {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

/** Opens the Google account picker and returns a Firebase ID token to hand to our own backend for
 * verification. Popups are unreliable in practice — strict popup blockers, mobile Safari's
 * tracking prevention, and in-app browsers (Instagram/WhatsApp webviews) all routinely block or
 * break them — so a blocked/unsupported popup falls back to a full-page redirect, which works
 * everywhere. A redirect navigates away immediately, so this resolves to null in that case; the
 * caller picks the result back up via completeGoogleRedirectSignIn() after the page reloads. */
export async function signInWithGoogle() {
  const auth = getAuth(getFirebaseApp());
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user.getIdToken();
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as { code: string }).code : "";
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

/** Picks up the result of a signInWithGoogle() redirect fallback after the page reloads. Resolves
 * to null (not an error) when there's no pending redirect, which is the common case on every
 * normal page load. */
export async function completeGoogleRedirectSignIn() {
  const auth = getAuth(getFirebaseApp());
  const result = await getRedirectResult(auth);
  return result ? result.user.getIdToken() : null;
}

/** Signs in with an email/password already created via the Firebase Admin SDK (e.g. right after
 * accepting an invite) and returns a fresh ID token to hand to our backend to mint a session
 * cookie. Used by the admin/practitioner invite-acceptance flows. */
export async function signInWithEmailAndPassword(email: string, password: string) {
  const auth = getAuth(getFirebaseApp());
  const result = await firebaseSignInWithEmailAndPassword(auth, email, password);
  return result.user.getIdToken();
}

/** Creates a brand-new Firebase Auth account (member self-registration, admin first-run setup)
 * and returns a fresh ID token to hand to our backend to mint a session cookie. */
export async function createUserWithEmailAndPassword(email: string, password: string) {
  const auth = getAuth(getFirebaseApp());
  const result = await firebaseCreateUserWithEmailAndPassword(auth, email, password);
  return result.user.getIdToken();
}
