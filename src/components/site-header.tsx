import { BrandMark } from "@/components/brand-mark";
import { SiteNav } from "@/components/site-nav";

// Deliberately does NOT check the signed-in member server-side (that used to call cookies() here,
// which forces every public page that renders this header into full per-request dynamic
// rendering). SiteNav fetches its own signed-in state client-side instead — see its comment.
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner shell">
        <BrandMark />
        <SiteNav />
      </div>
    </header>
  );
}
