import { useState, type ReactNode } from 'react';
import { Search, Check, Mail, Home, ArrowRight, Phone } from 'lucide-react';
import { useStore, useLookups, money, staff, type Lookups, type Route } from '../store';
import { INSP_KINDS, PLAN, nowStamp, type InspKind, type InspScope, type Job, type JobEvent, type Line, type Plan, type Property } from '../data';
import { ME, ME_NAME, SUPERVISOR } from '../data';
import { Btn, Chip, Field, Modal, Note, Select, Text, Area, Avatar, PhotoPicker, dateLabel } from '../ui';

type S = ReturnType<typeof useStore>;

export const adminName = (id?: string) => staff(id)?.name ?? '—';
export const firstName = (n?: string) => (n ?? '').split(' ')[0];

/* ---------- jobs ---------- */
export const DONE_JOB = ['Approved', 'Invoiced', 'Declined'];
export const jobTone = (st: Job['status']) => ({ New: 'info', 'Quote sent': 'brand', 'Quote accepted': 'brand', 'Waiting approval': 'warn', 'Ready to assign': 'info', Assigned: 'info', 'In progress': 'brand', 'Proof uploaded': 'warn', 'Sent back': 'err', Approved: 'ok', Invoiced: 'ok', Declined: 'neutral' } as const)[st];
export const MANAGED_STEPS = ['Reported', 'Priced and approved', 'Contractor assigned', 'Work in progress', 'Photo proof', 'Work approved', 'Invoiced'];
export const CLIENT_STEPS = ['Requested', 'Quote sent', 'Quote accepted', 'Contractor assigned', 'Work in progress', 'Photo proof', 'Work approved', 'Invoiced'];
export function jobStepAt(j: Job) {
  if (j.managed) return ({ New: 1, 'Waiting approval': 1, 'Ready to assign': 2, Assigned: 3, 'In progress': 4, 'Sent back': 4, 'Proof uploaded': 5, Approved: 6, Invoiced: 7, Declined: 1, 'Quote sent': 1, 'Quote accepted': 2 } as Record<string, number>)[j.status];
  return ({ New: 1, 'Quote sent': 2, 'Quote accepted': 3, 'Ready to assign': 3, Assigned: 4, 'In progress': 5, 'Sent back': 5, 'Proof uploaded': 6, Approved: 7, Invoiced: 8, Declined: 2, 'Waiting approval': 1 } as Record<string, number>)[j.status];
}
export const jobProgress = (j: Job) => Math.round(jobStepAt(j) / (j.managed ? 7 : 8) * 100);
export function nextJobAction(j: Job): string {
  return ({ New: j.managed ? 'Price the job' : 'Send a quote', 'Quote sent': 'Waiting for the client', 'Quote accepted': 'Assign the contractor', 'Waiting approval': 'Approve or decline', 'Ready to assign': 'Assign a contractor', Assigned: 'Contractor to start', 'In progress': 'Waiting for photo proof', 'Proof uploaded': 'Check the photos', 'Sent back': 'Contractor fixing it', Approved: 'Send the invoice', Invoiced: 'Done', Declined: 'Not going ahead' } as Record<string, string>)[j.status];
}
export function jobEvent(s: S, id: string, text: string, patch: Partial<Job> = {}, by = ME_NAME) {
  const e: JobEvent = { at: nowStamp(), by, text };
  s.setJobs(js => js.map(x => x.id === id ? { ...x, ...patch, events: [...x.events, e] } : x));
}

