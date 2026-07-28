import { MemberAppShell } from "@/components/member-app-shell";
import { MemberBilling } from "@/components/member-billing";
import { getMemberBilling } from "@/lib/billing";
import { getCurrentMember } from "@/lib/member-auth";
import { isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function MemberBillingPage({searchParams}:{searchParams:Promise<{checkout?:string}>}){const[member,query]=await Promise.all([getCurrentMember(),searchParams]);if(!member)return null;const rows=await getMemberBilling(member.id,member.email);return <MemberAppShell member={member} active="Billing"><MemberBilling invoices={rows} onlinePaymentsAvailable={isStripeConfigured()} checkoutState={query.checkout}/></MemberAppShell>;}
