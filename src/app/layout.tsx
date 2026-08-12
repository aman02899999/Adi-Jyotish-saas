import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GoogleAnalytics } from "@/components/google-analytics";
import { JsonLd } from "@/components/json-ld";
import { MetaPixel } from "@/components/meta-pixel";
import { PromoBanner } from "@/components/promo-banner";
import { RouteProgress } from "@/components/route-progress";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const siteUrl = getSiteUrl();
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Adi Jyotish Guru",
  url: siteUrl.toString(),
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${new URL("/astrologers", siteUrl).toString()}?q={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: "Adi Jyotish Guru",
  title: { default: "Adi Jyotish Guru — Ancient clarity for modern life", template: "%s · Adi Jyotish Guru" },
  description: "Personal Vedic astrology readings, cosmic insights, and auspicious timing for modern life.",
  openGraph: {
    type: "website",
    title: "Adi Jyotish Guru — Ancient clarity for modern life",
    description: "Personal Vedic astrology readings and thoughtful cosmic guidance.",
    url: "/",
    siteName: "Adi Jyotish Guru",
    images: [{ url: "/images/vedic-hero.jpg", width: 1200, height: 675, alt: "Adi Jyotish Guru Vedic astrology experience" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Adi Jyotish Guru — Ancient clarity for modern life",
    description: "Personal Vedic astrology readings and thoughtful cosmic guidance.",
    images: ["/images/vedic-hero.jpg"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eee8de",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RouteProgress />
        <JsonLd data={websiteJsonLd} />
        <PromoBanner />
        {children}
      </body>
      <GoogleAnalytics />
      <MetaPixel />
    </html>
  );
}
