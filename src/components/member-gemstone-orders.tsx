import Link from "next/link";
import { Gem } from "lucide-react";
import type { GemstoneOrder } from "@/db/schema";

export function MemberGemstoneOrders({ orders }: { orders: GemstoneOrder[] }) {
  return (
    <>
      <div className="consultation-heading billing-heading"><div><p>Buy Gemstones</p><h1>Your Orders</h1><span>Every gemstone order you&apos;ve placed, with live status.</span></div><Link href="/gemstones/shop" className="button button--small"><Gem size={14} /> Shop gemstones</Link></div>
      <section className="member-invoice-card">
        <header><div><p>History</p><h2>Order history</h2></div><span>{orders.length} total</span></header>
        <div className="member-invoice-list">
          {orders.map((order) => (
            <article key={order.id}>
              <div className="member-invoice-icon"><Gem size={16} /></div>
              <div className="member-invoice-name">
                <small>{new Date(order.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</small>
                <h3>{order.orderNumber}</h3>
                <p>{order.status} · {order.paymentStatus}</p>
              </div>
              <div className="member-invoice-amount">
                <strong>{order.currency} {order.total}</strong>
                <Link href={`/gemstones/order/${order.orderNumber}`} className="invoice-status invoice-status--paid">View</Link>
              </div>
            </article>
          ))}
          {!orders.length && <div className="consultation-empty"><Gem size={26} /><h3>No gemstone orders yet</h3><p>Explore certified gemstones curated for your chart.</p><Link href="/gemstones/shop" className="button button--small">Shop now</Link></div>}
        </div>
      </section>
    </>
  );
}
