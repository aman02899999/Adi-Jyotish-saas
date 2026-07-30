import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default async function PractitionerResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
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
          <h1>Choose a new<br /><em>password.</em></h1>
          {token ? (
            <ResetPasswordForm endpoint="/api/auth/practitioner-reset-password" token={token} signInHref="/practitioner/login" />
          ) : (
            <p className="admin-auth-error" role="alert">This reset link is missing its token. Please request a new one from the <Link href="/practitioner/forgot-password">forgot password</Link> page.</p>
          )}
          <div className="admin-auth-trust"><span><LockKeyhole size={13} /> This will sign you out everywhere else</span></div>
        </div>
      </section>
    </main>
  );
}
