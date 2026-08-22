import { Link } from "@/i18n/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AdminInviteForm } from "@/components/admin-invite-form";
import { BrandMark } from "@/components/brand-mark";
import { findAdminInviteByToken } from "@/lib/admin-invites";

export const dynamic = "force-dynamic";

export default async function AdminInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findAdminInviteByToken(token);

  return (
    <main className="invite-page">
      <header><BrandMark /><Link href="/"><ArrowLeft size={14} /> Return home</Link></header>
      <section>
        {invite ? (
          <>
            <div className="admin-auth-seal"><ShieldCheck size={23} /></div>
            <p className="eyebrow"><span /> Studio invitation</p>
            <h1>Join the Jyotish<br /><em>operations team.</em></h1>
            <p>Your access has been scoped for your role. Create a secure password to enter the workspace.</p>
            <AdminInviteForm token={token} email={invite.email} role={invite.role} />
          </>
        ) : (
          <div className="expired-invite">
            <ShieldCheck size={27} />
            <h1>This invitation<br /><em>is no longer active.</em></h1>
            <p>Ask a workspace owner to send a fresh invitation.</p>
            <Link className="button button--ghost" href="/admin/login">Administrator sign in</Link>
          </div>
        )}
      </section>
    </main>
  );
}
