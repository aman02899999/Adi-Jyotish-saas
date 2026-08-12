import { AdminAiPersonas } from "@/components/admin-ai-personas";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAllPersonasAdmin } from "@/lib/ai-personas";

export const dynamic = "force-dynamic";

export default async function AdminAiPersonasPage() {
  await requireAdminPage("ai_personas");
  const personas = await getAllPersonasAdmin();
  return (
    <AdminShell active="AI Personas">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Live AI</p><h1>AI Personas</h1><span>Create new AI-powered reading personas without writing any code.</span></div><div><small>Last synced</small><strong>Just now <i /></strong></div></div>
        <AdminAiPersonas initialPersonas={personas} />
      </div>
    </AdminShell>
  );
}
