import Link from "next/link";
import { ArrowUpRight, Menu } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentMember } from "@/lib/member-auth";

export async function SiteHeader() {
  const member = await getCurrentMember();
  return (
    <header className="site-header">
      <div className="site-header__inner shell">
        <BrandMark />
        <nav className="desktop-nav" aria-label="Primary navigation">
          <Link href="/astrologers">Practitioners</Link>
          <Link href="/#services">Readings</Link>
          <Link href="/#method">Our method</Link>
          <Link href="/blog">Journal</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/book">Book</Link>
        </nav>
        <div className="header-actions">
          <Link href={member ? "/dashboard" : "/account"} className="text-link">{member ? member.name.split(" ")[0] : "Sign in"}</Link>
          <Link href={member ? "/dashboard" : "/account?mode=register"} className="button button--small">
            {member ? "Open your chart" : "Create your chart"} <ArrowUpRight size={15} />
          </Link>
        </div>
        <details className="mobile-menu">
          <summary aria-label="Open navigation"><Menu size={22} /></summary>
          <nav>
            <Link href="/astrologers">Practitioners</Link>
            <Link href="/#services">Readings</Link>
            <Link href="/#method">Our method</Link>
            <Link href="/blog">Journal</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/book">Book a reading</Link>
            <Link href={member ? "/dashboard" : "/account"}>{member ? "My account" : "Sign in"}</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
