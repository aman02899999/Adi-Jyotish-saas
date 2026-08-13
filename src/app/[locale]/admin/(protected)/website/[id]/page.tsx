import { notFound } from "next/navigation";
import { AdminPageBuilder } from "@/components/admin-page-builder";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getCustomPageById } from "@/lib/custom-pages";

export const dynamic = "force-dynamic";

export default async function AdminWebsitePageBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("website");
  const { id } = await params;
  const page = await getCustomPageById(id);
  if (!page) notFound();

  return (
    <AdminShell active="Website">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Content</p><h1>Edit page</h1><span>Drag blocks to reorder, edit their content, and publish when ready.</span></div></div>
        <AdminPageBuilder page={page} />
      </div>
    </AdminShell>
  );
}
