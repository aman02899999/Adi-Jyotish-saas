"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck2,
  CalendarPlus,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Eye,
  Filter,
  Mail,
  MapPin,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

export type AdminBooking = {
  id: string;
  reference: string;
  serviceId: string | null;
  serviceTitle: string;
  servicePrice: number;
  serviceDuration: number;
  practitionerId: string | null;
  practitionerName: string | null;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  scheduledAt: string | Date;
  notes: string | null;
  status: string;
  paymentStatus: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const statuses = ["pending", "confirmed", "completed", "cancelled"];

function toDateTimeInput(value: string | Date) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function AdminBookings({ initialBookings }: { initialBookings: AdminBooking[] }) {
  const [items, setItems] = useState(initialBookings);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<AdminBooking | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => items.filter((item) => {
    const haystack = `${item.clientName} ${item.clientEmail} ${item.serviceTitle} ${item.reference}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (filter === "all" || item.status === filter);
  }), [filter, items, query]);

  const stats = useMemo(() => {
    const active = items.filter(({ status }) => status !== "cancelled");
    return {
      upcoming: active.filter(({ scheduledAt }) => new Date(scheduledAt) > new Date()).length,
      pending: items.filter(({ status }) => status === "pending").length,
      paid: items.filter(({ paymentStatus }) => paymentStatus === "paid").reduce((sum, item) => sum + item.servicePrice, 0),
      completion: items.length ? Math.round(items.filter(({ status }) => status === "completed").length / items.length * 100) : 0,
    };
  }, [items]);

  function showDetails(item: AdminBooking) {
    setSelected(item);
    setScheduledAt(toDateTimeInput(item.scheduledAt));
    setNotes(item.notes ?? "");
  }

  async function update(item: AdminBooking, change: Partial<AdminBooking>, message: string) {
    setSaving(true);
    try {
      const response = await fetch(`/api/bookings/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update booking.");
      setItems((current) => current.map((entry) => entry.id === item.id ? data : entry));
      setSelected((current) => current?.id === item.id ? data : current);
      setNotice(message);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update booking.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveDetails() {
    if (!selected) return;
    const ok = await update(selected, { scheduledAt: new Date(scheduledAt).toISOString(), notes }, "Appointment details updated.");
    if (ok) setSelected(null);
  }

  async function remove(item: AdminBooking) {
    if (!window.confirm(`Delete booking ${item.reference}? This cannot be undone.`)) return;
    const response = await fetch(`/api/bookings/${item.id}`, { method: "DELETE" });
    if (response.ok) {
      setItems((current) => current.filter(({ id }) => id !== item.id));
      setSelected(null);
      setNotice("Booking deleted.");
    } else setNotice("Could not delete booking.");
  }

  return (
    <>
      <section className="admin-stats booking-admin-stats" aria-label="Booking summary">
        <article><span><CalendarCheck2 size={20} /></span><div><small>Upcoming</small><strong>{stats.upcoming}</strong><p>Scheduled consultations</p></div></article>
        <article><span><Clock3 size={20} /></span><div><small>Awaiting confirmation</small><strong>{stats.pending}</strong><p><b>Needs attention</b></p></div></article>
        <article><span><CircleDollarSign size={20} /></span><div><small>Collected revenue</small><strong>₹{stats.paid.toLocaleString()}</strong><p>Paid bookings</p></div></article>
        <article><span><Check size={20} /></span><div><small>Completion rate</small><strong>{stats.completion}%</strong><p>All-time sessions</p></div></article>
      </section>

      <section className="admin-table-card">
        <div className="admin-table-header">
          <div><h2>Consultation calendar</h2><p>Review customer details and manage each appointment.</p></div>
          <Link href="/book" className="button button--small"><CalendarPlus size={16} /> New booking</Link>
        </div>
        <div className="admin-toolbar">
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, service or reference…" /></label>
          <div className="filter-select"><Filter size={15} /><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter bookings"><option value="all">All bookings</option>{statuses.map((status) => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}</select><ChevronDown size={14} /></div>
          <span>{filtered.length} results</span>
        </div>

        <div className="booking-table" role="table" aria-label="Consultation bookings">
          <div className="booking-table__head" role="row"><span>Customer</span><span>Reading</span><span>Appointment</span><span>Status</span><span>Payment</span><span>Actions</span></div>
          {filtered.map((item) => {
            const appointment = new Date(item.scheduledAt);
            return <div className="booking-table__row" role="row" key={item.id}>
              <div className="booking-customer"><span>{item.clientName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{item.clientName}</strong><small>{item.clientEmail}</small><i>{item.reference}</i></div></div>
              <div className="booking-reading"><strong>{item.serviceTitle}</strong><small>{item.practitionerName ?? "Unassigned"} · ${item.servicePrice}</small></div>
              <div className="booking-date"><strong>{appointment.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</strong><small>{appointment.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</small></div>
              <div className={`admin-status admin-status--${item.status}`}><select value={item.status} onChange={(event) => update(item, { status: event.target.value }, "Booking status updated.")}>{statuses.map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={12} /></div>
              <Link className={`payment-pill ${item.paymentStatus === "paid" ? "paid" : ""}`} href="/admin/billing" title="Manage in Billing">{item.paymentStatus}</Link>
              <div className="row-actions"><button onClick={() => showDetails(item)} aria-label={`View ${item.reference}`}><Eye size={16} /></button><button className="danger" onClick={() => remove(item)} aria-label={`Delete ${item.reference}`}><Trash2 size={16} /></button></div>
            </div>;
          })}
          {filtered.length === 0 && <div className="empty-state"><CalendarCheck2 size={25} /><h3>No bookings here yet</h3><p>New reservations will appear in this workspace.</p></div>}
        </div>
      </section>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <section className="admin-modal booking-detail-modal" role="dialog" aria-modal="true" aria-labelledby="booking-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p>{selected.reference}</p><h2 id="booking-detail-title">Booking details</h2></div><button onClick={() => setSelected(null)} aria-label="Close"><X size={20} /></button></div>
            <div className="booking-detail-hero"><span>{selected.clientName.charAt(0)}</span><div><h3>{selected.clientName}</h3><p>{selected.serviceTitle}</p></div><strong>₹{selected.servicePrice}</strong></div>
            <div className="booking-detail-grid">
              <div><Mail size={15} /><span><small>Email</small><strong>{selected.clientEmail}</strong></span></div>
              <div><UserRound size={15} /><span><small>Phone</small><strong>{selected.clientPhone || "Not provided"}</strong></span></div>
              <div><CalendarCheck2 size={15} /><span><small>Birth details</small><strong>{selected.birthDate} · {selected.birthTime}</strong></span></div>
              <div><MapPin size={15} /><span><small>Birth place</small><strong>{selected.birthPlace}</strong></span></div><div><UserRound size={15} /><span><small>Practitioner</small><strong>{selected.practitionerName ?? "Unassigned"}</strong></span></div>
            </div>
            <div className="booking-detail-form">
              <label><span>Appointment</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>
              <label><span>Notes and customer context</span><textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="No notes were supplied." /></label>
            </div>
            <div className="booking-detail-actions"><button className="delete-link" onClick={() => remove(selected)}><Trash2 size={14} /> Delete booking</button><div><button className="button button--ghost" onClick={() => setSelected(null)}>Close</button><button className="button" disabled={saving} onClick={saveDetails}>{saving ? "Saving…" : "Save changes"}</button></div></div>
          </section>
        </div>
      )}
    </>
  );
}
