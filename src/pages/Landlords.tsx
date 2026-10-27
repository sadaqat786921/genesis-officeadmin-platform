import { useState } from 'react';
import { Plus, Mail, Home, UserCheck, Pencil, ShieldCheck, ClipboardCheck, Wrench, Receipt, ArrowRight, Phone, Wallet } from 'lucide-react';
import { useStore, useLookups, money, landlordBudget, budgetTone } from '../store';
import { PLAN, SUPERVISOR, nowStamp, type Comm } from '../data';
import { sendRequest } from './Requests';
import { ME_NAME } from '../data';
import { Avatar, Bar, Btn, Card, Chip, DetailHead, Field, KV, Kpi, MiniSearch, Modal, Note, PageTabs, Select, Stat, Tabs, Text, Timeline, CommsLog, ActionCard, Empty, Reason } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { AddPropertyModal, adminName } from './shared';
import { CertTable, InspTable, InvoiceTable, JobTable, certTone } from './tables';

export function Landlords() {
  const s = useStore();
  if (s.detail && s.landlords.some(l => l.id === s.detail)) return <LandlordPage id={s.detail} />;
  return <LandlordList />;
}

function LandlordList() {
  const s = useStore();
  const [q, setQ] = useState(''); const [plan, setPlan] = useState<'all' | '12' | '16' | '20'>('all'); const [add, setAdd] = useState(false);
  const list = s.landlords.filter(l => (plan === 'all' || String(l.plan) === plan) && (l.name + l.email).toLowerCase().includes(q.toLowerCase()));
  const high = s.properties.filter(p => p.managed && p.budget && p.used / p.budget >= .7).length;
  return <>
    <PageHeader crumbs={crumbsFor('landlords', s.go)} title="Landlords" action={<Btn icon={<Plus size={18} />} onClick={() => setAdd(true)}>Ask for a new landlord</Btn>} />
    <div className="grid g4">
      <Kpi icon={<UserCheck size={18} />} tone="brand" label="Landlords" value={s.landlords.length} caption={`${s.landlords.filter(l => l.status === 'Invite sent').length} waiting to log in`} />
      <Kpi icon={<Home size={18} />} tone="info" label="Managed homes" value={s.properties.filter(p => p.managed).length} caption="across all landlords" onClick={() => s.go('properties')} />
      <Kpi icon={<Wallet size={18} />} tone="warn" label="Budgets over 70%" value={high} caption="properties, alert sent" onClick={() => s.go('requests')} />
      <Kpi icon={<ShieldCheck size={18} />} tone="ok" label="Plans" value={<span style={{ fontSize: 18 }}>{([10, 12, 16, 20] as const).map(p => `${s.landlords.filter(l => l.plan === p).length}×${p}%`).join('  ')}</span>} caption="10% · 12% · 16% · 20%" />
    </div>
    <Card title="Your landlords" sub={`The landlords ${SUPERVISOR} gave you. Click one to see their homes, safety checks, inspections, jobs and money.`} action={<div className="toolbar"><MiniSearch value={q} onChange={setQ} placeholder="Search name or email" /><Tabs value={plan} onChange={setPlan} items={[{ id: 'all', label: 'All plans' }, { id: '12', label: '12%' }, { id: '16', label: '16%' }, { id: '20', label: '20%' }]} /></div>}>
      <div className="tablewrap"><table className="t"><thead><tr><th>Landlord</th><th>Plan</th><th>Homes</th><th>Repair budget used</th><th>Safety</th><th>Office Admin</th><th>Login</th></tr></thead><tbody>
        {list.map(l => { const b = landlordBudget(s, l.id); const bad = s.safety.filter(c => b.props.some(p => p.id === c.property) && ['Overdue', 'Missing'].includes(c.status)).length; return (
          <tr key={l.id} onClick={() => s.go('landlords', l.id)}><td><span className="cell"><Avatar name={l.name} /><span className="stack"><b className="strong">{l.name}</b><span className="caption">{l.email}</span></span></span></td>
            <td><Chip tone="brand" dot={false}>{l.plan}% · limit {money(PLAN[l.plan].limit)}</Chip></td><td>{b.props.length}</td>
            <td style={{ minWidth: 170 }}>{b.budget ? <div className="stack" style={{ gap: 6 }}><span className="caption">{money(b.used)} of {money(b.budget)} · {b.pct}%</span><Bar value={b.pct} tone={budgetTone(b.pct)} /></div> : <span className="muted">No budget yet</span>}</td>
            <td>{bad ? <Chip tone="err">{bad} need action</Chip> : <Chip tone="ok">All in date</Chip>}</td>
            <td><span className="cell"><Avatar id={l.admin} />{adminName(l.admin)}</span></td><td>{l.status === 'Active' ? <Chip tone="ok">Active</Chip> : <Chip tone="warn">Invite sent</Chip>}</td></tr>); })}
      </tbody></table></div>
    </Card>
    {add && <AskNewLandlord onClose={() => setAdd(false)} />}
  </>;
}

