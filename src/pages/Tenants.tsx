import { useState } from 'react';
import { UserCheck, LogOut, DoorOpen, AlertTriangle, Mail, Phone, Bell, PoundSterling, Wrench, Plus, FileSignature, ShieldCheck, ClipboardCheck, ArrowRight, Eye, CalendarClock, CheckCircle2, Wallet, Home } from 'lucide-react';
import { useStore, useLookups, money, rentStatus } from '../store';
import { MONTHS, MOVE_OUT_STEPS, fmtDate, nowStamp, parseDate, type Comm, type RentRow, type Tenant, type TenantStatus } from '../data';
import { ME_NAME } from '../data';
import { ActionCard, Avatar, Btn, Card, Chip, CommsLog, DetailHead, DocRow, Field, HSteps, KV, Kpi, MiniSearch, Modal, Note, PageTabs, Select, Stat, Tabs, Text, Area, Empty, sortComms, dateLabel } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { BookInspectionModal, HomeCard, NewJobModal, PaymentModal, adminName, firstName } from './shared';
import { JobTable, certTone } from './tables';

const statusTone = (st: TenantStatus) => ({ Live: 'ok', 'Moving out': 'warn', 'Moved out': 'neutral' } as const)[st];

export function Tenants() {
  const s = useStore();
  if (s.detail && s.tenants.some(t => t.id === s.detail)) return <TenantPage id={s.detail} />;
  return <TenantList />;
}

function TenantList() {
  const s = useStore(); const L = useLookups();
  const [tab, setTab] = useState<'all' | TenantStatus>('Live'); const [q, setQ] = useState('');
  const T = s.tenants;
  const list = T.filter(t => (tab === 'all' || t.status === tab) && (t.name + (L.prop(t.property)?.address ?? '')).toLowerCase().includes(q.toLowerCase()));
  const late = s.rent.filter(r => rentStatus(r).tone === 'err');
  return <>
    <PageHeader crumbs={crumbsFor('tenants', s.go)} title="Tenants" action={<Btn kind="outline" icon={<UserCheck size={16} />} onClick={() => s.go('lettings')}>New tenants come from Lettings</Btn>} />
    <div className="grid g4">
      <Kpi icon={<UserCheck size={18} />} tone="ok" label="Live tenants" value={T.filter(t => t.status === 'Live').length} caption="living in LSP homes" active={tab === 'Live'} onClick={() => setTab('Live')} />
      <Kpi icon={<DoorOpen size={18} />} tone="warn" label="Moving out" value={T.filter(t => t.status === 'Moving out').length} caption="notice given" active={tab === 'Moving out'} onClick={() => setTab('Moving out')} />
      <Kpi icon={<LogOut size={18} />} tone="neutral" label="Moved out" value={T.filter(t => t.status === 'Moved out').length} caption="this year" active={tab === 'Moved out'} onClick={() => setTab('Moved out')} />
      <Kpi icon={<AlertTriangle size={18} />} tone="err" label="Rent late" value={late.length} caption={money(late.reduce((a, r) => a + r.amount - r.paid, 0)) + ' owed'} onClick={() => s.go('rent')} />
    </div>
    <Card title="Tenants" sub="Click a tenant to see their KYC, rent, home, messages and issues."
      action={<div className="toolbar"><MiniSearch value={q} onChange={setQ} placeholder="Search name or home" /><Tabs value={tab} onChange={setTab} items={[{ id: 'Live', label: 'Live', count: T.filter(t => t.status === 'Live').length }, { id: 'Moving out', label: 'Moving out', count: T.filter(t => t.status === 'Moving out').length }, { id: 'Moved out', label: 'Moved out', count: T.filter(t => t.status === 'Moved out').length }, { id: 'all', label: 'All', count: T.length }]} /></div>}>
      <div className="tablewrap"><table className="t"><thead><tr><th>Tenant</th><th>Home</th><th>Rent this month</th><th>Tenancy</th><th>Office Admin</th><th>Status</th></tr></thead><tbody>
        {list.map(t => { const p = L.prop(t.property); const r = s.rent.find(x => x.tenant === t.id); const rs = r ? rentStatus(r) : null; return <tr key={t.id} onClick={() => s.go('tenants', t.id)}>
          <td><span className="cell"><Avatar name={t.name} /><span className="stack"><b className="strong">{t.name}</b><span className="caption">{t.email}</span></span></span></td>
          <td>{p?.address}{t.room && <div className="caption">{t.room}</div>}</td>
          <td><span className="stack" style={{ gap: 4 }}><b>{money(t.rent)}</b>{rs ? <Chip tone={rs.tone}>{rs.label}</Chip> : <span className="caption">{t.status === 'Moved out' ? 'Ended' : '—'}</span>}</span></td>
          <td><span className="stack"><b className="small" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.start} – {t.end}</b><span className="caption">{t.status === 'Moving out' ? 'Leaving ' + t.moveOut?.date : t.status === 'Moved out' ? 'Left ' + t.moveOut?.date : 'Rent day: ' + t.rentDay}</span></span></td>
          <td><span className="cell"><Avatar id={p?.admin} />{adminName(p?.admin)}</span></td>
          <td><Chip tone={statusTone(t.status)}>{t.status}</Chip></td></tr>; })}
      </tbody></table>{!list.length && <Empty>No tenants here.</Empty>}</div>
    </Card>
  </>;
}

