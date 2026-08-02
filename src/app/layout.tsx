import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { GoogleAnalytics } from "@/components/google-analytics";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  applicationName: "Adi Jyotish Gurus",
  title: { default: "Adi Jyotish Gurus — Ancient clarity for modern life", template: "%s · Adi Jyotish Gurus" },
  description: "Personal Vedic astrology readings, cosmic insights, and auspicious timing for modern life.",
  openGraph: {
    type: "website",
    title: "Adi Jyotish Gurus — Ancient clarity for modern life",
    description: "Personal Vedic astrology readings and thoughtful cosmic guidance.",
    url: "/",
    siteName: "Adi Jyotish Gurus",
    images: [{ url: "/images/vedic-hero.jpg", width: 1200, height: 675, alt: "Adi Jyotish Gurus Vedic astrology experience" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Adi Jyotish Gurus — Ancient clarity for modern life",
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
      <body>{children}</body>
      <GoogleAnalytics />
    </html>
  );
}
