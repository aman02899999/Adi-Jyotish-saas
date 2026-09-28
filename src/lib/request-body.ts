/**
 * Reads a JSON request body, or `{}` when the body is missing or not valid JSON.
 *
 * `request.json()` throws on a malformed body, and a throw in a route handler becomes a 500. Every
 * route validates the fields it needs, so an empty object turns a bad request into that route's own
 * 400 ("Enter a valid email", "Missing reading id", ...) instead of a server error. Typed like
 * `request.json()` itself, so callers keep their existing `as { ... }` casts.
 */
export async function readJsonBody(request: Request): ReturnType<Request["json"]> {
  try {
    const body: unknown = await request.json();
    return body !== null && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/**
 * The value when it is a string, otherwise undefined. Request bodies are typed by a cast, not
 * checked, so `body.name?.trim()` throws a TypeError (a 500) when a client sends a number or an
 * array; `asText(body.name)?.trim()` treats it as missing instead, and the route's own validation
 * answers.
 */
export function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
