import { useState } from 'react';
import { Plus, Home, Building2, CheckCircle2, ShieldCheck, Wrench, ArrowRight, ClipboardCheck, Users, Wallet, Megaphone, Download, History as HistoryIcon, FileText } from 'lucide-react';
import { useStore, useLookups, money, rentStatus, budgetTone } from '../store';
import { CERT_KINDS, daysFrom, parseDate, type Property } from '../data';
import { Avatar, Bar, Btn, Card, Chip, Field, KV, Kpi, MiniSearch, Modal, Note, PageTabs, Select, Stat, Tabs, Timeline, Empty } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { AddPropertyModal, BookInspectionModal, NewJobModal, adminName, DONE_JOB, jobTone } from './shared';
import { CertTable, InspTable, JobTable, certTone } from './tables';
import { JobReportModal } from './docs';
import { PlanCard, PlanModal } from './PropertyPlan';
import { PropertyHistory, PropertyMoney, ClientHomeInvoices } from './PropertyExtras';

const occupancy = (s: ReturnType<typeof useStore>, p: Property) => {
  const live = s.tenants.filter(t => t.property === p.id && t.status !== 'Moved out');
  return p.type === 'HMO' ? `${live.length} of ${p.rooms} rooms let` : live.length ? 'Let' : 'Empty';
};

export function Properties() {
  const s = useStore();
  if (s.detail && s.properties.some(p => p.id === s.detail)) return <PropertyPage id={s.detail} />;
  return <PropertyList />;
}

function PropertyList() {
  const s = useStore(); const L = useLookups();
  const [tab, setTab] = useState<'managed' | 'unmanaged'>('managed'); const [q, setQ] = useState(''); const [add, setAdd] = useState<'' | 'pick' | 'form'>(''); const [owner, setOwner] = useState('');
  const list = s.properties.filter(p => p.managed === (tab === 'managed') && (p.address + p.area + L.ownerName(p)).toLowerCase().includes(q.toLowerCase()));
  const managed = s.properties.filter(p => p.managed);
  return <>
    <PageHeader crumbs={crumbsFor('properties', s.go)} title="Properties"
      action={<Btn icon={<Plus size={18} />} onClick={() => { setOwner(tab === 'managed' ? s.landlords[0].id : s.clients[0].id); setAdd('pick'); }}>Add property</Btn>} />
    <div className="grid g4">
      <Kpi icon={<Home size={18} />} tone="brand" label="Managed homes" value={managed.length} caption="tenants, rent and safety" active={tab === 'managed'} onClick={() => setTab('managed')} />
      <Kpi icon={<Building2 size={18} />} tone="info" label="Client homes" value={s.properties.filter(p => !p.managed).length} caption="contractor services only" active={tab === 'unmanaged'} onClick={() => setTab('unmanaged')} />
      <Kpi icon={<CheckCircle2 size={18} />} tone="ok" label="Fully let" value={managed.filter(p => p.status === 'Let').length} caption={`${managed.filter(p => p.status === 'Partly let').length} shared houses part let`} />
      <Kpi icon={<Megaphone size={18} />} tone="warn" label="Ready to let" value={managed.filter(p => ['Ready to let', 'Vacant'].includes(p.status)).length} caption="in Lettings" onClick={() => s.go('lettings')} />
    </div>
    <Card title={tab === 'managed' ? 'Managed homes' : 'Client homes (unmanaged)'} sub="Click a home to see its tenants, jobs, safety checks and inspections in one place." action={<div className="toolbar"><MiniSearch value={q} onChange={setQ} placeholder="Search address or owner" /><Tabs value={tab} onChange={setTab} items={[{ id: 'managed', label: 'Managed' }, { id: 'unmanaged', label: 'Client homes' }]} /></div>}>
      <div className="grid g3">{list.map(p => { const jobs = s.jobs.filter(j => j.property === p.id && !DONE_JOB.includes(j.status)).length; const certs = s.safety.filter(c => c.property === p.id); const bad = certs.filter(c => ['Overdue', 'Missing'].includes(c.status)).length; const soon = certs.filter(c => ['Due soon', 'Booked', 'Proof to check'].includes(c.status)).length; const nextI = s.inspections.filter(i => i.property === p.id && i.status !== 'Locked' && daysFrom(i.date) >= 0).sort((a, b) => daysFrom(a.date) - daysFrom(b.date))[0]; return (
        <button key={p.id} className="kcard pcard" onClick={() => s.go('properties', p.id)}>
          <div className="photo" style={{ height: 140, backgroundImage: `url(${p.photo})` }}>{p.managed ? <Chip tone={p.status === 'Let' ? 'ok' : 'warn'}>{p.status}</Chip> : <Chip tone="info" dot={false}>Client home</Chip>}</div>
          <div className="stack"><b style={{ fontSize: 14 }}>{p.address}</b><span className="caption">{p.area} · {p.type === 'HMO' ? `Shared house · ${p.rooms} rooms` : `${p.beds} bed ${p.type.toLowerCase()}`}</span></div>
          <div className="flex between"><span className="cell small"><Avatar name={L.ownerName(p)} />{L.ownerName(p)}</span>{p.managed && <b style={{ color: 'var(--text-brand)' }}>{money(p.rent)}<span className="caption"> pcm</span></b>}</div>
          <div className="pstats">
            <span><Wrench size={13} />{jobs ? `${jobs} open job${jobs > 1 ? 's' : ''}` : 'No open jobs'}</span>
            {p.managed && <span className={bad ? 'bad' : soon ? 'soon' : 'good'}><ShieldCheck size={13} />{bad ? `${bad} safety issue${bad > 1 ? 's' : ''}` : soon ? `${soon} due soon` : 'Safety in date'}</span>}
            {p.managed && <span><ClipboardCheck size={13} />{nextI ? `Inspection ${nextI.date.replace(' 2026', '')}` : 'No inspection booked'}</span>}
          </div>
        </button>); })}</div>
      {!list.length && <Empty icon={<Home size={22} />}>No homes match.</Empty>}
    </Card>
    {add === 'pick' && <Modal title="Who owns this home?" sub={tab === 'managed' ? 'Managed homes belong to a landlord.' : 'Client homes belong to a letting agent.'} onClose={() => setAdd('')} footer={<><Btn kind="outline" onClick={() => setAdd('')}>Cancel</Btn><Btn onClick={() => setAdd('form')}>Continue</Btn></>}>
      <Field label={tab === 'managed' ? 'Landlord' : 'Client'}><Select value={owner} onChange={setOwner} options={(tab === 'managed' ? s.landlords : s.clients).map(o => ({ value: o.id, label: o.name }))} /></Field>
    </Modal>}
    {add === 'form' && <AddPropertyModal owner={owner} managed={tab === 'managed'} onClose={() => setAdd('')} />}
  </>;
}