/** Last 6 months of rent for a tenant, newest first. */
export function rentLedger(t: Tenant, row?: RentRow) {
  const start = parseDate(t.start); const end = parseDate(t.end);
  const out: { month: string; due: string; amount: number; paid: number; on: string; label: string; tone: ReturnType<typeof rentStatus>['tone']; current?: boolean }[] = [];
  for (let k = 5; k >= 1; k--) {
    const d = new Date(2026, 9 - k, Math.min(t.rentDay, 28));
    if (d < new Date(start.getFullYear(), start.getMonth(), 1) || d > end) continue;
    out.push({ month: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, due: fmtDate(d), amount: t.rent, paid: t.rent, on: fmtDate(d), label: 'Paid', tone: 'ok' });
  }
  if (row) { const st = rentStatus(row); out.push({ month: row.month, due: row.due, amount: row.amount, paid: row.paid, on: row.history.length ? row.history[row.history.length - 1].date : '—', label: st.label, tone: st.tone, current: true }); }
  return out.reverse();
}

type TTab = 'overview' | 'rent' | 'kyc' | 'home' | 'comms' | 'issues' | 'moveout';
function TenantPage({ id }: { id: string }) {
  const s = useStore(); const L = useLookups(); const t = s.tenants.find(x => x.id === id)!;
  const [tab, setTab] = useState<TTab>(t.status === 'Live' ? 'overview' : 'moveout');
  const [m, setM] = useState<'' | 'moveout' | 'pay' | 'issue' | 'insp' | 'deposit' | 'gone'>('');
  const p = L.prop(t.property); const ll = L.landlord(p?.owner);
  const row = s.rent.find(r => r.tenant === id); const rs = row ? rentStatus(row) : null; const owed = row ? row.amount - row.paid : 0;
  const issues = s.jobs.filter(j => j.tenant === id || (j.property === t.property && j.by.includes(t.name)));
  const openIssues = issues.filter(j => !['Approved', 'Invoiced', 'Declined'].includes(j.status));
  const certs = s.safety.filter(c => c.property === t.property);
  const moveInInsp = s.inspections.find(i => i.property === t.property && i.kind === 'Move-in' && (!t.room || i.room === t.room || i.scope === 'Whole property'));
  const nextDue = t.status === 'Moved out' ? '—' : fmtDate(new Date(2026, 10, Math.min(t.rentDay, 28)));
  const upd = (patch: Partial<Tenant>, msg: string, ...comms: Comm[]) => { s.setTenants(ts => ts.map(x => x.id === id ? { ...x, ...patch, comms: [...x.comms, ...comms] } : x)); s.log(msg, 'Tenants'); s.toast(msg); };
  const sys = (text: string): Comm => ({ id: 'cm' + Date.now() + Math.random(), at: nowStamp(), by: ME_NAME, channel: 'System', text });
  const remind = () => { if (!row) return; s.setRent(rs2 => rs2.map(x => x.id === row.id ? { ...x, reminders: [{ at: nowStamp(), by: ME_NAME }, ...x.reminders] } : x)); upd({}, `Rent reminder sent to ${t.name}`, { id: 'cm' + Date.now(), at: nowStamp(), by: ME_NAME, channel: 'Email', dir: 'out', subject: 'Rent reminder', text: `${money(owed)} rent is ${rs?.tone === 'err' ? 'late' : 'due'}. Please pay as soon as you can.` }); };
  const mo = t.moveOut;
  const tabs: { id: TTab; label: string; count?: number }[] = [{ id: 'overview', label: 'Overview' }, { id: 'rent', label: 'Rent' }, { id: 'kyc', label: 'KYC & documents' }, { id: 'home', label: 'Home' }, { id: 'comms', label: 'Communication', count: t.comms.length }, { id: 'issues', label: 'Issues', count: issues.length }, ...(mo ? [{ id: 'moveout' as TTab, label: 'Move-out' }] : [])];
  return <>
    <PageHeader crumbs={crumbsFor('tenants', s.go, t.name)} back={() => s.go('tenants')} title={t.name}
      action={<div className="flex">{t.status !== 'Moved out' && <Btn kind="outline" icon={<Wrench size={16} />} onClick={() => setM('issue')}>Log an issue</Btn>}{t.status === 'Live' && <Btn icon={<DoorOpen size={16} />} onClick={() => setM('moveout')}>Schedule move-out</Btn>}</div>} />
    <DetailHead media={<Avatar name={t.name} size="xl" />} title={t.name}
      chips={<><Chip tone={statusTone(t.status)}>{t.status}</Chip>{t.applicant && <Chip tone="neutral" dot={false}>Came from Lettings</Chip>}</>}
      meta={[['Lives at', `${p?.address}${t.room ? ' · ' + t.room : ''}`], ['Rent', money(t.rent) + ' pcm'], ['Tenancy', `${t.start} – ${t.end}`], ['Office Admin', adminName(p?.admin)]]}
      aside={<div className="flex" style={{ gap: 8 }}><Btn sm kind="outline" icon={<Phone size={14} />} onClick={() => s.toast('Calling ' + t.phone)}>Call</Btn><Btn sm kind="outline" icon={<Mail size={14} />} onClick={() => setTab('comms')}>Email</Btn></div>} />
    <div className="grid g4">
      <Stat label="Rent this month" value={rs ? rs.label : '—'} sub={row ? `${money(row.paid)} of ${money(row.amount)} paid` : 'No rent due'} tone={rs?.tone} />
      <Stat label="Owed now" value={money(owed)} sub={owed ? 'carries forward' : 'nothing owed'} tone={owed ? 'err' : 'ok'} />
      <Stat label="Next rent due" value={nextDue} sub={t.status === 'Moved out' ? 'tenancy ended' : money(t.rent)} />
      <Stat label="Open issues" value={openIssues.length} sub={`${issues.length} reported in total`} tone={openIssues.length ? 'warn' : 'ok'} />
    </div>
    <PageTabs value={tab} onChange={setTab} items={tabs} />

    {tab === 'overview' && <div className="dgrid">
      <div className="col">
        <div className="grid g2">
          <Card title="Personal details"><KV rows={[['Email', t.email], ['Phone', t.phone], ['Work', t.employment], ['Emergency contact', t.emergency]]} /></Card>
          <Card title="Tenancy"><KV rows={[['Start', t.start], ['End', t.end], ['Rent', `${money(t.rent)} on day ${t.rentDay}`], ['Deposit', `${money(t.deposit)} · ${t.depositScheme}`], ['Deposit ref', t.depositRef], ['Landlord', ll?.name ?? '—']]} /></Card>
        </div>
        <Card title="Latest communication" action={<Btn sm kind="ghost" onClick={() => setTab('comms')}>See all</Btn>}><CommsLog items={sortComms(t.comms).slice(0, 3)} emptyText="Nothing yet." /></Card>
      </div>
      <div className="col">
        {t.status === 'Live' && (owed > 0 ? <ActionCard tone="warn" title="Rent" text={`${money(owed)} is ${rs?.tone === 'err' ? 'late' : 'due'}. Send a reminder or record a payment.`}><Btn block icon={<Bell size={16} />} onClick={remind}>Send rent reminder</Btn><Btn block kind="outline" icon={<PoundSterling size={16} />} onClick={() => setM('pay')}>Record payment</Btn></ActionCard>
          : <ActionCard tone="ok" title="All good" text={`Rent is paid. Next rent of ${money(t.rent)} is due on ${nextDue}.`} />)}
        {t.status === 'Moving out' && mo && <ActionCard tone="warn" title="Moving out" text={`Leaving on ${mo.date}. Next: ${MOVE_OUT_STEPS[mo.step + 1] ?? 'done'}.`}><Btn block onClick={() => setTab('moveout')}>Open move-out</Btn></ActionCard>}
        {t.status === 'Moved out' && mo && <ActionCard tone="neutral" title="Moved out" text={`Left on ${mo.date}. Deposit returned${mo.deduction ? ` with ${money(mo.deduction)} kept for ${mo.deductionNote?.toLowerCase()}` : ' in full'}.`} />}
        <Card title="Open issues" action={<Btn sm kind="ghost" onClick={() => setTab('issues')}>See all</Btn>}>{openIssues.length ? <div className="divlist">{openIssues.map(j => <button key={j.id} className="item click" onClick={() => s.go('jobs', j.id)}><span className="tile t-info"><Wrench size={16} /></span><div className="stack grow"><b>{j.title}</b><span className="caption">{j.reported}</span></div><Chip tone="info">{j.status}</Chip></button>)}</div> : <span className="caption">No open issues.</span>}</Card>
      </div>
    </div>}

    {tab === 'rent' && <div className="dgrid">
      <Card title="Rent history" sub="Every month with what was due and what came in.">
        <div className="tablewrap"><table className="t"><thead><tr><th>Month</th><th>Due</th><th>Rent</th><th>Paid</th><th>Paid on</th><th>Status</th></tr></thead><tbody>
          {rentLedger(t, row).map(r => <tr key={r.month} style={{ cursor: 'default' }}><td className="strong">{r.month}{r.current && <div className="caption">This month</div>}</td><td>{r.due}</td><td>{money(r.amount)}</td><td>{money(r.paid)}</td><td>{r.on}</td><td><Chip tone={r.tone}>{r.label}</Chip></td></tr>)}
        </tbody></table></div>
      </Card>
      <div className="col">
        <ActionCard title="This month" tone={owed ? 'warn' : 'ok'} text={row ? `${money(row.paid)} of ${money(row.amount)} paid. ${owed ? money(owed) + ' still owed.' : 'Paid in full.'}` : 'No rent this month.'}>
          {owed > 0 && <><Btn block icon={<PoundSterling size={16} />} onClick={() => setM('pay')}>Record payment</Btn><Btn block kind="outline" icon={<Bell size={16} />} onClick={remind}>Send reminder</Btn></>}
          {row && <Btn block kind="ghost" icon={<ArrowRight size={16} />} onClick={() => s.go('rent', row.id)}>Open rent account</Btn>}
        </ActionCard>
        <Card title="Reminders sent">{row?.reminders.length ? <div className="divlist">{row.reminders.map((r, i) => <div key={i} className="item"><Bell size={15} color="#667085" /><b className="grow small">{r.by === 'System' ? 'Automatic email' : 'Sent by ' + r.by}</b><span className="caption">{r.at}</span></div>)}</div> : <span className="caption">No reminders this month.</span>}</Card>
      </div>
    </div>}

    {tab === 'kyc' && <div className="dgrid">
      <Card title="KYC documents" sub="Checked during Lettings. Kept for the whole tenancy.">{t.kyc.map(d => <DocRow key={d.name} name={d.name} status={d.status} meta={d.file ? `${d.file} · ${d.at ?? ''}` : 'Not on file'}><Btn sm kind="ghost" icon={<Eye size={14} />} onClick={() => s.toast('Opening ' + d.name)}>View</Btn></DocRow>)}</Card>
      <Card title="Tenancy documents">
        <DocRow name="Tenancy agreement" meta={`Signed by everyone · starts ${t.start}`}><Btn sm kind="ghost" icon={<FileSignature size={14} />} onClick={() => s.toast('Opening agreement')}>View</Btn></DocRow>
        <DocRow name={`Deposit certificate · ${t.depositScheme}`} meta={`Reference ${t.depositRef} · ${money(t.deposit)}`}><Btn sm kind="ghost" icon={<ShieldCheck size={14} />} onClick={() => s.toast('Opening deposit certificate')}>View</Btn></DocRow>
        <DocRow name="Move-in inspection report" meta={moveInInsp ? `${moveInInsp.date}, ${moveInInsp.time}` : 'Kept in Inspections'}>{moveInInsp && <Btn sm kind="ghost" icon={<ClipboardCheck size={14} />} onClick={() => s.go('inspections', moveInInsp.id)}>Open</Btn>}</DocRow>
        <DocRow name="How to Rent guide and gas certificate" meta={`Sent on ${t.start}`} />
      </Card>
    </div>}

    {tab === 'home' && <div className="dgrid">
      <div className="col">
        <Card title="Where they live" action={<Btn sm kind="ghost" icon={<ArrowRight size={14} />} onClick={() => s.go('properties', t.property)}>Open property</Btn>}>
          <div className="row" style={{ gap: 16 }}><div className="photo" style={{ width: 260, height: 170, flex: 'none', backgroundImage: `url(${p?.photo})` }} />
            <KV rows={[['Address', p?.address ?? ''], ['Area', p?.area ?? ''], ['Their room', t.room ?? 'Whole home'], ['Type', p?.type === 'HMO' ? `Shared house · ${p.rooms} rooms` : `${p?.beds} bed ${p?.type.toLowerCase()}`], ['Bathrooms', String(p?.baths ?? 1)], ['Landlord', ll?.name ?? '—']]} /></div>
        </Card>
        <Card title="Safety checks for this home">{certs.length ? <div className="grid g2">{certs.map(c => <button key={c.id} className="lrow click" onClick={() => s.go('safety', c.id)}><ShieldCheck size={18} color="var(--text-brand)" /><div className="stack grow"><b>{c.kind}</b><span className="caption">{c.status === 'Missing' ? 'No certificate' : 'Ends ' + c.expires}</span></div><Chip tone={certTone(c.status)}>{c.status}</Chip></button>)}</div> : <Empty>No certificates.</Empty>}</Card>
      </div>
      <HomeCard id={t.property} />
    </div>}

    {tab === 'comms' && <Card title="Communication" sub="Every call, email, portal message and note between LSP and this tenant."><CommsLog items={t.comms} to={t.email} onAdd={t.status !== 'Moved out' ? c => upd({}, c.channel === 'Email' ? `Emailed ${t.name}` : `Saved ${c.channel.toLowerCase()} for ${t.name}`, c) : undefined} /></Card>}

    {tab === 'issues' && <Card title="Issues raised" sub="Repairs the tenant reported and how they were fixed." action={t.status !== 'Moved out' && <Btn sm icon={<Plus size={14} />} onClick={() => setM('issue')}>Log an issue</Btn>}><JobTable list={issues} hideHome /></Card>}

    {tab === 'moveout' && mo && <>
      <Card><HSteps items={MOVE_OUT_STEPS} at={mo.step === 4 ? 5 : mo.step + 1} /></Card>
      <div className="dgrid">
        <div className="col">
          <Card title="Move-out details"><KV rows={[['Notice received', mo.notice], ['Leaving on', mo.date], ['Reason', mo.reason], ['Deposit held', `${money(t.deposit)} · ${t.depositScheme} ${t.depositRef}`], ...(mo.deduction != null ? [['Kept from deposit', `${money(mo.deduction)} · ${mo.deductionNote}`] as [string, string]] : [])]} /></Card>
          <Card title="Move-out inspection">{(() => { const i = s.inspections.find(x => x.property === t.property && x.kind === 'Move-out' && (!t.room || x.room === t.room || x.scope === 'Whole property')); return i ? <button className="lrow click" onClick={() => s.go('inspections', i.id)}><ClipboardCheck size={18} color="var(--text-brand)" /><div className="stack grow"><b>{i.date}, {i.time}</b><span className="caption">{L.contractor(i.inspector)?.name ?? 'No inspector yet'} · {i.status}</span></div><ArrowRight size={16} color="#98A2B3" /></button> : <span className="caption">Not booked yet.</span>; })()}</Card>
        </div>
        <div className="col">
          {mo.step === 0 && <ActionCard text="Book the move-out inspection for the last day."><Btn block icon={<CalendarClock size={16} />} onClick={() => setM('insp')}>Book move-out inspection</Btn></ActionCard>}
          {mo.step === 1 && <ActionCard text="When the inspector has visited and uploaded the report, mark it done."><Btn block icon={<CheckCircle2 size={16} />} onClick={() => upd({ moveOut: { ...mo, step: 2 } }, `Move-out inspection done for ${t.name}`, sys('Move-out inspection done.'))}>Inspection done</Btn></ActionCard>}
          {mo.step === 2 && <ActionCard text="Agree any deductions, then return the deposit through the scheme."><Btn block icon={<Wallet size={16} />} onClick={() => setM('deposit')}>Return deposit</Btn></ActionCard>}
          {mo.step === 3 && <ActionCard text="Keys back and meters read? Mark the tenant as moved out."><Btn block icon={<LogOut size={16} />} onClick={() => setM('gone')}>Mark moved out</Btn></ActionCard>}
          {mo.step === 4 && <ActionCard tone="neutral" title="Done" text={`${firstName(t.name)} moved out on ${mo.date}. The home is back in Lettings.`}><Btn block kind="outline" icon={<Home size={16} />} onClick={() => s.go('lettings')}>Go to Lettings</Btn></ActionCard>}
        </div>
      </div></>}

    {m === 'moveout' && <MoveOutModal t={t} onClose={() => setM('')} onDone={() => setTab('moveout')} />}
    {m === 'pay' && row && <PaymentModal title={`Record rent from ${t.name}`} owed={owed} onClose={() => setM('')} onSave={(a, d, n) => { s.setRent(rs2 => rs2.map(x => x.id === row.id ? { ...x, paid: Math.min(x.amount, x.paid + a), history: [...x.history, { date: d, amount: a, note: n }] } : x)); s.log(`Recorded ${money(a)} rent from ${t.name}`, 'Rent & Invoices'); s.toast(`${money(a)} saved`); setM(''); }} />}
    {m === 'issue' && <NewJobModal property={t.property} tenant={id} onClose={() => setM('')} onCreated={() => setTab('issues')} />}
    {m === 'insp' && mo && <BookInspectionModal property={t.property} kind="Move-out" room={t.room} onClose={() => setM('')} onBooked={() => upd({ moveOut: { ...mo, step: 1 } }, `Move-out inspection booked for ${t.name}`, sys('Move-out inspection booked.'))} />}
    {m === 'deposit' && mo && <DepositModal t={t} onClose={() => setM('')} onSave={(d, note) => { upd({ moveOut: { ...mo, step: 3, deduction: d, deductionNote: note || 'No deductions' } }, `Deposit returned to ${t.name}: ${money(t.deposit - d)}`, { id: 'cm' + Date.now(), at: nowStamp(), by: ME_NAME, channel: 'Email', dir: 'out', subject: 'Your deposit', text: `${money(t.deposit - d)} returned through ${t.depositScheme}.${d ? ` ${money(d)} kept: ${note}.` : ''}` }); setM(''); }} />}
    {m === 'gone' && mo && <Modal title={`Mark ${t.name} as moved out?`} sub="Their portal login stops. The home goes back to Lettings." onClose={() => setM('')} footer={<><Btn kind="outline" onClick={() => setM('')}>Cancel</Btn><Btn kind="danger" icon={<LogOut size={16} />} onClick={() => { upd({ status: 'Moved out', moveOut: { ...mo, step: 4 } }, `${t.name} moved out of ${p?.address}`, sys('Moved out. Portal login ended.')); s.setProperties(ps => ps.map(x => x.id === t.property ? { ...x, status: x.type === 'HMO' ? 'Partly let' : 'Ready to let' } : x)); setM(''); }}>Mark moved out</Btn></>}><Note>Keys returned, meters read and the deposit is settled.</Note></Modal>}
  </>;
}

