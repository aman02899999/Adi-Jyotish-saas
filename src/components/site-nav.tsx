"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, ShoppingBag } from "lucide-react";

const NAV_ITEMS = [
  { href: "/gemstones", label: "Gemstones" },
  { href: "/astrologers", label: "Practitioners" },
  { href: "/#services", label: "Readings" },
  { href: "/#method", label: "Our method" },
  { href: "/ask", label: "Ask Live" },
  { href: "/palm-reading", label: "Palm Reading" },
  { href: "/tarot-reading", label: "Tarot Reading" },
  { href: "/horoscope", label: "Horoscope" },
  { href: "/blog", label: "Journal" },
  { href: "/pricing", label: "Pricing" },
  { href: "/book", label: "Book" },
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

export function SiteNav({ signedInName }: { signedInName: string | null }) {
  const pathname = usePathname();
  const [cartCount, setCartCount] = useState(0);
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
          <Link key={item.href} href={item.href} className={isNavItemActive(pathname, item.href) ? "active" : undefined}>{item.label}</Link>
        ))}
      </nav>
      <div className="header-actions">
        <Link href={signedInName ? "/dashboard" : "/account"} className="text-link">{signedInName ?? "Sign in"}</Link>
        <Link href={signedInName ? "/dashboard" : "/account?mode=register"} className="button button--small">
          {signedInName ? "Open your chart" : "Create your chart"} <ArrowUpRight size={15} />
        </Link>
      </div>
      <Link href="/gemstones/cart" className="header-cart" aria-label={`View cart${cartCount ? ` (${cartCount} item${cartCount === 1 ? "" : "s"})` : ""}`}>
        <ShoppingBag size={19} />
        {cartCount > 0 && <span className="header-cart__badge">{cartCount > 99 ? "99+" : cartCount}</span>}
      </Link>
      <div className="mobile-menu" ref={menuRef}>
        <button type="button" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Menu size={22} /></button>
        {menuOpen && (
          <nav>
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={isNavItemActive(pathname, item.href) ? "active" : undefined}>{item.label}</Link>
            ))}
            <Link href={signedInName ? "/dashboard" : "/account"}>{signedInName ? "My account" : "Sign in"}</Link>
          </nav>
        )}
      </div>
    </>
  );
}