/** Approve a job: the cost comes off that property's repair budget once, even if clicked twice. Alerts go out at 70%, 90% and 100%. */
export function approveJob(s: S, j: Job, L: Lookups) {
  if (j.status !== 'Waiting approval') { s.toast('Already decided. Nothing was taken twice.'); return; }
  const p = L.prop(j.property);
  let alert = '';
  if (p?.managed && p.budget) {
    const before = p.used / p.budget * 100, after = (p.used + j.price) / p.budget * 100;
    const hit = [100, 90, 70].find(t => before < t && after >= t);
    if (hit) {
      alert = ` ${L.landlord(p.owner)?.name} got the ${hit}% budget alert.`;
      s.setLandlords(ls => ls.map(l => l.id === p.owner ? { ...l, comms: [...l.comms, { id: 'cm' + Date.now(), at: nowStamp(), by: 'System', channel: 'Email', dir: 'out', subject: `Repair budget ${hit}% used · ${p.address}`, text: `The yearly repair budget for ${p.address} is now ${Math.round(after)}% used (${money(p.used + j.price)} of ${money(p.budget)}).` }] } : l));
    }
    s.setProperties(ps => ps.map(x => x.id === p.id ? { ...x, used: x.used + j.price } : x));
  }
  jobEvent(s, j.id, `Approved by Supervisor. ${money(j.price)} taken from the repair budget.`, { status: j.contractor ? 'Assigned' : 'Ready to assign' }, SUPERVISOR);
  s.log(`${SUPERVISOR} approved ${j.title} at ${p?.address} (${money(j.price)})`, 'Sent to Supervisor');
  s.toast(`${SUPERVISOR} approved ${j.title}. ${money(j.price)} taken from the budget once.${alert}`);
}

/** Rows on a quote or invoice. A job without its own rows gets one labour row for its price. */
export const jobLines = (j: Job): Line[] => j.lines?.length ? j.lines : [{ activity: 'Labour', desc: j.title, qty: 1, rate: j.price }];
export const lineSum = (ls: Line[]) => Math.round(ls.reduce((a, l) => a + (l.qty || 0) * (l.rate || 0), 0) * 100) / 100;
export const nextInvoiceNo = (s: S) => 'INV-' + (1045 + s.invoices.length);

/** Work approved → send invoice to the landlord or client. */
export function sendJobInvoice(s: S, j: Job, L: Lookups) {
  const p = L.prop(j.property);
  const id = nextInvoiceNo(s);
  const toName = L.ownerName(p); const lines = jobLines(j); const total = lineSum(lines);
  s.setInvoices(is => [{ id, to: p?.owner ?? '', toKind: p?.managed ? 'Landlord' : 'Client', job: j.id, amount: total, paid: 0, terms: p?.managed ? 'Straight away' : (L.client(p?.owner)?.terms ?? '30 days'), issued: '15 Oct 2026', due: p?.managed ? '15 Oct 2026' : '14 Nov 2026', overdue: false, site: p?.address, items: lines.map(l => ({ activity: l.activity, desc: l.desc, qty: l.qty, rate: l.rate, amount: Math.round(l.qty * l.rate * 100) / 100 })) }, ...is]);
  jobEvent(s, j.id, `Invoice ${id} sent to ${toName}`, { status: 'Invoiced', invoice: id });
  s.log(`Sent invoice ${id} (${money(total)}) to ${toName} for ${j.title}`, 'Rent & Invoices');
  s.toast(`Invoice ${id} sent to ${toName}`);
  return id;
}

export function lockJob(s: S, j: Job, L: Lookups) {
  const p = L.prop(j.property);
  s.setLocked(ls => [{ id: 'LR' + Date.now(), kind: 'Finished job', title: `${j.title} · ${p?.address}`, locked: nowStamp(), by: ME_NAME, versions: [] }, ...ls]);
  jobEvent(s, j.id, 'Work approved. Record locked.', { status: 'Approved' });
  s.log(`Approved finished work: ${j.title} at ${p?.address}. Record locked.`, 'Jobs');
  s.toast('Work approved and record locked. Now send the invoice.');
}

