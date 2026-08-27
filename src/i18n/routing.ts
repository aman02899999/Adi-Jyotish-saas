import { defineRouting } from "next-intl/routing";

// English stays the default (existing URLs keep working with no prefix). Hindi is the first
// regional locale — the tone is Hinglish (casual code-mixed Hindi/English, matching how most
// Indian users actually search and read), not textbook-formal Hindi. Add more locales here
// (e.g. "ta", "te", "bn", "mr") once their message catalogs exist; everything else in the i18n
// setup (routing, the language switcher, hreflang) reads from this single list.
export const locales = ["en", "hi"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "en";

/**
 * What a signed-in member gets unless they pick something else.
 *
 * Deliberately different from `defaultLocale`: anonymous visitors and search engines still get
 * English at unprefixed URLs (so existing links and SEO are untouched), but once someone signs in
 * they are one of this platform's actual users, and this platform speaks Hinglish — the readings
 * themselves are written that way. The language switcher overrides this at any time and the
 * choice is stored on the member, so it is a starting point rather than a lock.
 */
export const SIGNED_IN_DEFAULT_LOCALE: AppLocale = "hi";

export const localeNames: Record<AppLocale, string> = {
  en: "English",
  hi: "हिंदी",
};

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed", // default locale (en) keeps unprefixed URLs; hi:// URLs get /hi/...
});
