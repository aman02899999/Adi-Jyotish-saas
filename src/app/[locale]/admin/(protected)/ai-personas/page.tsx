import { ShieldCheck } from "lucide-react";
import { AdminAiPersonas } from "@/components/admin-ai-personas";
import { AdminGeminiHealth } from "@/components/admin-gemini-health";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { getAllPersonasAdmin } from "@/lib/ai-personas";
import { isGeminiConfigured } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export default async function AdminAiPersonasPage() {
  await requireAdminPage("ai_personas");
  const personas = await getAllPersonasAdmin();
  const geminiConfigured = isGeminiConfigured();
  return (
    <AdminShell active="AI Personas">
      <div className="admin-content">
        <div className="admin-heading"><div><p>Jyotish / Live AI</p><h1>AI Personas</h1><span>Create new AI-powered reading personas without writing any code.</span></div><div><small>Last synced</small><strong>Just now <i /></strong></div></div>
        {!geminiConfigured && (
          <div className="finance-config-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Live readings are not configured</strong>
              <span>GEMINI_API_KEY is not set — every reading here and on /ask, /palm-reading, /tarot-reading, /face-reading, /vastu-consultation, and /lal-kitab-reading will accept payment (or the free credit) but sit stuck as &ldquo;still being prepared&rdquo; until it&rsquo;s set in your hosting provider&rsquo;s environment variables. Once set, a stuck reading completes automatically the next time the member reopens it (or up to 3 attempts total) — there is no background job that retries these on its own, so any reading that already exhausted its attempts and shows &ldquo;failed&rdquo; needs a manual retry from a reading&rsquo;s detail view.</span>
            </div>
          </div>
        )}
        <AdminGeminiHealth />
        <AdminAiPersonas initialPersonas={personas} />
      </div>
    </AdminShell>
  );
}