/* ---------- modals ---------- */
export function NewLandlordModal({ onClose, prefill, onCreated, from, skipProperty, checkFirst }: { onClose: () => void; prefill?: { name: string; email: string; phone: string; billing?: string; plan?: Plan; admin?: string }; onCreated?: (id: string) => void; from?: string; skipProperty?: boolean; checkFirst?: boolean }) {
  const s = useStore(); const L = useLookups();
  const [step, setStep] = useState(prefill && !from && !checkFirst ? 1 : 0);
  const [q, setQ] = useState(prefill?.name ?? '');
  const [f, setF] = useState({ name: prefill?.name ?? '', email: prefill?.email ?? '', phone: prefill?.phone ?? '', billing: prefill?.billing ?? '', admin: prefill?.admin ?? 'et' });
  const [plan, setPlan] = useState<Plan>(prefill?.plan ?? 16);
  const [start, setStart] = useState('2026-11-01');
  const [prop, setProp] = useState({ address: '', area: '', type: 'House' as Property['type'], beds: '3', rooms: '5', rent: '', budget: '1200', photo: '' });
  const matches = q.trim().length > 1 ? s.landlords.filter(l => (l.name + l.email).toLowerCase().includes(q.toLowerCase())) : [];
  const steps = ['Check they are new', 'Landlord details', 'Choose the plan', 'First property', 'Send login email'];
  const create = () => {
    const id = 'L' + (s.landlords.length + 1) + (Date.now() % 100);
    s.setLandlords(ls => [{ id, ...f, plan, start: dateLabel(start), status: 'Invite sent', bank: '—', comms: [{ id: 'cm' + Date.now(), at: nowStamp(), by: 'Sarah Khan', channel: 'Email', dir: 'out', subject: 'Your Genesis landlord login', text: 'Login email sent from Outlook.' }] }, ...ls]);
    if (prop.address) s.setProperties(ps => [{ id: 'P' + (Date.now() % 10000), address: prop.address, area: prop.area || '—', type: prop.type, beds: +prop.beds, rooms: prop.type === 'HMO' ? +prop.rooms : undefined, baths: 1, managed: true, owner: id, rent: +prop.rent || 0, status: 'Vacant', admin: f.admin, photo: prop.photo || 'images/home1.jpg', budget: +prop.budget || 0, used: 0, gas: true, added: '15 Oct 2026' }, ...ps]);
    s.log(`Created landlord ${f.name} on the ${plan}% plan${prop.address ? ` with ${prop.address}` : ''} and sent the login email`, 'Landlords');
    s.toast(`Login email sent to ${f.email}`);
    onClose();
    if (onCreated) onCreated(id); else s.go('landlords', id);
  };
  const ok1 = f.name && /@/.test(f.email) && f.phone && f.billing;
  const ok3 = !prop.address || (prop.area && prop.rent);
  return <Modal wide title="New landlord" sub={from ? `${from} sent these details. Check for duplicates, confirm the plan and the Office Admin, then send the login email.` : 'Only the Supervisor creates landlord accounts. Landlords do not need ID checks.'} onClose={onClose}
    footer={<>{step > 0 && <Btn kind="outline" onClick={() => setStep(step - 1)}>Back</Btn>}
      {step === 3 && !prop.address && <Btn kind="ghost" onClick={() => setStep(4)}>Skip for now</Btn>}
      {step < 4 && <Btn disabled={(step === 1 && !ok1) || (step === 3 && (!prop.address || !ok3))} onClick={() => setStep(step + 1)}>{step === 0 ? 'They are new, continue' : 'Continue'}</Btn>}
      {step === 4 && <Btn icon={<Mail size={16} />} onClick={create}>Create and send login email</Btn>}</>}>
    <div className="flex wrap" style={{ gap: 6 }}>{steps.map((t, i) => <span key={t} className={`chip ${i < step ? 'ok' : i === step ? 'brand' : 'neutral'}`}>{i + 1}. {t}</span>)}</div>
    {step === 0 && <><Field label="Search by name or email first, so there are no double records"><label className="minisearch" style={{ width: '100%', height: 42 }}><Search size={16} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Okafor or m.okafor@mail.co.uk" /></label></Field>
      {matches.length > 0 ? <><Note tone="warn">This landlord may already exist. Open their record instead of creating a new one.</Note>{matches.map(m => <button key={m.id} className="lrow click" onClick={() => { onClose(); s.go('landlords', m.id); }}><Avatar name={m.name} /><div className="stack grow"><b>{m.name}</b><span className="caption">{m.email} · {m.plan}% plan</span></div><Chip tone="brand">Open</Chip></button>)}</>
        : q.length > 1 ? <Note tone="ok">No match found. You can create this landlord.</Note> : <Note>Type at least two letters.</Note>}</>}
    {step === 1 && <div className="grid g2">
      <Field label="Full name"><Text value={f.name} onChange={v => setF({ ...f, name: v })} placeholder="Paul Bennett" /></Field>
      <Field label="Email (used for login)"><Text value={f.email} onChange={v => setF({ ...f, email: v })} placeholder="paul@mail.co.uk" /></Field>
      <Field label="Phone"><Text value={f.phone} onChange={v => setF({ ...f, phone: v })} placeholder="07700 900000" /></Field>
      <Field label="Office Admin in charge"><Select value={f.admin} onChange={v => setF({ ...f, admin: v })} options={L.admins.map(a => ({ value: a.id, label: a.name }))} /></Field>
      <div style={{ gridColumn: '1/-1' }}><Field label="Billing address"><Text value={f.billing} onChange={v => setF({ ...f, billing: v })} placeholder="House, street, town, postcode" /></Field></div>
    </div>}
    {step === 2 && <><div className="grid g4">{([10, 12, 16, 20] as Plan[]).map(p => <button key={p} className={`choice${plan === p ? ' on' : ''}`} onClick={() => setPlan(p)}><b style={{ fontSize: 20 }}>{p}%</b><span className="small">{p === 10 ? 'Management Only' : `Job limit ${money(PLAN[p].limit)}`}</span><span className="caption">{p === 10 ? 'No repairs included. Every repair needs the landlord’s OK.' : 'Repairs above this come to you to approve.'}</span></button>)}</div>
      <Field label="Agreement start date"><input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} /></Field></>}
    {step === 3 && skipProperty && <Note>The property is added when the takeover is confirmed in Planned Switch, so it isn't counted as managed before then. Click "Skip for now".</Note>}
    {step === 3 && !skipProperty && <div className="row" style={{ gap: 16, alignItems: 'stretch' }}>
      <div style={{ width: 240, flex: 'none' }}><PhotoPicker value={prop.photo} onChange={v => setProp({ ...prop, photo: v })} /></div>
      <div className="grid g2 grow" style={{ gap: 12 }}>
        <Field label="Address"><Text value={prop.address} onChange={v => setProp({ ...prop, address: v })} placeholder="12 Oak Street" /></Field>
        <Field label="Town and postcode"><Text value={prop.area} onChange={v => setProp({ ...prop, area: v })} placeholder="London N1" /></Field>
        <Field label="Type"><Select value={prop.type} onChange={v => setProp({ ...prop, type: v as Property['type'] })} options={['House', 'Flat', 'HMO'].map(x => ({ value: x, label: x === 'HMO' ? 'Shared house (HMO)' : x }))} /></Field>
        {prop.type === 'HMO' ? <Field label="Rooms to let"><Text value={prop.rooms} onChange={v => setProp({ ...prop, rooms: v })} /></Field> : <Field label="Bedrooms"><Text value={prop.beds} onChange={v => setProp({ ...prop, beds: v })} /></Field>}
        <Field label="Monthly rent (£)"><Text value={prop.rent} onChange={v => setProp({ ...prop, rent: v })} placeholder="1150" /></Field>
        <Field label="Yearly repair budget (£)"><Text value={prop.budget} onChange={v => setProp({ ...prop, budget: v })} /></Field>
      </div>
    </div>}
    {step === 4 && <><Note tone="ok">Ready. The login email goes from LSP's Outlook. {firstName(f.name) || 'The landlord'} sets their own password and sees only their own homes.</Note>
      {prop.address && <div className="lrow"><div className="photo" style={{ width: 64, height: 48, backgroundImage: `url(${prop.photo || 'images/home1.jpg'})` }} /><div className="stack grow"><b>{prop.address}</b><span className="caption">{prop.area} · {money(+prop.rent || 0)} pcm · budget {money(+prop.budget || 0)}</span></div><Chip tone="ok">Added with the landlord</Chip></div>}
      <div className="card flat" style={{ background: 'var(--bg-subtle)' }}><b>To: {f.email}</b><span className="small">Subject: Your Genesis landlord login</span><p style={{ margin: 0, lineHeight: 1.6 }}>Hello {firstName(f.name)},<br />Your Landlord Service Plans account is ready on the {plan}% plan from {dateLabel(start)}. Use the secure link below to set your password. The link expires in 48 hours.</p><span className="btn primary sm" style={{ alignSelf: 'flex-start' }}>Set my password</span></div></>}
  </Modal>;
}

