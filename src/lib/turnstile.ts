import "server-only";

export function isTurnstileConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/** Verifies a Cloudflare Turnstile token. Skips the check (returns true) when Turnstile isn't
 * configured in development, so local/CI work without the secret set. In production, a missing
 * secret fails closed instead — silently allowing every request through with no bot protection
 * on a live site is worse than the anonymous tools being briefly unavailable until the secret is
 * actually configured, and failing loudly surfaces the misconfiguration immediately. */
export async function verifyTurnstileToken(token: string | undefined, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== "production";
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
