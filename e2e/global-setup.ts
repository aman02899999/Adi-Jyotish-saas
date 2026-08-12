import { request } from "@playwright/test";

/**
 * Bootstraps the three demo identities the E2E suite runs against, entirely through HTTP (no
 * browser) — the same Firebase Auth emulator REST API and app session-cookie routes the real
 * sign-up/sign-in forms call, just driven directly so setup is fast and independent of any page's
 * markup. Each spec file loads the matching storageState from e2e/.auth instead of logging in
 * itself, so a login-flow regression only breaks the auth specs that actually test login, not
 * every spec that merely needs to be signed in.
 */

const BASE_URL = "http://localhost:3000";
const AUTH_EMULATOR = "http://127.0.0.1:9099";
const PROJECT_ID = "demo-jyotish";

const ADMIN = { email: "e2e.owner@adijyotishgurus.test", password: "E2eOwnerPass123!", name: "E2E Owner" };
const MEMBER = { email: "e2e.member@adijyotishgurus.test", password: "E2eMemberPass123!", name: "E2E Member" };
const PRACTITIONER_SEED_EMAIL = "demo.astrologer1@adijyotishgurus.com";

async function emulatorSignUp(email: string, password: string) {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=any`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!res.ok) {
    if (body.error?.message === "EMAIL_EXISTS") return emulatorSignIn(email, password);
    throw new Error(`Auth emulator sign-up failed for ${email}: ${JSON.stringify(body)}`);
  }
  return body.idToken as string;
}

async function emulatorSignIn(email: string, password: string) {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=any`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Auth emulator sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return body.idToken as string;
}

export default async function globalSetup() {
  process.env.GCLOUD_PROJECT = PROJECT_ID;

  // --- Admin owner: first-run setup if no admin exists yet, otherwise plain login -------------
  const adminContext = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL } });
  const adminIdToken = await emulatorSignUp(ADMIN.email, ADMIN.password);
  let setupRes = await adminContext.post("/api/auth/setup", { data: { idToken: adminIdToken, name: ADMIN.name } });
  if (setupRes.status() === 403) {
    // An admin already exists (e.g. reused emulator data) — fall back to a normal login.
    setupRes = await adminContext.post("/api/auth/login", { data: { idToken: adminIdToken } });
  }
  if (!setupRes.ok()) throw new Error(`Admin bootstrap failed: ${setupRes.status()} ${await setupRes.text()}`);
  await adminContext.storageState({ path: "e2e/.auth/admin.json" });

  // Seed the 9 demo accounts (3 admins/practitioners/members) via the existing admin-only route —
  // reuses the same seeding the product ships for human walkthroughs instead of duplicating it.
  const seedRes = await adminContext.post("/api/admin/demo-accounts");
  if (!seedRes.ok()) throw new Error(`Demo account seeding failed: ${seedRes.status()} ${await seedRes.text()}`);
  const seed = await seedRes.json() as { password: string };
  await adminContext.dispose();

  // --- Practitioner: log into the seeded demo astrologer profile -------------------------------
  const practitionerContext = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL } });
  const practitionerIdToken = await emulatorSignIn(PRACTITIONER_SEED_EMAIL, seed.password);
  const practitionerLogin = await practitionerContext.post("/api/auth/practitioner-login", { data: { idToken: practitionerIdToken } });
  if (!practitionerLogin.ok()) throw new Error(`Practitioner login failed: ${practitionerLogin.status()} ${await practitionerLogin.text()}`);
  await practitionerContext.storageState({ path: "e2e/.auth/practitioner.json" });
  await practitionerContext.dispose();

  // --- Member: register a fresh member dedicated to this suite (not the demo seed, so tests can
  // freely mutate cart/wallet/booking state without colliding with demo-account walkthroughs) ---
  const memberContext = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { origin: BASE_URL } });
  const memberIdToken = await emulatorSignUp(MEMBER.email, MEMBER.password);
  let memberRes = await memberContext.post("/api/member/register", { data: { idToken: memberIdToken, name: MEMBER.name } });
  if (!memberRes.ok()) {
    // Already registered from a previous run against reused emulator data — log in instead.
    memberRes = await memberContext.post("/api/member/login", { data: { idToken: memberIdToken } });
  }
  if (!memberRes.ok()) throw new Error(`Member bootstrap failed: ${memberRes.status()} ${await memberRes.text()}`);

  // Complete onboarding (birth profile) so the member lands on /dashboard, not /onboarding, for
  // every spec that assumes an onboarded member — matches what a real first-time member does.
  const onboardRes = await memberContext.put("/api/member/profile", {
    data: { birthDate: "1994-06-15", birthTime: "07:45", birthPlace: "Jaipur, India" },
  });
  if (!onboardRes.ok()) throw new Error(`Member onboarding failed: ${onboardRes.status()} ${await onboardRes.text()}`);

  await memberContext.storageState({ path: "e2e/.auth/member.json" });
  await memberContext.dispose();
}
