import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { GoogleAnalytics } from "@/components/google-analytics";
import { JsonLd } from "@/components/json-ld";
import { MetaPixel } from "@/components/meta-pixel";
import { PromoBanner } from "@/components/promo-banner";
import { RouteProgress } from "@/components/route-progress";
import { routing, type AppLocale } from "@/i18n/routing";
import { getSiteUrl } from "@/lib/site-url";
import "../globals.css";

// Self-hosted at build time by next/font: no request to Google from the visitor's browser, and a
// size-matched fallback means text does not jump when the font arrives. Fraunces carries the
// headings and Inter the text; they replace the Georgia/Arial system stack, which globals.css keeps
// as the fallbacks behind these variables.
// Headings are set at weight 400 almost everywhere (211 of 214 rules), so Fraunces loads as that
// one static weight in upright and true italic (the <em> in every headline) rather than the
// variable font, whose optical-size axis made each file about 80 KB. latin-ext is included and
// preloaded because prices use the ₹ sign; left out, the browser still fetched it, only later.
const serifFont = Fraunces({ subsets: ["latin", "latin-ext"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const sansFont = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });

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

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "RootLayout" });
  return {
    metadataBase: siteUrl,
    applicationName: "Adi Jyotish Guru",
    title: { default: t("title"), template: "%s · Adi Jyotish Guru" },
    description: t("description"),
    openGraph: {
      type: "website",
      title: t("title"),
      description: t("ogDescription"),
      url: "/",
      siteName: "Adi Jyotish Guru",
      images: [{ url: "/images/vedic-hero.jpg", width: 1200, height: 675, alt: "Adi Jyotish Guru Vedic astrology experience" }],
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("ogDescription"),
      images: ["/images/vedic-hero.jpg"],
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eee8de",
};

export default async function RootLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  // Lets every Server Component in this locale render statically (via next-intl's async
  // storage) instead of forcing dynamic rendering just to know which locale it's in.
  setRequestLocale(locale as AppLocale);

  return (
    <html lang={locale} className={`${serifFont.variable} ${sansFont.variable}`}>
      <body>
        <NextIntlClientProvider>
          <RouteProgress />
          <JsonLd data={websiteJsonLd} />
          <PromoBanner />
          {children}
        </NextIntlClientProvider>
      </body>
      <GoogleAnalytics />
      <MetaPixel />
    </html>
  );
}
