import type { NextConfig } from "next";

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
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
