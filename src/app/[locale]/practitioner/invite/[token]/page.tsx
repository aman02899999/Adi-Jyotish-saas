import { Link } from "@/i18n/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { db } from "@/lib/firestore";
import { PractitionerInviteForm } from "@/components/practitioner-invite-form";
import { BrandMark } from "@/components/brand-mark";
import { findPractitionerInviteByToken } from "@/lib/practitioner-invites";

export const dynamic = "force-dynamic";

export default async function PractitionerInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findPractitionerInviteByToken(token);
  const practitionerSnap = invite ? await db.collection("practitioners").doc(invite.practitionerSlug).get() : null;
  const practitioner = practitionerSnap?.exists ? (practitionerSnap.data() as { name: string; email: string }) : null;

  return (
    <main className="invite-page">
      <header><BrandMark /><Link href="/"><ArrowLeft size={14} /> Return home</Link></header>
      <section>
        {practitioner ? (
          <>
            <div className="admin-auth-seal"><ShieldCheck size={23} /></div>
            <p className="eyebrow"><span /> Practitioner invitation</p>
            <h1>Set up your<br /><em>practitioner workspace.</em></h1>
            <p>Manage your calendar, clients, reviews, and earnings from one secure dashboard.</p>
            <PractitionerInviteForm token={token} name={practitioner.name} email={practitioner.email} />
          </>
        ) : (
          <div className="expired-invite">
            <ShieldCheck size={27} />
            <h1>This invitation<br /><em>is no longer active.</em></h1>
            <p>Ask the studio team to send a fresh invitation.</p>
            <Link className="button button--ghost" href="/practitioner/login">Practitioner sign in</Link>
          </div>
        )}
      </section>
    </main>
  );
}