type PTab = 'overview' | 'tenants' | 'jobs' | 'safety' | 'inspections' | 'budget' | 'money' | 'history';
function PropertyPage({ id }: { id: string }) {
  const s = useStore(); const L = useLookups(); const p = s.properties.find(x => x.id === id)!;
  const [tab, setTab] = useState<PTab>('overview'); const [m, setM] = useState<'' | 'job' | 'insp' | 'list' | 'reports' | 'plan'>('');
  const tenants = s.tenants.filter(t => t.property === id && t.status !== 'Moved out');
  const jobs = s.jobs.filter(j => j.property === id); const open = jobs.filter(j => !DONE_JOB.includes(j.status));
  const certs = s.safety.filter(c => c.property === id).sort((a, b) => a.days - b.days);
  const insp = s.inspections.filter(i => i.property === id);
  const upcoming = insp.filter(i => i.status !== 'Locked' && daysFrom(i.date) >= 0).sort((a, b) => daysFrom(a.date) - daysFrom(b.date));
  const last = insp.filter(i => i.doneAt).sort((a, b) => parseDate(b.doneAt!).getTime() - parseDate(a.doneAt!).getTime())[0];
  const okCerts = certs.filter(c => c.status === 'Valid').length;
  const pct = p.budget ? Math.round(p.used / p.budget * 100) : 0;
  const spent = jobs.filter(j => ['Approved', 'Invoiced', 'Assigned', 'In progress', 'Proof uploaded', 'Ready to assign'].includes(j.status) && j.price);
  const ownerLink = () => p.managed ? s.go('landlords', p.owner) : s.go('clients', p.owner);
  const tabs: { id: PTab; label: string; count?: number }[] = [{ id: 'overview', label: 'Overview' }, ...(p.managed ? [{ id: 'tenants' as PTab, label: p.type === 'HMO' ? 'Rooms' : 'Tenants', count: tenants.length }] : []), { id: 'jobs', label: 'Jobs', count: jobs.length }, ...(p.managed ? [{ id: 'safety' as PTab, label: 'Safety checks', count: certs.length }, { id: 'inspections' as PTab, label: 'Inspections', count: insp.length }, { id: 'budget' as PTab, label: 'Repair budget' }] : []), { id: 'money', label: p.managed ? 'Rent & invoices' : 'Invoices' }, { id: 'history', label: 'History' }];
  return <>
    <PageHeader crumbs={crumbsFor('properties', s.go, p.address)} back={() => s.go('properties')} title={p.address}
      action={<div className="flex"><Btn kind="ghost" icon={<HistoryIcon size={16} />} onClick={() => setTab('history')}>History</Btn>{p.managed && <Btn kind="outline" icon={<FileText size={16} />} onClick={() => setM('plan')}>Property plan</Btn>}<Btn kind="outline" icon={<Wrench size={16} />} onClick={() => setM('job')}>New job</Btn>{p.managed && <Btn kind="outline" icon={<ClipboardCheck size={16} />} onClick={() => setM('insp')}>Book inspection</Btn>}{p.managed && p.status !== 'Let' && <Btn icon={<Megaphone size={16} />} onClick={() => setM('list')}>List to let</Btn>}</div>} />
    <section className="card phero">
      <div className="photo" style={{ backgroundImage: `url(${p.photo})` }} />
      <div className="stack grow" style={{ gap: 12 }}>
        <div className="flex wrap" style={{ gap: 10 }}><h2 className="dtitle">{p.address}</h2>{p.managed ? <Chip tone={p.status === 'Let' ? 'ok' : 'warn'}>{p.status}</Chip> : <Chip tone="info" dot={false}>Client home · contractor services only</Chip>}</div>
        <span className="small">{p.area}</span>
        <div className="dmeta">{([['Owner', <button className="link" onClick={ownerLink}>{L.ownerName(p)}</button>], ['Type', p.type === 'HMO' ? `Shared house · ${p.rooms} rooms` : `${p.beds} bed ${p.type.toLowerCase()}`], ...(p.managed ? [['Rent', money(p.rent) + ' pcm']] : []), ['Office Admin', adminName(p.admin)], ['On Genesis since', p.added]] as [string, React.ReactNode][]).map(([k, v]) => <div key={k}><span className="caption">{k}</span><b>{v}</b></div>)}</div>
        <div className="grid g4" style={{ gap: 12 }}>
          {p.managed && <Stat label={p.type === 'HMO' ? 'Rooms' : 'Tenant'} value={occupancy(s, p)} tone={p.status === 'Let' ? 'ok' : 'warn'} />}
          <Stat label="Open jobs" value={open.length} tone={open.length ? 'info' : 'ok'} />
          {p.managed && <Stat label="Safety" value={`${okCerts} of ${certs.length} in date`} tone={certs.some(c => ['Overdue', 'Missing'].includes(c.status)) ? 'err' : okCerts < certs.length ? 'warn' : 'ok'} />}
          {p.managed && <Stat label="Next inspection" value={upcoming[0] ? upcoming[0].date.replace(' 2026', '') : 'None'} sub={upcoming[0]?.kind} />}
        </div>
      </div>
    </section>
    <PageTabs value={tab} onChange={setTab} items={tabs} />

    {tab === 'overview' && <div className="grid g2">
      {p.managed && <Card title={p.type === 'HMO' ? 'Rooms' : 'Who lives here'} action={<Btn sm kind="ghost" onClick={() => setTab('tenants')}>Open</Btn>}><Occupants p={p} /></Card>}
      <Card title="Open jobs" action={<Btn sm kind="ghost" onClick={() => setTab('jobs')}>See all {jobs.length}</Btn>}>{open.length ? <div className="divlist">{open.slice(0, 4).map(j => <button key={j.id} className="item click" onClick={() => s.go('jobs', j.id)}><span className={`tile ${j.urgent ? 't-err' : 't-info'}`} style={{ width: 32, height: 32 }}><Wrench size={15} /></span><div className="stack grow"><b>{j.title}</b><span className="caption">{j.reported} · {L.contractor(j.contractor)?.name ?? 'No contractor yet'}</span></div><Chip tone={jobTone(j.status)}>{j.status}</Chip></button>)}</div> : <Note tone="ok">No open jobs.</Note>}</Card>
      {p.managed && <Card title="Safety checks" action={<Btn sm kind="ghost" onClick={() => setTab('safety')}>Open</Btn>}><div className="certgrid">{CERT_KINDS.filter(k => certs.some(c => c.kind === k)).map(k => { const c = certs.find(x => x.kind === k)!; return <button key={k} className={`certcell c-${certTone(c.status)}`} onClick={() => s.go('safety', c.id)}><b>{k}</b><span>{c.status === 'Missing' ? 'No certificate' : 'Ends ' + c.expires}</span><Chip tone={certTone(c.status)}>{c.status}</Chip></button>; })}</div></Card>}
      {p.managed && <Card title="Inspections" action={<Btn sm kind="ghost" onClick={() => setTab('inspections')}>See all {insp.length}</Btn>}>
        <div className="divlist">{upcoming.slice(0, 2).map(i => <button key={i.id} className="item click" onClick={() => s.go('inspections', i.id)}><span className="datetile t-info"><b>{i.date.split(' ')[0]}</b><span>{i.date.split(' ')[1]?.toUpperCase()}</span></span><div className="stack grow"><b>{i.kind} · {i.time}</b><span className="caption">{i.scope}{i.room ? ' · ' + i.room : ''} · {L.contractor(i.inspector)?.name ?? 'No inspector yet'}</span></div><Chip tone="info">Upcoming</Chip></button>)}
          {last && <button className="item click" onClick={() => s.go('inspections', last.id)}><span className="tile t-ok"><ClipboardCheck size={16} /></span><div className="stack grow"><b>Last: {last.kind}</b><span className="caption">Done {last.doneAt} · {last.summary}</span></div></button>}
          {!upcoming.length && !last && <span className="caption">No inspections yet.</span>}</div></Card>}
      {p.managed && <PlanCard p={p} />}
      {p.managed && <Card title="Repair budget" sub="This property's own yearly budget." action={<Btn sm kind="ghost" onClick={() => setTab('budget')}>Open</Btn>}><div className="flex between"><span className="metric">{pct}%</span><span className="small">{money(p.used)} of {money(p.budget)} used</span></div><Bar value={pct} tone={budgetTone(pct)} /><span className="caption">{money(p.budget - p.used)} left. Alerts at 70%, 90% and 100%.</span></Card>}
      {!p.managed && <Card title="Client"><KV rows={[['Client', L.client(p.owner)?.name ?? ''], ['Contact', L.client(p.owner)?.contact ?? ''], ['Phone', L.client(p.owner)?.phone ?? ''], ['Invoice terms', L.client(p.owner)?.terms ?? '']]} /><Note>The client looks after tenants and rent. LSP sends contractors, quotes and invoices.</Note></Card>}
    </div>}

    {tab === 'tenants' && <Card title={p.type === 'HMO' ? 'Rooms' : 'Tenants'}><Occupants p={p} /></Card>}
    {tab === 'jobs' && <Card title="Jobs at this home" sub={`Download job reports with photo proof to share with ${L.ownerName(p)} when they ask.`} action={<div className="flex"><Btn sm kind="outline" icon={<Download size={14} />} disabled={!jobs.length} onClick={() => setM('reports')}>Download job reports</Btn><Btn sm icon={<Plus size={14} />} onClick={() => setM('job')}>New job</Btn></div>}><JobTable list={jobs} hideHome /></Card>}
    {tab === 'money' && (p.managed ? <PropertyMoney p={p} /> : <ClientHomeInvoices p={p} />)}
    {tab === 'history' && <PropertyHistory p={p} />}
    {tab === 'safety' && <Card title="Safety checks" sub="Every certificate this home needs, with when it was done and when it ends."><CertTable list={certs} hideHome /></Card>}
    {tab === 'inspections' && <Card title="Inspections" action={<Btn sm icon={<Plus size={14} />} onClick={() => setM('insp')}>Book inspection</Btn>}><InspTable list={insp} hideHome /></Card>}
    {tab === 'budget' && <div className="dgrid">
      <Card title="Spent from the budget" sub="Approved repairs this year.">{spent.length ? <Timeline items={spent.map(j => ({ at: j.reported, text: `${j.title} · ${money(j.price)}`, by: j.status }))} /> : <Empty icon={<Wallet size={22} />}>Nothing spent yet.</Empty>}</Card>
      <Card title="Yearly repair budget"><div className="flex between"><span className="metric">{pct}%</span><Chip tone={budgetTone(pct)}>{pct >= 90 ? '90% alert sent' : pct >= 70 ? '70% alert sent' : 'Under 70%'}</Chip></div><Bar value={pct} tone={budgetTone(pct)} /><KV rows={[['Budget', money(p.budget)], ['Used', money(p.used)], ['Left', money(p.budget - p.used)], ['Job limit', L.landlord(p.owner) ? money({ 12: 150, 16: 200, 20: 300 }[L.landlord(p.owner)!.plan]) : '—']]} /></Card>
    </div>}

    {m === 'plan' && <PlanModal p={p} onClose={() => setM('')} />}
    {m === 'reports' && <JobReportModal jobs={[...jobs].sort((a, b) => parseDate(b.reported).getTime() - parseDate(a.reported).getTime())} title={`Job reports · ${p.address}`} onClose={() => setM('')} />}
    {m === 'job' && <NewJobModal property={id} onClose={() => setM('')} onCreated={jid => s.go('jobs', jid)} />}
    {m === 'insp' && <BookInspectionModal property={id} onClose={() => setM('')} onBooked={() => setTab('inspections')} />}
    {m === 'list' && <Modal title="List this home to let" sub="It shows on Rightmove and Zoopla. New applicants land in Lettings." onClose={() => setM('')} footer={<><Btn kind="outline" onClick={() => setM('')}>Cancel</Btn><Btn icon={<Megaphone size={16} />} onClick={() => { s.setProperties(ps => ps.map(x => x.id === id ? { ...x, status: x.type === 'HMO' ? 'Partly let' : 'Ready to let' } : x)); s.log(`Listed ${p.address} on Rightmove and Zoopla`, 'Properties'); s.toast('Listed on Rightmove and Zoopla'); setM(''); }}>List now</Btn></>}><KV rows={[['Rent', money(p.rent) + ' pcm'], ['Photos', '12 ready'], ['EPC', certs.find(c => c.kind === 'Energy (EPC)')?.status ?? '—']]} /></Modal>}
  </>;
}

