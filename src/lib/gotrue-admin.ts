import "server-only";

import { getSupabaseConfig } from "@/lib/supabase-config";

/**
 * Server-side GoTrue (Supabase Auth) user administration.
 *
 * This is the replacement for `getAuth()` from firebase-admin/auth: creating an account
 * for someone else, looking one up by email, setting a password and deleting it. None of
 * that is possible through the browser client in `supabase-client.ts`, which only ever
 * acts on behalf of the person already signed in.
 *
 * Every call needs the service_role key. The `apikey` header is always sent; the
 * `Authorization: Bearer` header is added only for a legacy JWT key, because the newer
 * `sb_secret_...` keys are not JWTs and GoTrue rejects them in that header. The same
 * rule is what lets scripts/migrate-auth-users.mjs run against an old project and a
 * newly created one.
 *
 * NOTE: nothing in this module can be exercised by the test suite — it talks to GoTrue
 * over HTTPS, which the sandbox cannot reach. It is written against the admin API shape
 * that scripts/migrate-auth-users.mjs already uses against a real project.
 */

export class GoTrueAdminError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GoTrueAdminError";
  }
}

/** Thrown when GoTrue says the email address is already registered. */
export class GoTrueUserExistsError extends GoTrueAdminError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "GoTrueUserExistsError";
  }
}

export type GoTrueUser = { uid: string; email: string | null };

function adminConfig() {
  const config = getSupabaseConfig();
  const serviceRoleKey = config?.serviceRoleKey;
  if (!config?.url || !serviceRoleKey) {
    throw new GoTrueAdminError("Supabase is not configured for user administration.", 503);
  }
  return { url: config.url, serviceRoleKey };
}

function adminHeaders(serviceRoleKey: string) {
  const isJwt = serviceRoleKey.startsWith("eyJ");
  return {
    apikey: serviceRoleKey,
    ...(isJwt ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
    "Content-Type": "application/json",
  };
}

async function adminFetch(path: string, init: RequestInit): Promise<Response> {
  const config = adminConfig();
  return fetch(`${config.url}/auth/v1/admin${path}`, {
    ...init,
    headers: adminHeaders(config.serviceRoleKey),
  });
}

function toUser(payload: { id?: string; email?: string }): GoTrueUser {
  return { uid: payload.id ?? "", email: payload.email ?? null };
}

/** Creates an account. `email_confirm` is set so the new user is not asked to verify an
 * address an administrator has already vouched for. */
export async function createGoTrueUser(input: { email: string; password: string; name?: string }): Promise<GoTrueUser> {
  const response = await adminFetch("/users", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name ?? null },
      app_metadata: { provider: "email", providers: ["email"] },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 422 && /already been registered|already exists/i.test(text)) {
      throw new GoTrueUserExistsError(`An account already exists for ${input.email}.`, response.status);
    }
    throw new GoTrueAdminError(`create user failed (${response.status}): ${text}`, response.status);
  }
  return toUser(await response.json());
}

/** Looks an account up by email, or null when there is none. */
export async function findGoTrueUserByEmail(email: string): Promise<GoTrueUser | null> {
  const response = await adminFetch(`/users?filter=${encodeURIComponent(email)}`, { method: "GET" });
  if (!response.ok) {
    const text = await response.text();
    throw new GoTrueAdminError(`lookup user failed (${response.status}): ${text}`, response.status);
  }
  const payload = (await response.json()) as { users?: Array<{ id?: string; email?: string }> };
  const wanted = email.trim().toLowerCase();
  // `filter` is a substring match, so confirm the address rather than trusting it.
  const match = (payload.users ?? []).find((user) => (user.email ?? "").trim().toLowerCase() === wanted);
  return match ? toUser(match) : null;
}

/** Sets a new password on an existing account. */
export async function updateGoTrueUserPassword(uid: string, password: string): Promise<void> {
  const response = await adminFetch(`/users/${encodeURIComponent(uid)}`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new GoTrueAdminError(`update user failed (${response.status}): ${text}`, response.status);
  }
}

/**
 * Updates an existing account's email, password and/or enabled state.
 *
 * The enabled state needs translating. Firebase models it as a `disabled` boolean;
 * GoTrue has no such field and instead bans an account for a duration, with the literal
 * string "none" meaning not banned. So `disabled: true` becomes a 100-year ban and
 * `disabled: false` clears it. A banned user cannot obtain new tokens, which is what the
 * admin screen means by deactivating someone.
 */
export async function updateGoTrueUser(
  uid: string,
  input: { email?: string; password?: string; disabled?: boolean; emailConfirm?: boolean },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (input.email !== undefined) payload.email = input.email;
  if (input.password !== undefined) payload.password = input.password;
  if (input.disabled !== undefined) payload.ban_duration = input.disabled ? "876600h" : "none";
  // Firebase spells this emailVerified; GoTrue confirms the address rather than setting
  // a flag, and only does so when asked.
  if (input.emailConfirm !== undefined) payload.email_confirm = input.emailConfirm;

  const response = await adminFetch(`/users/${encodeURIComponent(uid)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new GoTrueAdminError(`update user failed (${response.status}): ${text}`, response.status);
  }
}

/** Deletes an account. A 404 means it was already gone, which the callers treat as
 * success — the row they care about is the application's own. */
export async function deleteGoTrueUser(uid: string): Promise<void> {
  const response = await adminFetch(`/users/${encodeURIComponent(uid)}`, { method: "DELETE" });
  if (response.status === 404) return;
  if (!response.ok) {
    const text = await response.text();
    throw new GoTrueAdminError(`delete user failed (${response.status}): ${text}`, response.status);
  }
}
