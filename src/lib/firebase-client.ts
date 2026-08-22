"use client";

import { getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, connectAuthEmulator, getAuth, getRedirectResult, signInWithPopup, signInWithRedirect, signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword, createUserWithEmailAndPassword as firebaseCreateUserWithEmailAndPassword, sendPasswordResetEmail as firebaseSendPasswordResetEmail, confirmPasswordReset as firebaseConfirmPasswordReset, verifyPasswordResetCode as firebaseVerifyPasswordResetCode } from "firebase/auth";

// Password reset (sendPasswordResetEmail) and email verification (sendEmailVerification) are
// handled entirely by Firebase Auth's client SDK — see MDN-style usage at
// https://firebase.google.com/docs/auth/web/manage-users#send_a_password_reset_email — rather
// than a custom token-based recovery flow of our own.

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isGoogleSignInAvailable() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

let emulatorConnected = false;

function getFirebaseApp() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  if (process.env.NEXT_PUBLIC_USE_EMULATOR === "true" && !emulatorConnected) {
    emulatorConnected = true;
    connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return app;
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

/** Sends Firebase's own password-reset email. `continueUrl` is where the emailed link lands
 * (with `?oobCode=...` appended by Firebase) — we point it at our own /reset-password page so the
 * new-password form matches the rest of the app instead of Firebase's default hosted UI. Firebase
 * always resolves successfully here regardless of whether the email exists, by design — that's
 * what keeps this from leaking which addresses have accounts. */
export async function sendPasswordReset(email: string, continueUrl: string) {
  const auth = getAuth(getFirebaseApp());
  // handleCodeInApp is required here — without it Firebase's own hosted page consumes the
  // oobCode itself and only offers a plain "continue" link to `url` with no code attached, so
  // our /reset-password page (which reads oobCode from the query string) would never see it.
  await firebaseSendPasswordResetEmail(auth, email, { url: continueUrl, handleCodeInApp: true });
}

/** Looks up the email address behind a reset link's oobCode, so the reset-password page can show
 * "Resetting the password for you@example.com" and fail fast with a clear error on an
 * expired/already-used link, before the person types a new password. */
export async function verifyPasswordResetCode(oobCode: string) {
  const auth = getAuth(getFirebaseApp());
  return firebaseVerifyPasswordResetCode(auth, oobCode);
}

/** Completes a password reset with the oobCode from the emailed link. */
export async function confirmPasswordReset(oobCode: string, newPassword: string) {
  const auth = getAuth(getFirebaseApp());
  await firebaseConfirmPasswordReset(auth, oobCode, newPassword);
}