type LTab = 'overview' | 'homes' | 'safety' | 'inspections' | 'jobs' | 'money' | 'comms' | 'history';
function LandlordPage({ id }: { id: string }) {
  const s = useStore(); const L = useLookups(); const l = s.landlords.find(x => x.id === id)!;
  const [tab, setTab] = useState<LTab>('overview'); const [addP, setAddP] = useState(false); const [edit, setEdit] = useState(false); const [planReq, setPlanReq] = useState(false);
  const b = landlordBudget(s, id); const homes = b.props; const ids = homes.map(p => p.id);
  const certs = s.safety.filter(c => ids.includes(c.property)).sort((x, y) => x.days - y.days);
  const insp = s.inspections.filter(i => ids.includes(i.property));
  const jobs = s.jobs.filter(j => ids.includes(j.property));
  const invs = s.invoices.filter(i => i.toKind === 'Landlord' && i.to === id);
  const bad = certs.filter(c => ['Overdue', 'Missing', 'Due soon'].includes(c.status));
  const waiting = jobs.filter(j => j.status === 'Waiting approval');
  const acts = s.activity.filter(a => a.what.includes(l.name) || homes.some(p => a.what.includes(p.address)));
  const addComm = (c: Comm) => { s.setLandlords(ls => ls.map(x => x.id === id ? { ...x, comms: [...x.comms, c] } : x)); s.log(`${c.channel === 'Email' ? 'Emailed' : c.channel === 'Call' ? 'Called' : 'Added a note for'} ${l.name}`, 'Landlords'); s.toast('Saved'); };
  return <>
    <PageHeader crumbs={crumbsFor('landlords', s.go, l.name)} back={() => s.go('landlords')} title={l.name}
      action={<div className="flex">{l.status === 'Invite sent' && <Btn kind="outline" icon={<Mail size={16} />} onClick={() => { s.toast(`Login email sent again to ${l.email}`); s.log(`Resent login email to ${l.name}`, 'Landlords'); }}>Resend login</Btn>}<Btn kind="outline" icon={<Pencil size={16} />} onClick={() => setEdit(true)}>Edit details</Btn><Btn icon={<Plus size={18} />} onClick={() => setAddP(true)}>Add property</Btn></div>} />
    <DetailHead media={<Avatar name={l.name} size="xl" />} title={l.name}
      chips={<><Chip tone="brand" dot={false}>{l.plan}% plan · limit {money(PLAN[l.plan].limit)}</Chip>{l.status === 'Active' ? <Chip tone="ok">Login active</Chip> : <Chip tone="warn">Invite sent</Chip>}</>}
      meta={[['Email', l.email], ['Phone', l.phone], ['Office Admin', adminName(l.admin)], ['Landlord since', l.start]]}
      aside={<div className="flex" style={{ gap: 8 }}><Btn sm kind="outline" icon={<Phone size={14} />} onClick={() => s.toast('Calling ' + l.phone)}>Call</Btn><Btn sm kind="outline" icon={<Mail size={14} />} onClick={() => setTab('comms')}>Email</Btn></div>} />
    <div className="grid g4">
      <Stat label="Homes" value={homes.length} sub={`${homes.filter(p => p.status === 'Let').length} fully let`} />
      <Stat label="Repair budget used" value={b.budget ? b.pct + '%' : '—'} sub={b.budget ? `${money(b.used)} of ${money(b.budget)}` : 'Starts with the agreement'} tone={budgetTone(b.pct)} />
      <Stat label="Safety checks" value={bad.length ? `${bad.length} to do` : 'All in date'} sub={`${certs.length} certificates`} tone={bad.some(c => c.status !== 'Due soon') ? 'err' : bad.length ? 'warn' : 'ok'} />
      <Stat label="With the Supervisor" value={waiting.length} sub={waiting.length ? money(waiting.reduce((a, j) => a + j.price, 0)) + ' to approve' : 'nothing waiting'} tone={waiting.length ? 'warn' : 'ok'} />
    </div>
    <PageTabs value={tab} onChange={setTab} items={[{ id: 'overview', label: 'Overview' }, { id: 'homes', label: 'Properties', count: homes.length }, { id: 'safety', label: 'Safety checks', count: certs.length }, { id: 'inspections', label: 'Inspections', count: insp.length }, { id: 'jobs', label: 'Jobs', count: jobs.length }, { id: 'money', label: 'Invoices', count: invs.length }, { id: 'comms', label: 'Communication', count: l.comms.length }, { id: 'history', label: 'History' }]} />

    {tab === 'overview' && <div className="dgrid">
      <div className="col">
        <Card title="Needs attention" sub="Anything for this landlord that is late, missing or waiting.">
          {bad.length + waiting.length ? <div className="divlist">
            {waiting.map(j => <button key={j.id} className="item click" onClick={() => s.go('requests', j.id)}><span className="tile t-warn"><Wrench size={16} /></span><div className="stack grow"><b>{j.title} · {money(j.price)}</b><span className="caption">{L.prop(j.property)?.address} · over the {money(PLAN[l.plan].limit)} job limit</span></div><Chip tone="warn">With Supervisor</Chip></button>)}
            {bad.map(c => <button key={c.id} className="item click" onClick={() => s.go('safety', c.id)}><span className={`tile t-${certTone(c.status)}`}><ShieldCheck size={16} /></span><div className="stack grow"><b>{c.kind}</b><span className="caption">{L.prop(c.property)?.address} · {c.status === 'Missing' ? 'no certificate' : 'ends ' + c.expires}</span></div><Chip tone={certTone(c.status)}>{c.status}</Chip></button>)}
          </div> : <Note tone="ok">Nothing needs action for {l.name}.</Note>}
        </Card>
        <Card title="Repair budget by property" sub="Every property has its own yearly budget. Alerts go to the landlord at 70%, 90% and 100%." action={<Btn sm kind="ghost" onClick={() => s.go('requests')}>All budgets</Btn>}>
          {homes.length ? <div className="divlist">{homes.map(p => { const pct = p.budget ? Math.round(p.used / p.budget * 100) : 0; return <button key={p.id} className="item click" onClick={() => s.go('properties', p.id)}><div className="photo" style={{ width: 48, height: 40, flex: 'none', backgroundImage: `url(${p.photo})` }} /><div className="stack grow" style={{ gap: 6 }}><span className="flex between"><b>{p.address}</b><span className="caption">{money(p.used)} of {money(p.budget)} · {pct}%</span></span><Bar value={pct} tone={budgetTone(pct)} /></div></button>; })}</div> : <Empty>No properties yet.</Empty>}
        </Card>
      </div>
      <div className="col">
        <Card title="Contact and billing"><KV rows={[['Email', l.email], ['Phone', l.phone], ['Billing address', l.billing], ['Bank for payouts', l.bank], ['ID checks', 'Not needed for landlords']]} /></Card>
        <Card title="Plan"><div className="flex" style={{ gap: 14 }}><span className="metric">{l.plan}%</span><div className="stack"><b>Job limit {money(PLAN[l.plan].limit)}</b><span className="caption">Jobs above this go to {SUPERVISOR} to approve</span></div></div><Btn sm kind="outline" onClick={() => setPlanReq(true)}>Ask for a plan change</Btn></Card>
      </div>
    </div>}

    {tab === 'homes' && <Card title="Properties" action={<Btn sm icon={<Plus size={14} />} onClick={() => setAddP(true)}>Add property</Btn>}>
      <div className="grid g3">{homes.map(p => { const pct = p.budget ? Math.round(p.used / p.budget * 100) : 0; const pc = s.safety.filter(c => c.property === p.id && ['Overdue', 'Missing'].includes(c.status)).length; return <button key={p.id} className="kcard" onClick={() => s.go('properties', p.id)}><div className="photo" style={{ height: 130, backgroundImage: `url(${p.photo})` }} /><div className="flex between"><b>{p.address}</b><Chip tone={p.status === 'Let' ? 'ok' : 'warn'}>{p.status}</Chip></div><span className="caption">{p.area} · {p.type === 'HMO' ? `${p.rooms} rooms` : `${p.beds} bed ${p.type.toLowerCase()}`}</span><div className="flex between"><b style={{ color: 'var(--text-brand)' }}>{money(p.rent)} pcm</b>{pc ? <Chip tone="err" dot={false}><ShieldCheck size={12} /> {pc} safety</Chip> : <Chip tone="ok" dot={false}><ShieldCheck size={12} /> In date</Chip>}</div><span className="caption">Budget {pct}% used</span><Bar value={pct} tone={budgetTone(pct)} /></button>; })}
        {!homes.length && <Empty icon={<Home size={22} />}>No homes yet. Add the landlord's first property.</Empty>}</div>
    </Card>}

    {tab === 'safety' && <>
      <div className="grid g4">{(['Valid', 'Due soon', 'Overdue', 'Missing'] as const).map(st => <Stat key={st} label={st === 'Valid' ? 'In date' : st} value={certs.filter(c => st === 'Due soon' ? ['Due soon', 'Booked', 'Proof to check'].includes(c.status) : c.status === st).length} tone={certTone(st)} />)}</div>
      <Card title="Compliance documents" sub="Every certificate for this landlord's homes, with when it was done and when it ends. Upload or replace a certificate, or remind the Office Admin." action={<Btn sm kind="ghost" icon={<ArrowRight size={14} />} onClick={() => s.go('safety')}>Compliance centre</Btn>}>
        <CertTable list={certs} />
      </Card></>}

    {tab === 'inspections' && <Card title="Inspection reports" sub="Every inspection with the date and time it was booked and done. Click one to see the full report and photos." action={<Btn sm kind="ghost" icon={<ClipboardCheck size={14} />} onClick={() => s.go('inspections')}>All inspections</Btn>}>
      <InspTable list={[...insp].sort((a, b2) => (b2.doneAt ?? b2.date).localeCompare(a.doneAt ?? a.date))} /></Card>}

    {tab === 'jobs' && <Card title="Jobs" sub="Repairs at this landlord's homes."><JobTable list={jobs} /></Card>}
    {tab === 'money' && <Card title="Invoices to this landlord" action={<Btn sm kind="ghost" icon={<Receipt size={14} />} onClick={() => s.go('rent')}>Rent & Invoices</Btn>}><InvoiceTable list={invs} /></Card>}
    {tab === 'comms' && <div className="dgrid"><Card title="Communication" sub="Calls, emails and notes with this landlord."><CommsLog items={l.comms} to={l.email} onAdd={addComm} /></Card>
      <ActionCard title="Tip" tone="neutral" text="Budget alert emails and approval requests are saved here automatically." /></div>}
    {tab === 'history' && <Card title="History" sub="Everything that happened, with the date and time."><Timeline items={[...acts.map(a => ({ at: a.at, text: a.what, by: a.who })), { at: l.start, text: `Account created on the ${l.plan}% plan`, by: ME_NAME }]} /></Card>}

    {addP && <AddPropertyModal owner={id} managed onClose={() => setAddP(false)} />}
    {edit && <EditLandlord id={id} onClose={() => setEdit(false)} />}
    {planReq && <Reason title={`Ask for a plan change for ${l.name}`} sub={`${SUPERVISOR} decides. The plan changes from a future date.`} cta="Send request" label="What does the landlord want?" options={[10, 12, 16, 20].filter(x => x !== l.plan).map(x => `Move to the ${x}% plan (job limit ${money(PLAN[x as 12].limit)})`)} onClose={() => setPlanReq(false)} onDone={r => { sendRequest(s, { kind: 'Plan change', title: `Plan change: ${l.name}`, about: r, link: { route: 'landlords', id } }); setPlanReq(false); }} />}
  </>;
}

function EditLandlord({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useStore(); const l = s.landlords.find(x => x.id === id)!; const [f, setF] = useState({ phone: l.phone, billing: l.billing });
  return <Modal title="Edit landlord details" sub="Changes are saved in History with who changed them." onClose={onClose} footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn onClick={() => { s.setLandlords(ls => ls.map(x => x.id === id ? { ...x, ...f } : x)); s.log(`Updated details for ${l.name}`, 'Landlords'); s.toast('Saved'); onClose(); }}>Save</Btn></>}>
    <Field label="Phone"><Text value={f.phone} onChange={v => setF({ ...f, phone: v })} /></Field>
    <Field label="Billing address"><Text value={f.billing} onChange={v => setF({ ...f, billing: v })} /></Field>
    <Note>Bank details, the plan and the Office Admin can only be changed by {SUPERVISOR}. Use "Ask for a plan change" or a request.</Note>
  </Modal>;
}

/** Only the Supervisor creates landlords. The Office Admin sends the details; Genesis checks for duplicates first. */
export function AskNewLandlord({ onClose, prefill, enquiry }: { onClose: () => void; prefill?: { name: string; email: string; phone: string }; enquiry?: string }) {
  const s = useStore();
  const [f, setF] = useState({ name: prefill?.name ?? '', email: prefill?.email ?? '', phone: prefill?.phone ?? '', billing: '', plan: '16', homes: '' });
  const dup = s.landlords.find(l => f.email && l.email.toLowerCase() === f.email.toLowerCase()) ?? s.landlords.find(l => f.name.trim() && l.name.toLowerCase() === f.name.trim().toLowerCase());
  const ok = f.name.trim() && f.email.includes('@') && !dup;
  return <Modal title="Ask the Supervisor to create a landlord" sub={`Only ${SUPERVISOR} can create landlord accounts. Send the details and they create it and send the login email from Outlook.`} onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!ok} onClick={() => { sendRequest(s, { kind: 'New landlord', title: `Create landlord account: ${f.name.trim()}`, about: `${f.homes || 'Homes to be added'} · wants the ${f.plan}% plan`, link: enquiry ? { route: 'enquiries', id: enquiry } : undefined, data: { name: f.name.trim(), email: f.email.trim(), phone: f.phone, billing: f.billing, plan: f.plan, ...(enquiry ? { enquiry } : {}) } }); if (enquiry) s.setEnquiries(es => es.map(e => e.id === enquiry ? { ...e, comms: [...e.comms, { id: 'cm' + Date.now(), at: nowStamp(), by: ME_NAME, channel: 'System', text: `Sent to ${SUPERVISOR} to create the landlord account.` }] } : e)); onClose(); }}>Send to {SUPERVISOR.split(' ')[0]}</Btn></>}>
    <div className="grid g2"><Field label="Full name"><Text value={f.name} onChange={v => setF({ ...f, name: v })} /></Field><Field label="Email (their login)"><Text value={f.email} onChange={v => setF({ ...f, email: v })} /></Field></div>
    <div className="grid g2"><Field label="Phone"><Text value={f.phone} onChange={v => setF({ ...f, phone: v })} /></Field><Field label="Plan they want"><Select value={f.plan} onChange={v => setF({ ...f, plan: v })} options={(['10', '12', '16', '20'] as const).map(p => ({ value: p, label: p === '10' ? '10% · Management Only' : `${p}% · job limit ${money(PLAN[+p as 12].limit)}` }))} /></Field></div>
    <Field label="Billing address"><Text value={f.billing} onChange={v => setF({ ...f, billing: v })} placeholder="e.g. 4 Kirkstall Road, London N5" /></Field>
    <Field label="Homes they want managed"><Text value={f.homes} onChange={v => setF({ ...f, homes: v })} placeholder="e.g. 2 flats in Kentish Town NW5" /></Field>
    {dup ? <Note tone="err">{dup.name} ({dup.email}) is already a landlord. No new account is needed.</Note> : f.email ? <Note tone="ok">No landlord with this name or email. Checked for duplicates.</Note> : null}
  </Modal>;
}
