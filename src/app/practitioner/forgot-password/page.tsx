import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default function PractitionerForgotPasswordPage() {
  return (
    <main className="admin-auth-page">
      <section className="admin-auth-art">
        <Image src="/images/orbital-system.jpg" fill priority sizes="(max-width: 800px) 100vw, 50vw" alt="Celestial orbital system" />
        <div className="admin-auth-art__veil" />
        <div className="admin-auth-art__brand"><BrandMark /></div>
        <div className="auth-orbit auth-orbit--one" /><div className="auth-orbit auth-orbit--two" />
      </section>
      <section className="admin-auth-content">
        <Link href="/practitioner/login" className="admin-auth-back"><ArrowLeft size={14} /> Back to sign in</Link>
        <div className="admin-auth-card">
          <div className="admin-auth-seal"><ShieldCheck size={23} /></div>
          <p className="eyebrow"><span /> Account recovery</p>
          <h1>Forgot your<br /><em>password?</em></h1>
          <p className="admin-auth-intro">Enter the email on your practitioner account and we&rsquo;ll send you a link to choose a new password.</p>
          <ForgotPasswordForm endpoint="/api/auth/practitioner-forgot-password" />
          <div className="admin-auth-trust"><span><LockKeyhole size={13} /> Link expires in 30 minutes</span></div>
        </div>
      </section>
    </main>
  );
}
