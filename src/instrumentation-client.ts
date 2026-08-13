// Named imports instead of `import * as Sentry` — this app never uses Session Replay or the
// Feedback widget, and importing only what's actually called lets the bundler tree-shake those
// (each several hundred KB) out of every page's client bundle instead of shipping them unused.
import { captureRouterTransitionStart, init } from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
  });
}

export const onRouterTransitionStart = captureRouterTransitionStart;
