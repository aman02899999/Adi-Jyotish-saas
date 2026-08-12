import { AdminCustomPages } from "@/components/admin-custom-pages";
import { AdminShell } from "@/components/admin-shell";
import { AdminWebsiteContent } from "@/components/admin-website-content";
import { requireAdminPage } from "@/lib/admin-page";
import { getAllCustomPagesAdmin } from "@/lib/custom-pages";
import { getFooterContent, getHomeHeroContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export default async function AdminWebsitePage() {
  await requireAdminPage("website");
  const [hero, footer, pages] = await Promise.all([getHomeHeroContent(), getFooterContent(), getAllCustomPagesAdmin()]);
  return (
    <AdminShell active="Website">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Content</p><h1>Website</h1><span>Edit the homepage and footer, or build brand-new pages with drag-and-drop blocks.</span></div><div><small>Last synced</small><strong>Just now <i /></strong></div></div>
        <AdminWebsiteContent initialHero={hero} initialFooter={footer} />
        <AdminCustomPages initialPages={pages} />
      </div>
    </AdminShell>
  );
}
