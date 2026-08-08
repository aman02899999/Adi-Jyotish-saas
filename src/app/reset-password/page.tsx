import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

const SIGN_IN_HREF: Record<string, string> = {
  member: "/account",
  practitioner: "/practitioner/login",
  admin: "/admin/login",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ portal?: string; oobCode?: string }> }) {
  const { portal: rawPortal, oobCode } = await searchParams;
  const portal = rawPortal === "practitioner" || rawPortal === "admin" ? rawPortal : "member";
  const signInHref = SIGN_IN_HREF[portal];

  return (
    <main className="invite-page">
      <header><BrandMark /><Link href={signInHref}><ArrowLeft size={14} /> Back to sign in</Link></header>
      <section>
        <div className="admin-auth-seal"><ShieldCheck size={23} /></div>
        <p className="eyebrow"><span /> Account recovery</p>
        <h1>Set a new<br /><em>password.</em></h1>
        <ResetPasswordForm oobCode={oobCode ?? ""} signInHref={signInHref} />
      </section>
    </main>
  );
}
