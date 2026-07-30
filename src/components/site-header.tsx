import { BrandMark } from "@/components/brand-mark";
import { SiteNav } from "@/components/site-nav";
import { getCurrentMember } from "@/lib/member-auth";

export async function SiteHeader() {
  const member = await getCurrentMember();
  return (
    <header className="site-header">
      <div className="site-header__inner shell">
        <BrandMark />
        <SiteNav signedInName={member ? member.name.split(" ")[0] : null} />
      </div>
    </header>
  );
}
