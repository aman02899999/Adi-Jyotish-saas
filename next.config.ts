import type { NextConfig } from "next";
import withBundleAnalyzerInit from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withBundleAnalyzer = withBundleAnalyzerInit({ enabled: process.env.ANALYZE === "true" });
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const contentSecurityPolicy = [
  "default-src 'self'",
  // checkout.razorpay.com is the Razorpay Checkout widget script every paid flow on this site
  // loads client-side (bookings, AI readings, gemstones, subscriptions) — was missing here
  // entirely, which would have silently blocked the widget from loading in production.
  "script-src 'self' 'unsafe-inline' https://apis.google.com https://challenges.cloudflare.com https://www.googletagmanager.com https://connect.facebook.net https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.google-analytics.com https://www.facebook.com https://*.razorpay.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://apis.google.com https://*.sentry.io https://challenges.cloudflare.com https://www.googletagmanager.com https://*.google-analytics.com https://connect.facebook.net https://www.facebook.com https://*.razorpay.com" + (process.env.NEXT_PUBLIC_USE_EMULATOR === "true" ? " http://127.0.0.1:9099" : ""),
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://challenges.cloudflare.com https://*.razorpay.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // firebase-admin's grpc/protobuf dependency tree defeats bundler tracing when inlined;
  // externalizing lets the platform's own Node-module resolution handle it at runtime.
  serverExternalPackages: ["firebase-admin", "google-gax", "@grpc/grpc-js", "@sentry/nextjs"],
  // AVIF isn't in Next's default format list (slower to encode) but is typically 20-30% smaller
  // than WebP for photographic content — worth it here since gemstone/blog/practitioner photos
  // make up most of the page weight on this site. Next still falls back to WebP/original per the
  // client's Accept header.
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Not content-hashed filenames (unlike /_next/static, which Next already caches
      // immutably), so a moderate cache instead of a year-long immutable one — still a real win
      // for repeat visits without risking a stale image sticking around after a future swap.
      { source: "/images/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
};

// The officially supported way to run @sentry/nextjs: readable production stack traces via
// source maps (only actually uploaded when SENTRY_AUTH_TOKEN is set — silent no-op otherwise,
// never blocks the build) and treeshake.removeDebugLogging to strip Sentry's own internal debug
// logger strings from the client bundle.
export default withSentryConfig(withNextIntl(withBundleAnalyzer(nextConfig)), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  webpack: { treeshake: { removeDebugLogging: true }, automaticVercelMonitors: false },
});
