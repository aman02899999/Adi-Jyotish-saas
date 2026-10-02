import "server-only";

/**
 * Sign-in routes used to answer every failure after the password check with "Email or password
 * is incorrect" and count it as a failed attempt. When the database was unreachable or out of its
 * daily quota, people who typed the right password were told it was wrong. After five tries they
 * were locked out. These separate an outage from a bad credential.
 */

// gRPC (Firestore): 4 DEADLINE_EXCEEDED, 8 RESOURCE_EXHAUSTED (quota), 14 UNAVAILABLE.
const GRPC_UNAVAILABLE = new Set([4, 8, 14]);
// Postgres and its driver: refused or timed-out connections, too many connections, shutting down.
const PG_UNAVAILABLE = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "53300", "57P01", "57P03"]);

export function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code: unknown }).code;
  return typeof code === "number" ? GRPC_UNAVAILABLE.has(code) : PG_UNAVAILABLE.has(String(code));
}

export function signInUnavailableResponse() {
  return Response.json(
    { error: "Sign-in is temporarily unavailable. Your password was not rejected; please try again in a few minutes." },
    { status: 503, headers: { "Retry-After": "60" } },
  );
}

/** Runs a sign-in handler, turning a database outage anywhere inside it into a 503. */
export async function withSignInOutageHandling(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    console.error("Sign-in failed: database unavailable", error);
    return signInUnavailableResponse();
  }
}
