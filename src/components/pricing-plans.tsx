"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, X } from "lucide-react";
import type { MembershipPlan } from "@/lib/plans";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";

type CurrentSubscription = { planId: string; status: string; billingInterval: "monthly" | "yearly" } | null;

export function PricingPlans({ plans, memberSignedIn, member, currentSubscription, razorpayConfigured }: {
  plans: MembershipPlan[];
  memberSignedIn: boolean;
  member: { name: string; email: string } | null;
  currentSubscription: CurrentSubscription;
  razorpayConfigured: boolean;
}) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const activePlanId = currentSubscription && ["active", "authenticated", "created", "pending"].includes(currentSubscription.status) ? currentSubscription.planId : null;

  async function subscribe(plan: MembershipPlan) {
    if (!memberSignedIn) { window.location.assign("/account?mode=register"); return; }
    setLoadingId(plan.id);
    setNotice("");
    try {
      const response = await fetch("/api/member/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, interval }),
      });
      const data = await response.json();
      if (!response.ok || !data.subscriptionId) throw new Error(data.error || "Subscription could not be started.");

      await openRazorpayCheckout({
        key: data.key,
        subscription_id: data.subscriptionId,
        name: "Jyotish Studio",
        description: `${plan.name} membership · ${interval}`,
        prefill: member ? { name: member.name, email: member.email } : undefined,
        theme: { color: "#a95838" },
        onSuccess: async (payment) => {
          const verify = await fetch("/api/member/subscription/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ razorpay_subscription_id: payment.razorpay_subscription_id, razorpay_payment_id: payment.razorpay_payment_id, razorpay_signature: payment.razorpay_signature }),
          });
          const verifyData = await verify.json();
          setNotice(verify.ok ? "Membership activated. Redirecting to Billing…" : (verifyData.error || "Payment could not be confirmed. Contact support if you were charged."));
          setLoadingId(null);
          if (verify.ok) setTimeout(() => window.location.assign("/dashboard/billing"), 1200);
        },
        onDismiss: () => setLoadingId(null),
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Subscription could not be started.");
      setLoadingId(null);
    }
  }

  return (
    <>
      <div className="pricing-toggle">
        <button className={interval === "monthly" ? "active" : ""} onClick={() => setInterval("monthly")}>Monthly</button>
        <button className={interval === "yearly" ? "active" : ""} onClick={() => setInterval("yearly")}>Yearly <small>save ~20%</small></button>
      </div>

      {!razorpayConfigured && <div className="finance-config-note pricing-config-note"><Sparkles size={18} /><div><strong>Memberships open soon</strong><span>Online billing is being configured. Check back shortly to subscribe.</span></div></div>}

      <div className="pricing-grid">
        <article className="pricing-card">
          <header><h3>Free</h3><p>Explore the studio and book individual readings</p></header>
          <div className="pricing-price"><strong>₹0</strong><span>/forever</span></div>
          <ul><li><Check size={14} /> Full practitioner marketplace</li><li><Check size={14} /> Daily horoscope preview</li><li><Check size={14} /> Pay-as-you-go consultations</li></ul>
          <Link href={memberSignedIn ? "/astrologers" : "/account?mode=register"} className="button button--ghost pricing-cta">{memberSignedIn ? "Browse practitioners" : "Create your chart"}</Link>
        </article>

        {plans.map((plan) => {
          const price = interval === "yearly" ? plan.priceYearly : plan.priceMonthly;
          const isCurrent = activePlanId === plan.id;
          const canSubscribe = razorpayConfigured && price != null && (interval === "yearly" ? plan.razorpayPlanIdYearly : plan.razorpayPlanIdMonthly);
          return (
            <article className={`pricing-card ${plan.highlighted ? "pricing-card--highlight" : ""}`} key={plan.id}>
              {plan.highlighted && <span className="pricing-badge">Most chosen</span>}
              <header><h3>{plan.name}</h3><p>{plan.tagline}</p></header>
              <div className="pricing-price"><strong>₹{price ?? plan.priceMonthly}</strong><span>/{interval === "yearly" ? "year" : "month"}</span></div>
              <ul>{plan.features.split("\n").filter(Boolean).map((feature) => <li key={feature}><Check size={14} /> {feature}</li>)}</ul>
              {isCurrent
                ? <Link href="/dashboard/billing" className="button pricing-cta">Manage in Billing</Link>
                : activePlanId
                  ? <Link href="/dashboard/billing" className="button button--ghost pricing-cta">Cancel current plan to switch</Link>
                  : <button className="button pricing-cta" disabled={loadingId === plan.id || !canSubscribe} onClick={() => subscribe(plan)}>{loadingId === plan.id ? "Opening…" : "Subscribe"}</button>}
            </article>
          );
        })}
      </div>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
    </>
  );
}
