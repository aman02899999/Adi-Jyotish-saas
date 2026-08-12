import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { PractitionerAuthForm } from "@/components/practitioner-auth-form";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentPractitioner } from "@/lib/practitioner-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Practitioner Sign In",
  robots: { index: false, follow: false },
};

export default async function PractitionerLoginPage() {
  if (await getCurrentPractitioner()) redirect("/practitioner");

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-art">
        <Image src="/images/orbital-system.jpg" fill priority sizes="(max-width: 800px) 100vw, 50vw" alt="Celestial orbital system" />
        <div className="admin-auth-art__veil" />
        <div className="admin-auth-art__brand"><BrandMark /></div>
        <div className="admin-auth-quote">
          <p>“The stars incline;<br />they do not compel.”</p>
          <span>Jyotish practitioner network</span>
        </div>
        <div className="auth-orbit auth-orbit--one" /><div className="auth-orbit auth-orbit--two" />
      </section>
      <section className="admin-auth-content">
        <Link href="/" className="admin-auth-back"><ArrowLeft size={14} /> Back to Jyotish</Link>
        <div className="admin-auth-card">
          <div className="admin-auth-seal"><ShieldCheck size={23} /></div>
          <p className="eyebrow"><span /> Practitioner workspace</p>
          <h1>Welcome back,<br /><em>practitioner.</em></h1>
          <p className="admin-auth-intro">Manage your calendar, clients, reviews, and earnings.</p>
          <PractitionerAuthForm />
          <div className="admin-auth-trust"><span><LockKeyhole size={13} /> Encrypted password</span><span><Check size={13} /> Revocable sessions</span></div>
        </div>
        <small className="admin-auth-footer">Practitioner access · Sessions expire after 14 days</small>
      </section>
    </main>
  );
}
