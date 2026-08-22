export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    await import("../sentry.server.config");
  }
}

// Next's dedicated RSC-era error hook — without it, errors thrown during server rendering (as
// opposed to a caught API route or the client error boundaries in src/app/*error.tsx) never reach
// Sentry at all, since captureRequestError has to be wired to this specific export to run.
export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  if (!process.env.SENTRY_DSN) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  await captureRequestError(...args);
}
