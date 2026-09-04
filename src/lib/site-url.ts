export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return new URL(configured.startsWith("http") ? configured : `https://${configured}`);
  // Production must never emit localhost URLs into sitemaps/robots/canonical tags just
  // because the site URL env var was left unset on a deployment.
  if (process.env.NODE_ENV === "production") return new URL("https://www.astronomers.in");
  return new URL("http://localhost:3000");
}
