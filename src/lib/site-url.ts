export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return new URL(configured.startsWith("http") ? configured : `https://${configured}`);
  return new URL("http://localhost:3000");
}
