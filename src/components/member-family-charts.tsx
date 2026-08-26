"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { CalendarDays, Check, Clock3, LoaderCircle, Plus, Trash2, UserRound, Users, X } from "lucide-react";
import { PlaceAutocomplete } from "@/components/place-autocomplete";

type ChartSnapshot = { ascendantRashi: string; moonRashi: string; moonNakshatra: string; sunRashi: string };
type FamilyMember = {
  id: string;
  name: string;
  relationship: string;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  chart: ChartSnapshot | null;
};

export function MemberFamilyCharts({ initialFamilyMembers }: { initialFamilyMembers: FamilyMember[] }) {
  const [familyMembers, setFamilyMembers] = useState(initialFamilyMembers);
  const [showForm, setShowForm] = useState(initialFamilyMembers.length === 0);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!name.trim() || !birthDate || !birthTime || !birthPlace.trim()) {
      setError("Please fill in their name, birth date, time, and place.");
      return;
    }
    if (familyMembers.length >= 12) {
      setError("You can link up to 12 family members.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/member/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, relationship, birthDate, birthTime, birthPlace }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this family member. Please try again.");
      setFamilyMembers((current) => [...current, data]);
      setName(""); setRelationship(""); setBirthDate(""); setBirthTime(""); setBirthPlace("");
      setShowForm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    setRemovingId(id);
    try {
      const response = await fetch(`/api/member/family/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove this family member.");
      setFamilyMembers((current) => current.filter((member) => member.id !== id));
    } catch {
      setError("Could not remove this family member. Please try again.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <>
      <div className="consultation-heading billing-heading">
        <div><p>Household</p><h1>Family charts</h1><span>Link family members&rsquo; birth details to see each of their real natal charts — no separate login needed. Booking a reading? Pick anyone here from step two of <Link href="/book">/book</Link> and your own membership discount still applies.</span></div>
        {!showForm && <button type="button" className="button button--small" onClick={() => setShowForm(true)}><Plus size={14} /> Add family member</button>}
      </div>

      {error && !showForm && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}

      {showForm && (
        <div className="ask-form-card family-form">
          <header><div><p>Real Kundli engine</p><h2>Add a family member</h2></div></header>
          <div className="booking-fields">
            <label><span>Name</span><div><UserRound size={16} /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" /></div></label>
            <label><span>Relationship <i>(optional)</i></span><div><Users size={16} /><input value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="e.g. Daughter, Father, Spouse" /></div></label>
            <label><span>Birth date</span><div><CalendarDays size={16} /><input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></div></label>
            <label><span>Birth time</span><div><Clock3 size={16} /><input type="time" value={birthTime} onChange={(event) => setBirthTime(event.target.value)} /></div></label>
            <label className="wide"><span>Birth place</span><PlaceAutocomplete value={birthPlace} onChange={setBirthPlace} /></label>
          </div>
          <div className="ask-answer__actions">
            <button type="button" className="button" disabled={loading} onClick={submit}>{loading ? <><LoaderCircle size={16} className="spin" /> Saving…</> : <>Save family member</>}</button>
            {familyMembers.length > 0 && <button type="button" className="button button--ghost" onClick={() => { setShowForm(false); setError(""); }}>Cancel</button>}
          </div>
          {error && <div className="toast"><Check size={15} />{error}<button onClick={() => setError("")}><X size={14} /></button></div>}
        </div>
      )}

      {familyMembers.length > 0 ? (
        <div className="family-grid">
          {familyMembers.map((member) => (
            <article key={member.id} className="glass-card family-card">
              <div className="card-heading">
                <div><p>{member.relationship || "Family member"}</p><h2>{member.name}</h2></div>
                <button type="button" aria-label={`Remove ${member.name}`} disabled={removingId === member.id} onClick={() => remove(member.id)}>{removingId === member.id ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}</button>
              </div>
              <p className="family-card__birth">{new Date(`${member.birthDate}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · {member.birthTime} · {member.birthPlace}</p>
              {member.chart ? (
                <div className="family-card__chart">
                  <div><small>Ascendant</small><strong>{member.chart.ascendantRashi}</strong></div>
                  <div><small>Moon</small><strong>{member.chart.moonRashi}</strong></div>
                  <div><small>Nakshatra</small><strong>{member.chart.moonNakshatra}</strong></div>
                  <div><small>Sun</small><strong>{member.chart.sunRashi}</strong></div>
                </div>
              ) : (
                <p className="family-card__error">Their chart couldn&rsquo;t be computed — the birth place may need to be more specific.</p>
              )}
            </article>
          ))}
        </div>
      ) : !showForm ? (
        <div className="consultation-empty"><Users size={26} /><h3>No family members linked yet</h3><p>Add a parent, spouse, or child&rsquo;s birth details to see their chart alongside yours.</p></div>
      ) : null}
    </>
  );
}
