import type { Metadata } from "next";
import Image from "next/image";
import { getLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { ArrowLeft, Check, LockKeyhole, ShieldCheck } from "lucide-react";
import { AdminAuthForm } from "@/components/admin-auth-form";
import { BrandMark } from "@/components/brand-mark";
import { getAdminCount, getCurrentAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Studio Admin Sign In",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await getCurrentAdmin()) redirect({ href: "/admin", locale: await getLocale() });
  const setup = await getAdminCount() === 0;

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-art">
        <Image src="/images/orbital-system.jpg" fill priority sizes="(max-width: 800px) 100vw, 50vw" alt="Celestial orbital system" />
        <div className="admin-auth-art__veil" />
        <div className="admin-auth-art__brand"><BrandMark /></div>
        <div className="admin-auth-quote">
          <p>“Order is the first<br />language of the stars.”</p>
          <span>Jyotish operations studio</span>
        </div>
        <div className="auth-orbit auth-orbit--one" /><div className="auth-orbit auth-orbit--two" />
      </section>
      <section className="admin-auth-content">
        <Link href="/" className="admin-auth-back"><ArrowLeft size={14} /> Back to Jyotish</Link>
        <div className="admin-auth-card">
          <div className="admin-auth-seal"><ShieldCheck size={23} /></div>
          <p className="eyebrow"><span /> {setup ? "First-run security" : "Protected administration"}</p>
          <h1>{setup ? <>Create your<br /><em>owner account.</em></> : <>Welcome back,<br /><em>administrator.</em></>}</h1>
          <p className="admin-auth-intro">{setup ? "Establish the first and only workspace owner. No default credentials have been created for you." : "Sign in to manage readings, customer bookings, payments, and studio operations."}</p>
          <AdminAuthForm setup={setup} />
          <div className="admin-auth-trust"><span><LockKeyhole size={13} /> Encrypted password</span><span><Check size={13} /> Revocable sessions</span></div>
        </div>
        <small className="admin-auth-footer">Secure administration · Sessions expire after seven days</small>
      </section>
    </main>
  );
}
