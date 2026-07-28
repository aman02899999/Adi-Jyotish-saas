"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Crown,
  Edit3,
  Filter,
  KeyRound,
  Mail,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";

export type AdminMember = {
  id: number; name: string; email: string; phone: string | null; birthDate: string | null;
  birthTime: string | null; birthPlace: string | null; plan: string; onboardingComplete: boolean;
  active: boolean; lastLoginAt: Date | string | null; createdAt: Date | string; updatedAt: Date | string;
};

type MemberForm = {
  name: string; email: string; password: string; phone: string; birthDate: string;
  birthTime: string; birthPlace: string; plan: string; active: boolean;
};
const emptyForm: MemberForm = { name:"", email:"", password:"", phone:"", birthDate:"", birthTime:"", birthPlace:"", plan:"member", active:true };

export function AdminMembers({ initialMembers }: { initialMembers: AdminMember[] }) {
  const [items, setItems] = useState(initialMembers);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<AdminMember | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => items.filter((item) => {
    const matches = `${item.name} ${item.email} ${item.birthPlace ?? ""}`.toLowerCase().includes(query.toLowerCase());
    return matches && (filter === "all" || (filter === "active" ? item.active : filter === "inactive" ? !item.active : item.plan === filter));
  }), [items, query, filter]);
  const stats = useMemo(() => ({ active:items.filter(x=>x.active).length, complete:items.filter(x=>x.onboardingComplete).length, premium:items.filter(x=>x.plan!=="member").length }), [items]);

  function createMember() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function editMember(member: AdminMember) {
    setEditing(member); setForm({ name:member.name,email:member.email,password:"",phone:member.phone??"",birthDate:member.birthDate??"",birthTime:member.birthTime??"",birthPlace:member.birthPlace??"",plan:member.plan,active:member.active }); setOpen(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice("");
    try {
      const response = await fetch(editing ? `/api/members/${editing.id}` : "/api/members", { method:editing?"PUT":"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Member could not be saved.");
      setItems(current => editing ? current.map(item=>item.id===editing.id?data:item) : [data,...current]); setOpen(false); setNotice(editing?"Member profile updated.":"Member account created.");
    } catch (error) { setNotice(error instanceof Error?error.message:"Something went wrong."); } finally { setSaving(false); }
  }
  async function toggle(member: AdminMember) {
    const response = await fetch(`/api/members/${member.id}`, { method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...member,active:!member.active}) });
    const data = await response.json(); if(response.ok){setItems(current=>current.map(item=>item.id===member.id?data:item));setNotice(data.active?"Member access restored.":"Member deactivated and sessions revoked.");} else setNotice(data.error||"Status could not be updated.");
  }
  async function remove(member: AdminMember) {
    if(!window.confirm(`Delete ${member.name}'s account? Consultation history will be preserved.`)) return;
    const response=await fetch(`/api/members/${member.id}`,{method:"DELETE"}); if(response.ok){setItems(current=>current.filter(item=>item.id!==member.id));setNotice("Member account deleted.");}else setNotice("Member could not be deleted.");
  }

  return <>
    <section className="admin-stats member-admin-stats">
      <article><span><Users size={20}/></span><div><small>Total members</small><strong>{items.length}</strong><p>Customer accounts</p></div></article>
      <article><span><UserCheck size={20}/></span><div><small>Active access</small><strong>{stats.active}</strong><p>{items.length-stats.active} deactivated</p></div></article>
      <article><span><ShieldCheck size={20}/></span><div><small>Charts completed</small><strong>{stats.complete}</strong><p>{items.length?Math.round(stats.complete/items.length*100):0}% onboarding rate</p></div></article>
      <article><span><Crown size={20}/></span><div><small>Premium members</small><strong>{stats.premium}</strong><p>Premium or concierge</p></div></article>
    </section>
    <section className="admin-table-card">
      <div className="admin-table-header"><div><h2>Member directory</h2><p>Manage customer access, plans, and birth profiles.</p></div><button className="button button--small" onClick={createMember}><Plus size={16}/> Add member</button></div>
      <div className="admin-toolbar"><label><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, email or location…"/></label><div className="filter-select"><Filter size={15}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All members</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="member">Member plan</option><option value="premium">Premium</option><option value="concierge">Concierge</option></select><ChevronDown size={14}/></div><span>{filtered.length} results</span></div>
      <div className="member-table">
        <div className="member-table__head"><span>Member</span><span>Birth profile</span><span>Plan</span><span>Last active</span><span>Status</span><span>Actions</span></div>
        {filtered.map(member=><div className="member-table__row" key={member.id}>
          <div className="crm-member"><span>{member.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</span><div><strong>{member.name}</strong><small>{member.email}</small><i>Joined {new Date(member.createdAt).toLocaleDateString("en",{month:"short",year:"numeric"})}</i></div></div>
          <div className="crm-birth"><span className={member.onboardingComplete?"complete":""}>{member.onboardingComplete?<Check size={11}/>:null}{member.onboardingComplete?"Complete":"Incomplete"}</span><small>{member.birthPlace||"No birth place"}</small></div>
          <span className={`plan-pill plan-pill--${member.plan}`}>{member.plan}</span>
          <span className="crm-last-active">{member.lastLoginAt?new Date(member.lastLoginAt).toLocaleDateString("en",{month:"short",day:"numeric"}):"Never"}</span>
          <button className={`status-toggle ${member.active?"is-active":""}`} onClick={()=>toggle(member)}><i>{member.active?<Check size={10}/>:null}</i>{member.active?"Active":"Inactive"}</button>
          <div className="row-actions"><button onClick={()=>editMember(member)} aria-label={`Edit ${member.name}`}><Edit3 size={16}/></button><button className="danger" onClick={()=>remove(member)} aria-label={`Delete ${member.name}`}><Trash2 size={16}/></button></div>
        </div>)}
        {!filtered.length&&<div className="empty-state"><Users size={25}/><h3>No members found</h3><p>Try a different search or filter.</p></div>}
      </div>
    </section>
    {notice&&<div className="toast" role="status"><Check size={16}/>{notice}<button onClick={()=>setNotice("")}><X size={14}/></button></div>}
    {open&&<div className="modal-backdrop" onMouseDown={()=>setOpen(false)}><section className="admin-modal member-modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}>
      <div className="modal-header"><div><p>{editing?"Customer relationship":"New customer account"}</p><h2>{editing?"Edit member":"Add member"}</h2></div><button onClick={()=>setOpen(false)}><X size={20}/></button></div>
      <form onSubmit={save}>
        <label className="field"><span>Full name</span><input required minLength={2} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Member name"/></label>
        <label className="field"><span>Email address</span><div className="input-prefix icon-prefix"><Mail size={14}/><input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="member@example.com"/></div></label>
        <label className="field"><span>{editing?"New password (optional)":"Temporary password"}</span><div className="input-prefix icon-prefix"><KeyRound size={14}/><input required={!editing} minLength={editing?undefined:10} type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder={editing?"Leave unchanged":"At least 10 characters"}/></div></label>
        <label className="field"><span>Phone</span><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="Optional"/></label>
        <label className="field"><span>Plan</span><select value={form.plan} onChange={e=>setForm({...form,plan:e.target.value})}><option value="member">Member</option><option value="premium">Premium</option><option value="concierge">Concierge</option></select></label>
        <label className="field"><span>Birth date</span><input type="date" value={form.birthDate} onChange={e=>setForm({...form,birthDate:e.target.value})}/></label>
        <label className="field"><span>Birth time</span><input type="time" value={form.birthTime} onChange={e=>setForm({...form,birthTime:e.target.value})}/></label>
        <label className="field"><span>Birth place</span><div className="input-prefix icon-prefix"><MapPin size={14}/><input value={form.birthPlace} onChange={e=>setForm({...form,birthPlace:e.target.value})} placeholder="City, country"/></div></label>
        <div className="form-options field--full"><label><button type="button" className={`switch ${form.active?"on":""}`} onClick={()=>setForm({...form,active:!form.active})}><i/></button><span><strong>Account access</strong><small>{form.active?"Member can sign in":"All sessions will be revoked"}</small></span></label></div>
        <div className="modal-actions field--full"><button type="button" className="button button--ghost" onClick={()=>setOpen(false)}>Cancel</button><button className="button" disabled={saving}>{saving?"Saving…":editing?"Save member":"Create member"}</button></div>
      </form>
    </section></div>}
  </>;
}
