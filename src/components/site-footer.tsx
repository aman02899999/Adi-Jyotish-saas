import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export function SiteFooter() {
  return (
    <footer className="footer shell">
      <BrandMark />
      <p>Ancient wisdom for modern life.<br />Made thoughtfully in the present.</p>
      <div>
        <Link href="/astrologers">Practitioners</Link>
        <Link href="/blog">Journal</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/dashboard">Dashboard</Link>
      </div>
      <small>© {new Date().getFullYear()} Adi Jyotish Gurus</small>
      <div className="footer__legal">
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/refund-policy">Refund &amp; Cancellation</Link>
        <span>Readings are offered for guidance and self-reflection. They are not a substitute for medical, legal, or financial advice, and no specific outcome is guaranteed.</span>
      </div>
    </footer>
  );
}
