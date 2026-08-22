import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [member, locale] = await Promise.all([getCurrentMember(), getLocale()]);
  if (!member) redirect({ href: "/account", locale });
  if (!member.onboardingComplete) redirect({ href: "/onboarding", locale });
  return children;
}