function Occupants({ p }: { p: Property }) {
  const s = useStore();
  const tenants = s.tenants.filter(t => t.property === p.id && t.status !== 'Moved out');
  if (p.type === 'HMO') return <div className="roomgrid">{Array.from({ length: p.rooms ?? 0 }, (_, i) => { const r = `Room ${i + 1}`; const t = tenants.find(x => x.room === r); const ap = s.applicants.find(a => a.property === p.id && a.room === r && !a.rejected && a.stage < 6); return <button key={r} className="kcard roomcard" onClick={() => t ? s.go('tenants', t.id) : ap ? s.go('lettings', ap.id) : s.go('lettings')}>
    <div className="flex between"><b>{r}</b>{t ? <Chip tone={t.status === 'Live' ? 'ok' : 'warn'}>{t.status}</Chip> : <Chip tone="warn">Empty</Chip>}</div>
    {t ? <span className="cell small"><Avatar name={t.name} />{t.name}</span> : ap ? <span className="caption">Applicant: {ap.name}</span> : <span className="caption">Ready to let</span>}
    <span className="caption">{money(Math.round(p.rent / (p.rooms ?? 1)))} pcm</span></button>; })}</div>;
  if (!tenants.length) return <Empty icon={<Users size={22} />}>No tenant yet. This home is in Lettings.</Empty>;
  return <div className="divlist">{tenants.map(t => { const r = s.rent.find(x => x.tenant === t.id); return <button key={t.id} className="item click" onClick={() => s.go('tenants', t.id)}><Avatar name={t.name} /><div className="stack grow"><b>{t.name}</b><span className="caption">Since {t.start} · until {t.end}</span></div>{r && <Chip tone={rentStatus(r).tone}>{rentStatus(r).label}</Chip>}<Chip tone={t.status === 'Live' ? 'ok' : 'warn'}>{t.status}</Chip><ArrowRight size={16} color="#98A2B3" /></button>; })}</div>;
}
