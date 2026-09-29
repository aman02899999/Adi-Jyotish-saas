"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Menu } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";

// `primary` items are the ones the desktop bar has room for; the mobile menu lists everything.
// Eleven links in one bar squeezed the sign-in link and the main button onto several lines.
const NAV_ITEMS = [
  { href: "/astrologers", key: "practitioners" as const, primary: true },
  { href: "/#services", key: "readings" as const, primary: true },
  { href: "/ask", key: "askLive" as const, primary: true },
  { href: "/horoscope", key: "horoscope" as const, primary: true },
  { href: "/gemstones", key: "gemstones" as const, primary: true },
  { href: "/pricing", key: "pricing" as const, primary: true },
  { href: "/palm-reading", key: "palmReading" as const, primary: false },
  { href: "/tarot-reading", key: "tarotReading" as const, primary: false },
  { href: "/#method", key: "ourMethod" as const, primary: false },
  { href: "/blog", key: "journal" as const, primary: false },
  { href: "/book", key: "book" as const, primary: false },
];

function isNavItemActive(pathname: string, href: string) {
  if (href.includes("#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const [signedInName, setSignedInName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetched client-side (rather than passed down from a server-rendered SiteHeader) so pages
    // using this nav aren't forced into per-request dynamic rendering just to know who's signed
    // in — see the /api/member/session route comment for why this matters.
    fetch("/api/member/session")
      .then((response) => response.json())
      .then((data: { name: string | null }) => setSignedInName(data.name ? data.name.split(" ")[0] : null))
      .catch(() => {});
  }, []);

  // Closes the mobile menu on outside tap/click, Escape, or navigation — a plain <details> only
  // closes on re-clicking its own <summary>, which reads as "stuck open" on mobile.
  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <nav className="desktop-nav" aria-label="Primary navigation">
        {NAV_ITEMS.filter((item) => item.primary).map((item) => (
          <Link key={item.href} href={item.href} className={isNavItemActive(pathname, item.href) ? "active" : undefined}>{t(item.key)}</Link>
        ))}
      </nav>
      <div className="header-actions">
        <LanguageSwitcher compact />
        <Link href={signedInName ? "/dashboard" : "/account"} className="text-link">{signedInName ?? t("signIn")}</Link>
        {signedInName && (
          <form action="/api/member/logout" method="post">
            <button type="submit" className="text-link">{t("signOut")}</button>
          </form>
        )}
        <Link href={signedInName ? "/dashboard" : "/account?mode=register"} className="button button--small">
          {signedInName ? t("openYourChart") : t("createYourChart")} <ArrowUpRight size={15} />
        </Link>
      </div>
      {menuOpen && <div className="mobile-menu__backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <div className="mobile-menu" ref={menuRef}>
        <button type="button" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Menu size={22} /></button>
        {menuOpen && (
          <nav>
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={isNavItemActive(pathname, item.href) ? "active" : undefined}>{t(item.key)}</Link>
            ))}
            <Link href={signedInName ? "/dashboard" : "/account"}>{signedInName ? t("myAccount") : t("signIn")}</Link>
            {signedInName && (
              <form action="/api/member/logout" method="post">
                <button type="submit" className="mobile-nav-signout">{t("signOut")}</button>
              </form>
            )}
            <LanguageSwitcher />
          </nav>
        )}
      </div>
    </>
  );
}
