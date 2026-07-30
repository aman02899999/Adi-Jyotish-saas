import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="member-auth-page">
      <section className="member-auth-content">
        <Link href="/account" className="admin-auth-back"><ArrowLeft size={14} /> Back to sign in</Link>
        <div className="member-auth-brand"><BrandMark /></div>
        <div className="admin-auth-card">
          <div className="admin-auth-seal"><Sparkles size={23} /></div>
          <p className="eyebrow"><span /> Account recovery</p>
          <h1>Choose a new<br /><em>password.</em></h1>
          {token ? (
            <ResetPasswordForm endpoint="/api/member/reset-password" token={token} signInHref="/account" />
          ) : (
            <p className="admin-auth-error" role="alert">This reset link is missing its token. Please request a new one from the <Link href="/forgot-password">forgot password</Link> page.</p>
          )}
          <div className="admin-auth-trust"><span><LockKeyhole size={13} /> This will sign you out everywhere else</span></div>
        </div>
      </section>
      <section className="member-auth-art">
        <Image src="/images/vedic-hero.jpg" alt="Vedic astrology experience" fill priority sizes="(max-width: 800px) 100vw, 52vw" />
        <div className="member-auth-art__veil" />
      </section>
    </main>
  );
}