export function AddPropertyModal({ owner, managed, onClose }: { owner: string; managed: boolean; onClose: () => void }) {
  const s = useStore(); const L = useLookups();
  const [f, setF] = useState({ address: '', area: '', type: 'House' as Property['type'], beds: '3', rooms: '5', rent: '', admin: ME, budget: '1200', photo: '' });
  const ok = f.address && f.area && (!managed || f.rent);
  return <Modal wide title={managed ? `Add a property for ${L.landlord(owner)?.name ?? 'the landlord'}` : `Add a home for ${L.client(owner)?.name ?? 'the client'}`} sub={managed ? 'Saved as Managed. Each property has its own yearly repair budget. Shared houses (HMO) list each room.' : 'Unmanaged: contractor services only. No tenants, rent or safety plan.'} onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Home size={16} />} disabled={!ok} onClick={() => {
      const id = 'P' + Date.now() % 10000;
      s.setProperties(ps => [{ id, address: f.address, area: f.area, type: f.type, beds: +f.beds, rooms: f.type === 'HMO' ? +f.rooms : undefined, baths: 1, managed, owner, rent: managed ? +f.rent || 0 : 0, status: managed ? 'Vacant' : 'Let', admin: f.admin, photo: f.photo || 'images/home1.jpg', budget: managed ? +f.budget || 0 : 0, used: 0, gas: true, added: '15 Oct 2026' }, ...ps]);
      s.log(`Added ${managed ? 'managed' : 'unmanaged'} property ${f.address}`, 'Properties'); s.toast('Property added'); onClose(); s.go('properties', id);
    }}>Add property</Btn></>}>
    <div className="row" style={{ gap: 16, alignItems: 'stretch' }}>
      <div style={{ width: 240, flex: 'none' }}><PhotoPicker value={f.photo} onChange={v => setF({ ...f, photo: v })} /></div>
      <div className="grid g2 grow" style={{ gap: 12 }}>
        <Field label="Address"><Text value={f.address} onChange={v => setF({ ...f, address: v })} placeholder="12 Oak Street" /></Field>
        <Field label="Town and postcode"><Text value={f.area} onChange={v => setF({ ...f, area: v })} placeholder="London N1" /></Field>
        <Field label="Type"><Select value={f.type} onChange={v => setF({ ...f, type: v as Property['type'] })} options={['House', 'Flat', 'HMO'].map(x => ({ value: x, label: x === 'HMO' ? 'Shared house (HMO)' : x }))} /></Field>
        {f.type === 'HMO' ? <Field label="Rooms to let"><Text value={f.rooms} onChange={v => setF({ ...f, rooms: v })} /></Field> : <Field label="Bedrooms"><Text value={f.beds} onChange={v => setF({ ...f, beds: v })} /></Field>}
        {managed && <Field label="Monthly rent (£)"><Text value={f.rent} onChange={v => setF({ ...f, rent: v })} placeholder="1150" /></Field>}
        {managed && <Field label="Yearly repair budget (£)"><Text value={f.budget} onChange={v => setF({ ...f, budget: v })} /></Field>}
        <Field label="Office Admin"><Select value={f.admin} onChange={v => setF({ ...f, admin: v })} options={L.admins.map(a => ({ value: a.id, label: a.name }))} /></Field>
      </div>
    </div>
  </Modal>;
}

