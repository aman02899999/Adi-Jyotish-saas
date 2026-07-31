"use client";

import { useMemo, useState } from "react";
import { Check, Eye, Package, Search, X } from "lucide-react";
import type { GemstoneOrder, GemstoneOrderItem } from "@/lib/gemstone-orders";

const STATUS_OPTIONS = ["pending", "processing", "packed", "shipped", "delivered", "cancelled", "refunded"];

export function AdminGemstoneOrders({ initialOrders }: { initialOrders: GemstoneOrder[] }) {
  const [items, setItems] = useState(initialOrders);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [viewing, setViewing] = useState<GemstoneOrder | null>(null);
  const [viewItems, setViewItems] = useState<GemstoneOrderItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => items.filter((order) =>
    `${order.orderNumber} ${order.shippingName} ${order.guestEmail ?? ""}`.toLowerCase().includes(query.toLowerCase())
    && (filter === "all" || order.status === filter)
  ), [items, query, filter]);

  async function openOrder(order: GemstoneOrder) {
    setViewing(order);
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/admin/gemstones/orders/${order.id}`);
      const data = await response.json();
      if (response.ok) setViewItems(data.items);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function changeStatus(status: string) {
    if (!viewing) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/gemstones/orders/${viewing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update order.");
      setItems((current) => current.map((order) => order.id === viewing.id ? data : order));
      setViewing(data);
      setNotice(`Order marked ${status}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="admin-table-card">
        <div className="admin-table-header"><div><h2>Gemstone orders</h2><p>Track, process, and ship customer orders.</p></div></div>
        <div className="admin-toolbar">
          <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order number, name, email…" /></label>
          <div className="filter-select"><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
          <span>{filtered.length} orders</span>
        </div>
        <div className="service-table" role="table" aria-label="Gemstone orders">
          <div className="service-table__head" role="row"><span>Order</span><span>Customer</span><span>Total</span><span>Payment</span><span>Status</span><span>Actions</span></div>
          {filtered.map((order) => (
            <div className="service-table__row" role="row" key={order.id}>
              <div className="table-service"><span className="table-service__icon"><Package size={17} /></span><div><strong>{order.orderNumber}</strong><small>{new Date(order.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</small></div></div>
              <span>{order.shippingName}</span>
              <strong>{order.currency} {order.total}</strong>
              <span className={`invoice-status invoice-status--${order.paymentStatus === "paid" ? "paid" : "void"}`}>{order.paymentStatus}</span>
              <span className={`invoice-status invoice-status--${order.status === "delivered" ? "paid" : order.status === "cancelled" ? "void" : "refund_pending"}`}>{order.status}</span>
              <div className="row-actions"><button onClick={() => openOrder(order)} aria-label={`View ${order.orderNumber}`}><Eye size={16} /></button></div>
            </div>
          ))}
          {!filtered.length && <div className="empty-state"><Package size={24} /><h3>No orders found</h3><p>Try a different filter or search.</p></div>}
        </div>
      </section>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {viewing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setViewing(null)}>
          <section className="admin-modal gem-order-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p>Order detail</p><h2>{viewing.orderNumber}</h2></div><button onClick={() => setViewing(null)} aria-label="Close"><X size={20} /></button></div>
            <div className="gem-order-detail">
              {loadingDetail ? <p>Loading…</p> : (
                <>
                  <div className="gem-order-detail__section">
                    <h3>Items</h3>
                    {viewItems.map((item) => <div className="gem-order-line" key={item.id}><span>{item.productName} — {item.variantLabel} × {item.quantity}</span><strong>{viewing.currency} {item.lineTotal}</strong></div>)}
                  </div>
                  <div className="gem-order-detail__section">
                    <h3>Shipping address</h3>
                    <p>{viewing.shippingName} · {viewing.shippingPhone}<br />{viewing.shippingLine1}{viewing.shippingLine2 ? `, ${viewing.shippingLine2}` : ""}<br />{viewing.shippingCity}, {viewing.shippingState} {viewing.shippingPincode}<br />{viewing.shippingCountry}</p>
                  </div>
                  <div className="gem-order-detail__section">
                    <h3>Summary</h3>
                    <div className="gem-order-line"><span>Subtotal</span><strong>{viewing.currency} {viewing.subtotal}</strong></div>
                    {viewing.discount > 0 && <div className="gem-order-line"><span>Discount {viewing.couponCode ? `(${viewing.couponCode})` : ""}</span><strong>-{viewing.currency} {viewing.discount}</strong></div>}
                    <div className="gem-order-line"><span>Shipping</span><strong>{viewing.shippingFee ? `${viewing.currency} ${viewing.shippingFee}` : "Free"}</strong></div>
                    <div className="gem-order-line gem-order-line--total"><span>Total</span><strong>{viewing.currency} {viewing.total}</strong></div>
                  </div>
                  <div className="gem-order-detail__section">
                    <h3>Update status</h3>
                    <div className="gem-status-buttons">
                      {STATUS_OPTIONS.map((status) => <button key={status} className={status === viewing.status ? "active" : ""} disabled={saving} onClick={() => changeStatus(status)}>{status}</button>)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
