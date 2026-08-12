import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

const SIGN_IN_HREF: Record<string, string> = {
  member: "/account",
  practitioner: "/practitioner/login",
  admin: "/admin/login",
};

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ portal?: string }> }) {
  const { portal: rawPortal } = await searchParams;
  const portal = rawPortal === "practitioner" || rawPortal === "admin" ? rawPortal : "member";

  return (
    <main className="invite-page">
      <header><BrandMark /><Link href={SIGN_IN_HREF[portal]}><ArrowLeft size={14} /> Back to sign in</Link></header>
      <section>
        <div className="admin-auth-seal"><KeyRound size={23} /></div>
        <p className="eyebrow"><span /> Account recovery</p>
        <h1>Reset your<br /><em>password.</em></h1>
        <p>Enter the email address on your account and we&rsquo;ll send a link to set a new password.</p>
        <ForgotPasswordForm portal={portal} />
      </section>
    </main>
  );
}
