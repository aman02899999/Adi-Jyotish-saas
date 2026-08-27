import "server-only";

/**
 * Builds the 303 response a sign-out form POST redirects to.
 *
 * This deliberately sets a *relative* Location instead of using NextResponse.redirect(), which
 * requires an absolute URL and is normally fed `new URL(path, request.url)`. In a route handler
 * `request.url` is the URL the server saw, not the one the browser typed — behind a proxy (or
 * simply reaching the dev server on 127.0.0.1 instead of localhost) it resolves to a different
 * host, so the absolute Location points at a different origin than the page that submitted the
 * form. Chrome checks each hop of a form submission against `form-action`, our CSP sets
 * `form-action 'self'`, and a cross-origin hop is refused — which killed the navigation while the
 * POST itself had already revoked the session. The visible result was a sign-out button that
 * looked completely dead: the page never changed even though the user was, in fact, signed out.
 *
 * A relative Location is resolved by the browser against the page's own origin, so it is
 * same-origin by construction and no host mismatch can reintroduce this.
 */
export function logoutRedirect(path: `/${string}`) {
  return new Response(null, { status: 303, headers: { Location: path } });
}
