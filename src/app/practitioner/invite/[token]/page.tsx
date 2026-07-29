import { createHash } from "node:crypto";
import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import { practitionerInvites, practitioners } from "@/db/schema";
import { PractitionerInviteForm } from "@/components/practitioner-invite-form";
import { BrandMark } from "@/components/brand-mark";

export const dynamic = "force-dynamic";

export default async function PractitionerInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hash = createHash("sha256").update(token).digest("hex");
  const [row] = await db.select({ invite: practitionerInvites, practitioner: practitioners })
    .from(practitionerInvites)
    .innerJoin(practitioners, eq(practitionerInvites.practitionerId, practitioners.id))
    .where(and(eq(practitionerInvites.tokenHash, hash), isNull(practitionerInvites.acceptedAt), gt(practitionerInvites.expiresAt, new Date())))
    .limit(1);

  return (
    <main className="invite-page">
      <header><BrandMark /><Link href="/"><ArrowLeft size={14} /> Return home</Link></header>
      <section>
        {row ? (
          <>
            <div className="admin-auth-seal"><ShieldCheck size={23} /></div>
            <p className="eyebrow"><span /> Practitioner invitation</p>
            <h1>Set up your<br /><em>practitioner workspace.</em></h1>
            <p>Manage your calendar, clients, reviews, and earnings from one secure dashboard.</p>
            <PractitionerInviteForm token={token} name={row.practitioner.name} email={row.practitioner.email} />
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
