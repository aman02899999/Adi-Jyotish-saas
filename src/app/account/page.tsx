import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, LockKeyhole, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { MemberAuthForm } from "@/components/member-auth-form";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const [member, query] = await Promise.all([getCurrentMember(), searchParams]);
  if (member) redirect(member.onboardingComplete ? "/dashboard" : "/onboarding");
  const initialMode = query.mode === "register" ? "register" : "login";

  return (
    <main className="member-auth-page">
      <section className="member-auth-content">
        <Link href="/" className="admin-auth-back"><ArrowLeft size={14} /> Back home</Link>
        <div className="member-auth-brand"><BrandMark /></div>
        <div className="admin-auth-card">
          <div className="admin-auth-seal"><Sparkles size={23} /></div>
          <p className="eyebrow"><span /> Your private cosmos</p>
          <h1>Return to your<br /><em>place in the sky.</em></h1>
          <p className="admin-auth-intro">Save your exact birth chart, see personal guidance, and keep every consultation together in one quiet place.</p>
          <MemberAuthForm initialMode={initialMode} />
          <div className="admin-auth-trust"><span><LockKeyhole size={13} /> Private birth data</span><span><Check size={13} /> Secure 14-day session</span></div>
        </div>
        <small className="admin-auth-footer">Your information is used only for your Jyotish experience</small>
      </section>
      <section className="member-auth-art">
        <Image src="/images/vedic-hero.jpg" alt="Vedic astrology experience" fill priority sizes="(max-width: 800px) 100vw, 52vw" />
        <div className="member-auth-art__veil" />
        <div className="member-auth-promise"><span>✦</span><p>One birth moment.<br /><em>A lifetime of context.</em></p><small>Authentic sidereal calculation · personal guidance</small></div>
      </section>
    </main>
  );
}
