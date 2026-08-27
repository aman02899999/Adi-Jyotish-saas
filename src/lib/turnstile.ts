import "server-only";

export function isTurnstileConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Verifies a Cloudflare Turnstile token.
 *
 * The widget only renders when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so whether a caller can
 * possibly hold a token depends on that key, not on the secret. The three cases are therefore
 * treated differently:
 *
 * - Secret set → verify the token properly, failing closed on anything invalid.
 * - Secret missing but site key set → a real misconfiguration: the widget is live and users are
 *   solving a challenge nobody can validate. Fail closed so it surfaces immediately.
 * - Neither set → Turnstile is simply not deployed. No widget ever renders and no token can
 *   exist, so the check is skipped.
 *
 * That last case previously failed closed in production, which silently killed every route behind
 * this check — member registration included — with a CAPTCHA error the UI gave users no way to
 * satisfy, since no challenge was ever shown. Failing closed only protects anything when a
 * challenge actually exists to fail.
 */
export async function verifyTurnstileToken(token: string | undefined, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!token) return false;

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await response.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
