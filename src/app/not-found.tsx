import Link from "next/link";
import { ArrowRight, Compass, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export default function NotFound() {
  return (
    <main className="error-page">
      <div className="error-page__seal"><Compass size={26} /></div>
      <p className="error-page__code">404 · Off the chart</p>
      <h1>This page isn&rsquo;t<br /><em>in the stars.</em></h1>
      <p>The link may be old, or the page may have moved. Let&rsquo;s get you back to solid ground.</p>
      <div className="error-page__actions">
        <Link href="/" className="button">Return home <ArrowRight size={16} /></Link>
        <Link href="/astrologers" className="button button--ghost">Browse practitioners <Sparkles size={15} /></Link>
      </div>
      <BrandMark compact />
    </main>
  );
}
