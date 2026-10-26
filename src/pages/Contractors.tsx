import { useState } from 'react';
import { HardHat, PauseCircle, PlayCircle, FileWarning, Receipt, Mail, Phone, Trash2, Upload, Eye, Check, ArrowRight, Star, UserPlus, Send } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { daysFrom, type Contractor } from '../data';
import { SUPERVISOR } from '../data';
import { sendRequest } from './Requests';
import { ActionCard, Avatar, Btn, Card, Chip, DetailHead, DocRow, Field, KV, Kpi, MiniSearch, Modal, Note, PageTabs, Reason, Stat, Tabs, Text, Timeline, UploadModal, Empty } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { DONE_JOB } from './shared';
import { InspTable, JobTable } from './tables';

const stTone = { Active: 'ok', Paused: 'warn', Removed: 'neutral' } as const;
const docIssue = (c: Contractor) => c.kyc.filter(d => d.status === 'Expired' || d.status === 'Missing' || (d.expires && d.expires !== '—' && daysFrom(d.expires) < 60));

export function Contractors() {
  const s = useStore();
  if (s.detail && s.contractors.some(c => c.id === s.detail)) return <ContractorPage id={s.detail} />;
  return <ContractorList />;
}

function ContractorList() {
  const s = useStore();
  const [type, setType] = useState<'all' | 'Trade' | 'Site Inspector'>('all'); const [st, setSt] = useState<'all' | Contractor['status']>('all'); const [q, setQ] = useState(''); const [invite, setInvite] = useState(false);
  const C = s.contractors;
  const list = C.filter(c => (type === 'all' || c.type === type) && (st === 'all' || c.status === st) && (c.name + c.trade + c.contact).toLowerCase().includes(q.toLowerCase()));
  const unpaid = C.flatMap(c => c.bills).filter(b => b.status === 'Unpaid');
  return <>
    <PageHeader crumbs={crumbsFor('contractors', s.go)} title="Contractors" action={<Btn icon={<UserPlus size={18} />} onClick={() => setInvite(true)}>Invite contractor</Btn>} />
    <div className="grid g4">
      <Kpi icon={<HardHat size={18} />} tone="ok" label="Active" value={C.filter(c => c.status === 'Active').length} caption="can get jobs" active={st === 'Active'} onClick={() => setSt('Active')} />
      <Kpi icon={<PauseCircle size={18} />} tone="warn" label="Paused" value={C.filter(c => c.status === 'Paused').length} caption="document expired" active={st === 'Paused'} onClick={() => setSt('Paused')} />
      <Kpi icon={<FileWarning size={18} />} tone="info" label="Documents ending soon" value={C.filter(c => c.status === 'Active' && docIssue(c).length).length} caption="in the next 60 days" onClick={() => setSt('all')} />
      <Kpi icon={<Receipt size={18} />} tone="brand" label="Bills to pay" value={money(unpaid.reduce((a, b) => a + b.amount, 0))} caption={`${unpaid.length} contractor invoices`} />
    </div>
    <Card title="All contractors" sub="Click a contractor to see their documents, jobs and invoices. Pause or remove them from their profile."
      action={<div className="toolbar"><MiniSearch value={q} onChange={setQ} placeholder="Search name or trade" /><Tabs value={type} onChange={setType} items={[{ id: 'all', label: 'All' }, { id: 'Trade', label: 'Trades' }, { id: 'Site Inspector', label: 'Site Inspectors' }]} /></div>}>
      <Tabs value={st} onChange={setSt} items={[{ id: 'all', label: 'Any status', count: C.length }, { id: 'Active', label: 'Active' }, { id: 'Paused', label: 'Paused' }, { id: 'Removed', label: 'Removed' }]} />
      <div className="tablewrap"><table className="t"><thead><tr><th>Contractor</th><th>Trade</th><th>Areas</th><th>Documents</th><th>Jobs</th><th>Rating</th><th>Status</th><th /></tr></thead><tbody>
        {list.map(c => { const iss = docIssue(c); const open = s.jobs.filter(j => j.contractor === c.id && !DONE_JOB.includes(j.status)).length; const done = c.pastJobs + s.jobs.filter(j => j.contractor === c.id && DONE_JOB.includes(j.status)).length; return <tr key={c.id} onClick={() => s.go('contractors', c.id)}>
          <td><span className="cell"><Avatar name={c.name} /><span className="stack"><b className="strong">{c.name}</b><span className="caption">{c.contact} · {c.phone}</span></span></span></td>
          <td>{c.trade}<div className="caption">{c.type}</div></td><td>{c.areas}</td>
          <td>{c.kyc.some(d => d.status === 'Expired') ? <Chip tone="err">Expired</Chip> : iss.length ? <Chip tone="warn">{iss.length} ending soon</Chip> : <Chip tone="ok">All in date</Chip>}</td>
          <td><span className="stack"><b>{done} done</b><span className="caption">{open} open</span></span></td>
          <td><span className="flex" style={{ gap: 4 }}><Star size={13} color="#B45A00" fill="#B45A00" /><b>{c.rating}</b></span></td>
          <td><Chip tone={stTone[c.status]}>{c.status}</Chip></td><td><ArrowRight size={16} color="#98A2B3" /></td></tr>; })}
      </tbody></table>{!list.length && <Empty icon={<HardHat size={22} />}>No contractors match.</Empty>}</div>
    </Card>
    {invite && <InviteModal onClose={() => setInvite(false)} />}
  </>;
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const s = useStore(); const [email, setEmail] = useState(''); const [name, setName] = useState('');
  return <Modal title="Invite a contractor" sub="They get a link to sign up and upload their documents. You check them in Sign-Ups." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Send size={16} />} disabled={!/@/.test(email)} onClick={() => { s.log(`Sent contractor sign-up link to ${name || email}`, 'Contractors'); s.toast(`Sign-up link sent to ${email}`); onClose(); }}>Send invite</Btn></>}>
    <div className="grid g2"><Field label="Business name"><Text value={name} onChange={setName} placeholder="e.g. Ace Plumbing" /></Field><Field label="Email"><Text value={email} onChange={setEmail} placeholder="name@business.co.uk" /></Field></div>
  </Modal>;
}