export function PaymentModal({ title, owed, onClose, onSave }: { title: string; owed: number; onClose: () => void; onSave: (amount: number, date: string, note: string) => void }) {
  const [a, setA] = useState(String(owed));
  const [d, setD] = useState('2026-10-15');
  const [n, setN] = useState('Bank transfer');
  const v = parseFloat(a) || 0;
  return <Modal title={title} sub="Check the bank first, then record what arrived. Part payments are allowed." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Check size={16} />} disabled={v <= 0} onClick={() => onSave(v, dateLabel(d), n)}>Record payment</Btn></>}>
    <div className="grid g2"><Field label="Amount received (£)"><Text value={a} onChange={setA} /></Field><Field label="Date in the bank"><input className="input" type="date" value={d} onChange={e => setD(e.target.value)} /></Field></div>
    <Field label="Note"><Text value={n} onChange={setN} /></Field>
    {v > 0 && v < owed && <Note tone="warn">{money(owed - v)} will still be owed. It carries forward and a reminder email goes out.</Note>}
    {v >= owed && <Note tone="ok">This pays it in full.</Note>}
  </Modal>;
}

export function AssignContractorModal({ title, onClose, onPick, inspector, trade }: { title: string; onClose: () => void; onPick: (id: string) => void; inspector?: boolean; trade?: string }) {
  const s = useStore();
  const [sel, setSel] = useState('');
  const list = s.contractors.filter(c => c.status !== 'Removed' && (trade ? c.trade.toLowerCase().includes(trade.toLowerCase()) : inspector ? c.type === 'Site Inspector' : c.type === 'Trade'));
  return <Modal title={title} sub="Only approved contractors with documents in date can be chosen." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!sel} onClick={() => onPick(sel)}>Assign</Btn></>}>
    <div className="col" style={{ gap: 8 }}>{list.map(c => { const bad = c.status !== 'Active' || c.kyc.some(x => x.status === 'Expired'); return (
      <button key={c.id} disabled={bad} className={`choice${sel === c.id ? ' on' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: bad ? .6 : 1, cursor: bad ? 'not-allowed' : 'pointer' }} onClick={() => setSel(c.id)}>
        <Avatar name={c.name} /><div className="stack grow"><b>{c.name}</b><span className="caption">{c.trade} · {c.pastJobs} jobs · ★ {c.rating}</span></div>
        {bad ? <Chip tone="err">Paused · {c.reason ?? 'document expired'}</Chip> : <Chip tone="ok">Documents in date</Chip>}
      </button>); })}
      {!list.length && <Note>No contractor for this trade yet.</Note>}</div>
  </Modal>;
}

export function AssignAdminModal({ title = 'Assign an Office Admin', sub = 'They see it straight away in their own list.', current, onClose, onPick }: { title?: string; sub?: string; current?: string; onClose: () => void; onPick: (id: string) => void }) {
  const s = useStore(); const L = useLookups();
  const [sel, setSel] = useState(current ?? '');
  return <Modal title={title} sub={sub} onClose={onClose} footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!sel || sel === current} onClick={() => onPick(sel)}>Assign</Btn></>}>
    <div className="col" style={{ gap: 8 }}>{L.admins.map(a => { const open = s.tasks.filter(t => t.admin === a.id && !t.done).length; return (
      <button key={a.id} className={`choice${sel === a.id ? ' on' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onClick={() => setSel(a.id)}>
        <Avatar id={a.id} /><div className="stack grow"><b>{a.name}</b><span className="caption">{open} open tasks · {s.properties.filter(p => p.admin === a.id).length} homes</span></div>{a.id === current && <Chip tone="brand">Now</Chip>}
      </button>); })}</div>
  </Modal>;
}

export function NewJobModal({ onClose, property, tenant, onCreated }: { onClose: () => void; property?: string; tenant?: string; onCreated?: (id: string) => void }) {
  const s = useStore(); const L = useLookups();
  const [f, setF] = useState({ title: '', property: property ?? s.properties[0].id, urgent: false, note: '', category: 'General' as Job['category'], by: tenant ? 'Tenant · ' + L.tenant(tenant)?.name : 'Supervisor' });
  return <Modal title={tenant ? 'Log an issue for this tenant' : 'New job'} sub="Log a repair reported by phone, email or in person." onClose={onClose} footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!f.title} onClick={() => {
    const p = s.properties.find(x => x.id === f.property)!; const id = 'J' + Date.now() % 10000;
    s.setJobs(js => [{ id, title: f.title, property: f.property, managed: p.managed, cost: 0, price: 0, status: 'New', urgent: f.urgent, reported: nowStamp(), by: f.by, tenant, admin: p.admin, note: f.note, category: f.category, comms: [], events: [{ at: nowStamp(), by: ME_NAME, text: `Logged by Supervisor${f.urgent ? ' as an emergency' : ''}` }] }, ...js]);
    s.log(`Logged job: ${f.title} at ${p.address}`, 'Jobs'); s.toast('Job created'); onClose(); onCreated?.(id);
  }}>Create job</Btn></>}>
    <Field label="What is wrong"><Text value={f.title} onChange={v => setF({ ...f, title: v })} placeholder="e.g. Kitchen tap leaking" /></Field>
    <div className="grid g2">
      <Field label="Home"><Select value={f.property} onChange={v => setF({ ...f, property: v })} options={s.properties.map(p => ({ value: p.id, label: `${p.address}${p.managed ? '' : ' (unmanaged)'}` }))} /></Field>
      <Field label="Type of work"><Select value={f.category} onChange={v => setF({ ...f, category: v as Job['category'] })} options={(['Plumbing', 'Heating', 'Electrical', 'Roofing', 'Locks & doors', 'Damp', 'General'] as const).map(x => ({ value: x, label: x }))} /></Field>
    </div>
    <Field label="Details"><Area value={f.note} onChange={v => setF({ ...f, note: v })} placeholder="What the tenant said, where it is, access times" /></Field>
    <label className="check" style={{ cursor: 'pointer' }}><input type="checkbox" checked={f.urgent} onChange={e => setF({ ...f, urgent: e.target.checked })} /> Emergency (no heating, no water, unsafe)</label>
  </Modal>;
}

