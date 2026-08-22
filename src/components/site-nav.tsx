"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Menu, ShoppingBag } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";

const NAV_ITEMS = [
  { href: "/gemstones", key: "gemstones" as const },
  { href: "/astrologers", key: "practitioners" as const },
  { href: "/#services", key: "readings" as const },
  { href: "/#method", key: "ourMethod" as const },
  { href: "/ask", key: "askLive" as const },
  { href: "/palm-reading", key: "palmReading" as const },
  { href: "/tarot-reading", key: "tarotReading" as const },
  { href: "/horoscope", key: "horoscope" as const },
  { href: "/blog", key: "journal" as const },
  { href: "/pricing", key: "pricing" as const },
  { href: "/book", key: "book" as const },
];

const CART_STORAGE_KEY = "jyotish_gem_cart_v1";

function readCartCount() {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return 0;
    const lines = JSON.parse(raw) as { quantity?: number }[];
    return lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0);
  } catch {
    return 0;
  }
}

function isNavItemActive(pathname: string, href: string) {
  if (href.includes("#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const [cartCount, setCartCount] = useState(0);
  const [signedInName, setSignedInName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Cart lives in localStorage, so the real count can only be read after hydration to avoid a server/client mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCartCount(readCartCount());
    const sync = () => setCartCount(readCartCount());
    window.addEventListener("storage", sync);
    window.addEventListener("gemstone-cart-updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("gemstone-cart-updated", sync);
    };
  }, []);

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
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={isNavItemActive(pathname, item.href) ? "active" : undefined}>{t(item.key)}</Link>
        ))}
      </nav>
      <div className="header-actions">
        <LanguageSwitcher compact />
        <Link href={signedInName ? "/dashboard" : "/account"} className="text-link">{signedInName ?? t("signIn")}</Link>
        <Link href={signedInName ? "/dashboard" : "/account?mode=register"} className="button button--small">
          {signedInName ? t("openYourChart") : t("createYourChart")} <ArrowUpRight size={15} />
        </Link>
      </div>
      <Link href="/gemstones/cart" className="header-cart" aria-label={t("cart", { count: cartCount })}>
        <ShoppingBag size={19} />
        {cartCount > 0 && <span className="header-cart__badge">{cartCount > 99 ? "99+" : cartCount}</span>}
      </Link>
      {menuOpen && <div className="mobile-menu__backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <div className="mobile-menu" ref={menuRef}>
        <button type="button" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Menu size={22} /></button>
        {menuOpen && (
          <nav>
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={isNavItemActive(pathname, item.href) ? "active" : undefined}>{t(item.key)}</Link>
            ))}
            <Link href={signedInName ? "/dashboard" : "/account"}>{signedInName ? t("myAccount") : t("signIn")}</Link>
            <LanguageSwitcher />
          </nav>
        )}
      </div>
    </>
  );
}
