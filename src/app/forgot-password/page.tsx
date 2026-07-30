import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <main className="member-auth-page">
      <section className="member-auth-content">
        <Link href="/account" className="admin-auth-back"><ArrowLeft size={14} /> Back to sign in</Link>
        <div className="member-auth-brand"><BrandMark /></div>
        <div className="admin-auth-card">
          <div className="admin-auth-seal"><Sparkles size={23} /></div>
          <p className="eyebrow"><span /> Account recovery</p>
          <h1>Forgot your<br /><em>password?</em></h1>
          <p className="admin-auth-intro">Enter the email on your account and we&rsquo;ll send you a link to choose a new password.</p>
          <ForgotPasswordForm endpoint="/api/member/forgot-password" />
          <div className="admin-auth-trust"><span><LockKeyhole size={13} /> Link expires in 30 minutes</span></div>
        </div>
      </section>
      <section className="member-auth-art">
        <Image src="/images/vedic-hero.jpg" alt="Vedic astrology experience" fill priority sizes="(max-width: 800px) 100vw, 52vw" />
        <div className="member-auth-art__veil" />
      </section>
    </main>
  );
}