const ROOMS = (p?: Property) => Array.from({ length: p?.rooms ?? 0 }, (_, i) => `Room ${i + 1}`);
export function BookInspectionModal({ onClose, property, kind, room, onBooked }: { onClose: () => void; property?: string; kind?: InspKind; room?: string; onBooked?: (id: string) => void }) {
  const s = useStore(); const L = useLookups();
  const managed = s.properties.filter(p => p.managed);
  const [f, setF] = useState({ property: property ?? managed[0].id, kind: kind ?? 'Routine' as InspKind, scope: (room ? 'HMO room' : 'Whole property') as InspScope, room: room ?? 'Room 1', date: '2026-10-28', time: '10:00', inspector: '', notes: '' });
  const p = L.prop(f.property);
  const trade = f.kind === 'Gas safety' ? 'Gas' : f.kind === 'Electrical' ? 'Electric' : '';
  const people = s.contractors.filter(c => c.status === 'Active' && (trade ? c.trade.includes(trade) : c.type === 'Site Inspector'));
  return <Modal wide title="Book an inspection" sub="Choose the home, what is being checked and when. The Site Inspector or engineer gets the booking by email." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn onClick={() => {
      const id = 'I' + Date.now() % 10000;
      s.setInspections(is => [{ id, kind: f.kind, scope: f.scope, property: f.property, room: f.scope === 'HMO room' ? f.room : undefined, date: dateLabel(f.date), time: f.time, inspector: f.inspector || undefined, status: f.inspector ? 'Booked' : 'Not assigned', rooms: [], meters: {}, keys: 0, notes: f.notes || undefined }, ...is]);
      s.log(`Booked ${f.kind.toLowerCase()} inspection at ${p?.address} for ${dateLabel(f.date)}, ${f.time}`, 'Inspections');
      s.toast(f.inspector ? 'Inspection booked and the inspector told' : 'Inspection booked. Now assign an inspector.'); onClose(); onBooked?.(id);
    }}>Book inspection</Btn></>}>
    <div className="grid g2">
      <Field label="Property"><Select value={f.property} onChange={v => setF({ ...f, property: v, scope: 'Whole property' })} options={managed.map(x => ({ value: x.id, label: x.address }))} /></Field>
      <Field label="What is being checked"><Select value={f.kind} onChange={v => setF({ ...f, kind: v as InspKind, inspector: '' })} options={INSP_KINDS.map(x => ({ value: x, label: x === 'Electrical' ? 'Electrical (EICR)' : x === 'Gas safety' ? 'Gas safety (CP12)' : x + (['Move-in', 'Routine', 'Move-out'].includes(x) ? ' inspection' : ' check') }))} /></Field>
    </div>
    <Field label="Part of the property">
      <div className="seg">{(['Whole property', 'HMO room', 'Communal areas'] as InspScope[]).map(sc => { const dis = sc !== 'Whole property' && p?.type !== 'HMO'; return <button key={sc} type="button" disabled={dis} className={f.scope === sc ? 'on' : ''} onClick={() => setF({ ...f, scope: sc })}>{sc}</button>; })}</div>
    </Field>
    {f.scope === 'HMO room' && <Field label="Room"><Select value={f.room} onChange={v => setF({ ...f, room: v })} options={ROOMS(p).map(r => ({ value: r, label: r + (s.tenants.find(t => t.property === p?.id && t.room === r && t.status !== 'Moved out') ? ` · ${s.tenants.find(t => t.property === p?.id && t.room === r && t.status !== 'Moved out')!.name}` : ' · empty') }))} /></Field>}
    <div className="grid g3">
      <Field label="Date"><input className="input" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Time"><input className="input" type="time" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /></Field>
      <Field label={trade ? 'Engineer' : 'Site Inspector'}><Select value={f.inspector} onChange={v => setF({ ...f, inspector: v })} options={[{ value: '', label: 'Assign later' }, ...people.map(c => ({ value: c.id, label: c.name }))]} /></Field>
    </div>
    <Field label="Notes for the visit (optional)"><Area value={f.notes} onChange={v => setF({ ...f, notes: v })} placeholder="e.g. Tenant works nights, call before arriving" /></Field>
  </Modal>;
}

