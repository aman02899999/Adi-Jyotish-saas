import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, PackageSearch } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getOrderByNumberScoped, getOrderItems } from "@/lib/gemstone-orders";
import { getCurrentMember } from "@/lib/member-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order Confirmation · Buy Gemstones" };

export default async function GemstoneOrderConfirmationPage({ params, searchParams }: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const [{ orderNumber }, { email }, member] = await Promise.all([params, searchParams, getCurrentMember()]);
  const order = await getOrderByNumberScoped(orderNumber, { memberId: member?.id, guestEmail: email });

  if (!order) {
    return (
      <main className="marketing-page gem-store">
        <SiteHeader />
        <section className="shell" style={{ paddingBlock: 90 }}>
          <div className="empty-state" style={{ minHeight: 320 }}>
            <PackageSearch size={30} />
            <h3>We couldn&apos;t find that order</h3>
            <p>Check the link from your confirmation email, or sign in if you checked out with an account.</p>
            <Link href="/gemstones/shop" className="button button--small">Continue shopping</Link>
          </div>
        </section>
      </main>
    );
  }

  const items = await getOrderItems(order.id);

  return (
    <main className="marketing-page gem-store">
      <SiteHeader />
      <section className="shell" style={{ paddingBlock: "70px 40px" }}>
        <div className="order-confirmation">
          <div className="order-confirmation__badge"><CheckCircle2 size={30} /></div>
          <p className="eyebrow"><span /> Order confirmed</p>
          <h1>Thank you,<br /><em>{order.shippingName.split(" ")[0]}.</em></h1>
          <p className="order-confirmation__number">Order {order.orderNumber} · {order.paymentStatus === "paid" ? "Payment confirmed" : "Payment pending"}</p>

          <div className="order-confirmation__items">
            {items.map((item) => <div className="gem-order-line" key={item.id}><span>{item.productName} — {item.variantLabel} × {item.quantity}</span><strong>{order.currency} {item.lineTotal}</strong></div>)}
            <div className="gem-order-line"><span>Subtotal</span><strong>{order.currency} {order.subtotal}</strong></div>
            {order.discount > 0 && <div className="gem-order-line"><span>Discount</span><strong>-{order.currency} {order.discount}</strong></div>}
            <div className="gem-order-line"><span>Shipping</span><strong>{order.shippingFee ? `${order.currency} ${order.shippingFee}` : "Free"}</strong></div>
            <div className="gem-order-line gem-order-line--total"><span>Total</span><strong>{order.currency} {order.total}</strong></div>
          </div>

          <div className="order-confirmation__address">
            <h3>Shipping to</h3>
            <p>{order.shippingName} · {order.shippingPhone}<br />{order.shippingLine1}{order.shippingLine2 ? `, ${order.shippingLine2}` : ""}<br />{order.shippingCity}, {order.shippingState} {order.shippingPincode}<br />{order.shippingCountry}</p>
          </div>

          <div className="order-confirmation__actions">
            {member ? <Link href="/dashboard/gemstone-orders" className="button">View order in dashboard <ArrowRight size={16} /></Link> : <Link href="/account" className="button">Create an account to track orders <ArrowRight size={16} /></Link>}
            <Link href="/gemstones/shop" className="button button--ghost">Continue shopping</Link>
          </div>
        </div>
      </section>
    <SiteFooter />
    </main>
  );
}
