import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const member = await getCurrentMember();
  if (!member) redirect("/account");
  if (!member.onboardingComplete) redirect("/onboarding");
  return children;
}