type CTab = 'overview' | 'kyc' | 'jobs' | 'bills' | 'history';
function ContractorPage({ id }: { id: string }) {
  const s = useStore(); const L = useLookups(); const c = s.contractors.find(x => x.id === id)!;
  const [tab, setTab] = useState<CTab>('overview'); const [m, setM] = useState<'' | 'pause' | 'remove' | 'resume' | `up${number}`>('');
  const jobs = s.jobs.filter(j => j.contractor === id); const open = jobs.filter(j => !DONE_JOB.includes(j.status));
  const insp = s.inspections.filter(i => i.inspector === id);
  const unpaid = c.bills.filter(b => b.status === 'Unpaid');
  const acts = s.activity.filter(a => a.what.includes(c.name) || a.who === c.name);
  const upd = (patch: Partial<Contractor>, msg: string) => { s.setContractors(cs => cs.map(x => x.id === id ? { ...x, ...patch } : x)); s.log(msg, 'Contractors'); s.toast(msg); };
  const expired = c.kyc.filter(d => d.status === 'Expired');
  return <>
    <PageHeader crumbs={crumbsFor('contractors', s.go, c.name)} back={() => s.go('contractors')} title={c.name}
      action={<div className="flex">{c.status !== 'Removed' && <Btn kind="outline" icon={<PauseCircle size={16} />} onClick={() => setM('pause')}>Ask Supervisor to {c.status === 'Paused' ? 'resume or remove' : 'pause or remove'}</Btn>}<Btn kind="outline" icon={<Phone size={16} />} onClick={() => s.toast('Calling ' + c.phone)}>Call</Btn></div>} />
    <DetailHead media={<Avatar name={c.name} size="xl" />} title={c.name}
      chips={<><Chip tone={stTone[c.status]}>{c.status}</Chip><Chip tone="neutral" dot={false}>{c.type}</Chip><Chip tone="info" dot={false}>{c.trade}</Chip></>}
      meta={[['Contact', c.contact], ['Phone', c.phone], ['Email', c.email], ['Working with LSP since', c.joined]]}
      aside={<div className="flex" style={{ gap: 8 }}><Btn sm kind="outline" icon={<Phone size={14} />} onClick={() => s.toast('Calling ' + c.phone)}>Call</Btn><Btn sm kind="outline" icon={<Mail size={14} />} onClick={() => s.toast('Email opened to ' + c.email)}>Email</Btn></div>} />
    {c.status !== 'Active' && c.reason && <Note tone={c.status === 'Paused' ? 'warn' : undefined}>{c.status}: {c.reason}. {c.status === 'Paused' ? 'They can’t be given new jobs until this is fixed.' : ''}</Note>}
    <div className="grid g4"><Stat label="Jobs done" value={c.pastJobs + jobs.filter(j => DONE_JOB.includes(j.status)).length + insp.filter(i => i.status === 'Locked').length} /><Stat label="Open jobs" value={open.length + insp.filter(i => i.status !== 'Locked').length} tone="info" /><Stat label="Rating" value={`★ ${c.rating}`} sub="from Office Admins" /><Stat label="Bills to pay" value={money(unpaid.reduce((a, b) => a + b.amount, 0))} sub={`${unpaid.length} unpaid`} tone={unpaid.length ? 'warn' : 'ok'} /></div>
    <PageTabs value={tab} onChange={setTab} items={[{ id: 'overview', label: 'Overview' }, { id: 'kyc', label: 'KYC & documents', count: c.kyc.length }, { id: 'jobs', label: c.type === 'Site Inspector' ? 'Inspections' : 'Jobs', count: c.type === 'Site Inspector' ? insp.length : jobs.length }, { id: 'bills', label: 'Invoices', count: c.bills.length }, { id: 'history', label: 'History' }]} />
    {tab === 'overview' && <div className="dgrid">
      <div className="col">
        <Card title="Business details"><KV rows={[['Business', c.name], ['Trade', c.trade], ['Address', c.address], ['Areas covered', c.areas], ['Contact', `${c.contact} · ${c.phone}`]]} /></Card>
        <Card title={c.type === 'Site Inspector' ? 'Open inspections' : 'Open jobs'}>{c.type === 'Site Inspector' ? <InspTable list={insp.filter(i => i.status !== 'Locked')} /> : <JobTable list={open} />}</Card>
      </div>
      <div className="col">
        {expired.length ? <ActionCard tone="warn" title="Documents" text={`${expired.map(d => d.name).join(', ')} ended. Upload the new one to un-pause.`}><Btn block icon={<Upload size={16} />} onClick={() => setM(`up${c.kyc.indexOf(expired[0])}`)}>Upload new document</Btn></ActionCard>
          : <ActionCard tone="ok" title="Documents" text="All documents are in date." />}
        <Card title="Document expiry"><div className="divlist">{c.kyc.filter(d => d.expires && d.expires !== '—').map(d => <div key={d.name} className="item"><b className="grow small">{d.name}</b><span className="caption">{d.expires}</span></div>)}</div></Card>
      </div>
    </div>}
    {tab === 'kyc' && <Card title="KYC and documents" sub="Photo ID, right to work, insurance and trade certificates. Replace any document when it is renewed.">
      {c.kyc.map((d, i) => <DocRow key={d.name} name={d.name} status={d.status} meta={`${d.file ?? 'No file'}${d.expires && d.expires !== '—' ? ' · ends ' + d.expires : ''}`}>
        {d.file && <Btn sm kind="ghost" icon={<Eye size={14} />} onClick={() => s.toast('Opening ' + d.file)}>View</Btn>}
        {d.status === 'Uploaded' && <Btn sm kind="success" icon={<Check size={14} />} onClick={() => upd({ kyc: c.kyc.map((z, k) => k === i ? { ...z, status: 'Verified' } : z) }, `Verified ${d.name} for ${c.name}`)}>Verify</Btn>}
        <Btn sm kind="ghost" icon={<Upload size={14} />} onClick={() => setM(`up${i}`)}>Replace</Btn></DocRow>)}
    </Card>}
    {tab === 'jobs' && <Card title={c.type === 'Site Inspector' ? 'Inspections' : 'All jobs'}>{c.type === 'Site Inspector' ? <InspTable list={insp} /> : <JobTable list={jobs} />}</Card>}
    {tab === 'bills' && <Card title="Contractor invoices" sub="What LSP owes this contractor. Contractor costs are only seen by staff.">
      <div className="tablewrap"><table className="t"><thead><tr><th>Invoice</th><th>For</th><th>Date</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>
        {c.bills.map(b => { const j = s.jobs.find(x => x.id === b.job); const i = s.inspections.find(x => x.id === b.job); return <tr key={b.id} style={{ cursor: 'default' }}><td className="strong">{b.id}</td><td>{j ? `${j.title} · ${L.prop(j.property)?.address}` : i ? `${i.kind} inspection · ${L.prop(i.property)?.address}` : 'Earlier work'}</td><td>{b.date}</td><td><b>{money(b.amount)}</b></td><td><Chip tone={b.status === 'Paid' ? 'ok' : 'warn'}>{b.status}</Chip></td>
          <td style={{ textAlign: 'right' }}>{b.status === 'Unpaid' && <Btn sm kind="outline" onClick={() => upd({ bills: c.bills.map(x => x.id === b.id ? { ...x, status: 'Paid' } : x) }, `Paid ${c.name} invoice ${b.id} (${money(b.amount)})`)}>Mark paid</Btn>}</td></tr>; })}
      </tbody></table>{!c.bills.length && <Empty icon={<Receipt size={22} />}>No invoices yet.</Empty>}</div></Card>}
    {tab === 'history' && <Card title="History">{acts.length ? <Timeline items={acts.map(a => ({ at: a.at, text: a.what, by: a.who }))} /> : <span className="caption">Joined {c.joined}. No other activity yet.</span>}</Card>}

    {m === 'pause' && <Reason title={`Ask ${SUPERVISOR} about ${c.name}`} sub="Only the Supervisor can pause, resume or remove a contractor. Say what happened." cta="Send request" options={c.status === 'Paused' ? ['New documents are in, please resume', 'Please remove them'] : ['Complaint from a tenant', 'Poor quality work', 'Not answering calls', 'Please remove them']} onClose={() => setM('')} onDone={r => { sendRequest(s, { kind: 'Pause contractor', title: `${c.status === 'Paused' ? 'Resume or remove' : 'Pause'}: ${c.name}`, about: r, link: { route: 'contractors', id: c.id } }); setM(''); }} />}
    {m.startsWith('up') && (() => { const i = +m.slice(2); const d = c.kyc[i]; return <UploadModal title={`Replace ${d.name}`} sub="The new document is checked and saved. The old one is kept." withExpiry={!!d.expires} cta="Save document" onClose={() => setM('')} onSave={v => { const kyc = c.kyc.map((z, k) => k === i ? { ...z, status: 'Verified' as const, file: v.file, expires: d.expires ? v.expires : undefined } : z); upd({ kyc, ...(c.status === 'Paused' && !kyc.some(z => z.status === 'Expired') ? { status: 'Active' as const, reason: undefined } : {}) }, `New ${d.name} saved for ${c.name}${c.status === 'Paused' && !kyc.some(z => z.status === 'Expired') ? '. Un-paused.' : ''}`); setM(''); }} />; })()}
  </>;
}