function MoveOutModal({ t, onClose, onDone }: { t: Tenant; onClose: () => void; onDone: () => void }) {
  const s = useStore(); const [notice, setNotice] = useState('2026-10-15'); const [date, setDate] = useState('2026-11-14'); const [why, setWhy] = useState('Tenant gave notice'); const [note, setNote] = useState('');
  return <Modal title={`Schedule move-out for ${t.name}`} sub="The tenant status changes to Moving out. You then book the inspection and return the deposit." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<DoorOpen size={16} />} onClick={() => {
      s.setTenants(ts => ts.map(x => x.id === t.id ? { ...x, status: 'Moving out', moveOut: { notice: dateLabel(notice), date: dateLabel(date), reason: why + (note ? ` · ${note}` : ''), step: 0 }, comms: [...x.comms, { id: 'cm' + Date.now(), at: nowStamp(), by: ME_NAME, channel: 'System', text: `Move-out scheduled for ${dateLabel(date)}.` }] } : x));
      s.log(`Scheduled move-out for ${t.name} on ${dateLabel(date)}`, 'Tenants'); s.toast(`${t.name} is now Moving out`); onClose(); onDone();
    }}>Schedule move-out</Btn></>}>
    <div className="grid g2"><Field label="Notice received on"><input className="input" type="date" value={notice} onChange={e => setNotice(e.target.value)} /></Field><Field label="Last day in the home"><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field></div>
    <Field label="Why"><Select value={why} onChange={setWhy} options={['Tenant gave notice', 'End of fixed term', 'Landlord selling', 'Moving for work', 'Rent arrears'].map(x => ({ value: x, label: x }))} /></Field>
    <Field label="Note (optional)"><Area value={note} onChange={setNote} /></Field>
    <Note>Tenants usually give one month's notice. The landlord gets an email.</Note>
  </Modal>;
}

function DepositModal({ t, onClose, onSave }: { t: Tenant; onClose: () => void; onSave: (deduction: number, note: string) => void }) {
  const [d, setD] = useState('0'); const [note, setNote] = useState(''); const v = Math.max(0, Math.min(t.deposit, +d || 0));
  return <Modal title="Return the deposit" sub={`Held with ${t.depositScheme}, reference ${t.depositRef}.`} onClose={onClose} footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Wallet size={16} />} disabled={v > 0 && !note.trim()} onClick={() => onSave(v, note.trim())}>Return {money(t.deposit - v)}</Btn></>}>
    <KV rows={[['Deposit held', money(t.deposit)]]} />
    <div className="grid g2"><Field label="Keep for damage or cleaning (£)"><Text value={d} onChange={setD} /></Field><Field label="What for"><Text value={note} onChange={setNote} placeholder="e.g. Carpet clean" /></Field></div>
    <Note tone={v ? 'warn' : 'ok'}>{v ? `${money(t.deposit - v)} goes back to ${t.name}. ${money(v)} is kept, with the reason.` : `The full ${money(t.deposit)} goes back to ${t.name}.`}</Note>
  </Modal>;
}