/* ---------- small side cards ---------- */
export function PersonCard({ title, name, id, sub, photo, action, phone, email }: { title: string; name?: string; id?: string; sub?: ReactNode; photo?: string; action?: ReactNode; phone?: string; email?: string }) {
  const s = useStore();
  return <section className="card">
    <span className="caption-strong muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{title}</span>
    <div className="flex" style={{ gap: 12 }}><Avatar id={id} name={name} photo={photo} size="md" /><div className="stack grow"><b>{name ?? adminName(id)}</b>{sub && <span className="caption">{sub}</span>}</div>{action}</div>
    {(phone || email) && <div className="flex wrap">{phone && <Btn sm kind="outline" icon={<Phone size={14} />} onClick={() => s.toast('Calling ' + phone)}>Call</Btn>}{email && <Btn sm kind="outline" icon={<Mail size={14} />} onClick={() => s.toast('Email opened to ' + email)}>Email</Btn>}</div>}
  </section>;
}
export function HomeCard({ id, title = 'Home', note }: { id: string; title?: string; note?: ReactNode }) {
  const s = useStore(); const L = useLookups(); const p = L.prop(id);
  if (!p) return null;
  return <section className="card" style={{ padding: 14 }}>
    <span className="caption-strong muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em', padding: '0 6px' }}>{title}</span>
    <button className="homecard" onClick={() => s.go('properties', p.id)}>
      <div className="photo" style={{ height: 120, backgroundImage: `url(${p.photo})` }} />
      <div className="flex between" style={{ alignItems: 'flex-start' }}><div className="stack"><b>{p.address}</b><span className="caption">{p.area}</span></div><ArrowRight size={16} color="#98A2B3" /></div>
      <span className="caption">{p.type === 'HMO' ? `Shared house · ${p.rooms} rooms` : `${p.beds} bed ${p.type.toLowerCase()}`} · {L.ownerName(p)}</span>
      {note}
    </button>
  </section>;
}
export const goTo = (s: S, r: Route, id?: string) => () => s.go(r, id ?? null);
