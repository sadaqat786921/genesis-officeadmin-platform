import { useState } from 'react';
import { ShieldCheck, AlertTriangle, CalendarDays, FileWarning, CheckCircle2, Upload, Bell, UserPlus, Eye, Download, History as HistoryIcon, ArrowRight, Grid3x3, List } from 'lucide-react';
import { useStore, useLookups } from '../store';
import { CERT_KINDS, type SafetyCert } from '../data';
import { ME_NAME } from '../data';
import { ActionCard, Avatar, Btn, Card, Chip, DetailHead, DocRow, HSteps, KV, Kpi, MiniSearch, Note, Reason, Tabs, Timeline, UploadModal, Empty } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { AssignContractorModal, HomeCard, adminName } from './shared';
import { CertTable, certTone, daysText, remindCert, saveCert } from './tables';

export function Safety() {
  const s = useStore();
  if (s.detail && s.safety.some(c => c.id === s.detail)) return <CertPage id={s.detail} />;
  return <Centre />;
}

function Centre() {
  const s = useStore(); const L = useLookups();
  const [view, setView] = useState<'matrix' | 'list'>('matrix'); const [f, setF] = useState<'action' | 'Overdue' | 'Missing' | 'soon' | 'all'>('action'); const [q, setQ] = useState('');
  const C = s.safety; const props = s.properties.filter(p => p.managed);
  const valid = C.filter(c => c.status === 'Valid').length; const score = Math.round(valid / C.length * 100);
  const list = C.filter(c => (f === 'all' ? true : f === 'action' ? c.status !== 'Valid' : f === 'soon' ? ['Due soon', 'Booked', 'Proof to check'].includes(c.status) : c.status === f) && ((L.prop(c.property)?.address ?? '') + c.kind).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.days - b.days);
  return <>
    <PageHeader crumbs={crumbsFor('safety', s.go)} title="Compliance Centre" />
    <div className="grid g4">
      <Kpi icon={<ShieldCheck size={18} />} tone={score >= 85 ? 'ok' : 'warn'} label="Compliance score" value={score + '%'} caption={`${valid} of ${C.length} certificates in date`} active={f === 'all'} onClick={() => { setView('list'); setF('all'); }} />
      <Kpi icon={<AlertTriangle size={18} />} tone="err" label="Overdue" value={C.filter(c => c.status === 'Overdue').length} caption="legal risk, act now" active={f === 'Overdue'} onClick={() => { setView('list'); setF('Overdue'); }} />
      <Kpi icon={<FileWarning size={18} />} tone="warn" label="Missing documents" value={C.filter(c => c.status === 'Missing').length} caption="no certificate on file" active={f === 'Missing'} onClick={() => { setView('list'); setF('Missing'); }} />
      <Kpi icon={<CalendarDays size={18} />} tone="info" label="Ending in 30 days" value={C.filter(c => ['Due soon', 'Booked', 'Proof to check'].includes(c.status)).length} caption="booked or to book" active={f === 'soon'} onClick={() => { setView('list'); setF('soon'); }} />
    </div>
    <div className="toolbar"><Tabs value={view} onChange={setView} items={[{ id: 'matrix', label: <span className="flex" style={{ gap: 6 }}><Grid3x3 size={14} />By property</span> }, { id: 'list', label: <span className="flex" style={{ gap: 6 }}><List size={14} />All certificates</span> }]} /><div className="grow" /><div className="legendrow">{(['Valid', 'Due soon', 'Booked', 'Proof to check', 'Overdue', 'Missing'] as const).map(st => <span key={st} className="legend"><i className={`lg-${certTone(st)}`} />{st}</span>)}</div></div>
    {view === 'matrix' ? <Card title="Every property at a glance" sub="Each box is one certificate. Click it to upload, replace, book or remind. Grey boxes are not needed for that home.">
      <div className="tablewrap"><table className="t matrix"><thead><tr><th>Property</th>{CERT_KINDS.map(k => <th key={k}>{k}</th>)}<th>Score</th></tr></thead><tbody>
        {props.map(p => { const pc = C.filter(c => c.property === p.id); const ok = pc.filter(c => c.status === 'Valid').length; return <tr key={p.id} style={{ cursor: 'default' }}>
          <td><button className="cell link" style={{ fontWeight: 600, color: 'var(--text-primary)' }} onClick={() => s.go('properties', p.id)}><div className="photo" style={{ width: 40, height: 30, flex: 'none', backgroundImage: `url(${p.photo})`, borderRadius: 6 }} /><span className="stack" style={{ textAlign: 'left' }}><b>{p.address}</b><span className="caption">{L.ownerName(p)} · {adminName(p.admin)}</span></span></button></td>
          {CERT_KINDS.map(k => { const c = pc.find(x => x.kind === k); return <td key={k}>{c ? <button className={`mcell c-${certTone(c.status)}`} onClick={() => s.go('safety', c.id)}><b>{c.status}</b><span>{c.status === 'Missing' ? 'Upload now' : c.expires}</span></button> : <span className="mcell c-na">Not needed</span>}</td>; })}
          <td><b style={{ color: ok === pc.length ? 'var(--ok)' : 'var(--warn)' }}>{ok}/{pc.length}</b></td></tr>; })}
      </tbody></table></div></Card>
      : <Card title="Certificates" sub="When each was done, when it ends and what to do next." action={<div className="toolbar"><MiniSearch value={q} onChange={setQ} placeholder="Search home or certificate" /><Tabs value={f} onChange={setF} items={[{ id: 'action', label: 'Needs action', count: C.filter(c => c.status !== 'Valid').length }, { id: 'Overdue', label: 'Overdue' }, { id: 'Missing', label: 'Missing' }, { id: 'soon', label: 'Ending soon' }, { id: 'all', label: 'All', count: C.length }]} /></div>}>
        <CertTable list={list} /></Card>}
  </>;
}

const STEPS = ['Reminder sent', 'Contractor booked', 'Certificate uploaded', 'Checked and in date'];
function CertPage({ id }: { id: string }) {
  const s = useStore(); const L = useLookups(); const c = s.safety.find(x => x.id === id)!;
  const [m, setM] = useState<'' | 'upload' | 'book' | 'fault'>('');
  const p = L.prop(c.property); const k = L.contractor(c.contractor);
  const at = c.status === 'Valid' ? 4 : c.status === 'Proof to check' ? 3 : c.status === 'Booked' ? 2 : c.reminders.length ? 1 : 0;
  const upd = (patch: Partial<SafetyCert>, msg: string) => { s.setSafety(cs => cs.map(x => x.id === id ? { ...x, ...patch } : x)); s.log(msg, 'Safety'); s.toast(msg); };
  const trade = c.kind === 'Gas safety' ? 'Gas' : c.kind === 'Electrical (EICR)' || c.kind === 'Fire alarm' ? 'Electric' : undefined;
  return <>
    <PageHeader crumbs={crumbsFor('safety', s.go, `${c.kind} · ${p?.address}`)} back={() => s.go('safety')} title={c.kind}
      action={<div className="flex"><Btn kind="outline" icon={<Bell size={16} />} onClick={() => remindCert(s, L, c)}>Remind landlord</Btn><Btn icon={<Upload size={16} />} onClick={() => setM('upload')}>{c.file ? 'Replace certificate' : 'Upload certificate'}</Btn></div>} />
    <DetailHead media={<span className={`tile t-${certTone(c.status)}`} style={{ width: 64, height: 64, borderRadius: 18 }}><ShieldCheck size={28} /></span>} title={`${c.kind} · ${p?.address}`}
      chips={<Chip tone={certTone(c.status)}>{c.status}</Chip>}
      meta={[['Done on', c.issued ?? 'Never'], ['Ends on', c.issued ? c.expires : '—'], ['Time left', daysText(c)], ['Office Admin', adminName(p?.admin)]]} />
    <Card><HSteps items={STEPS} at={at} /></Card>
    {c.status === 'Overdue' && <Note tone="err">This home is not legally covered. Book a qualified contractor today.</Note>}
    {c.status === 'Missing' && <Note tone="err">There is no {c.kind} certificate on file for this home. Upload it, or book a contractor.</Note>}
    <div className="dgrid">
      <div className="col">
        <Card title="Current certificate">{c.file ? <DocRow name={c.file} status={c.status === 'Proof to check' ? 'Uploaded' : 'Verified'} meta={`Done ${c.issued} · ends ${c.expires}${k ? ' · by ' + k.name : ''}`}><Btn sm kind="ghost" icon={<Eye size={14} />} onClick={() => s.toast('Opening ' + c.file)}>View</Btn><Btn sm kind="ghost" icon={<Download size={14} />} onClick={() => s.toast('Downloaded ' + c.file)}>Download</Btn><Btn sm kind="ghost" icon={<Upload size={14} />} onClick={() => setM('upload')}>Replace</Btn></DocRow> : <Empty icon={<FileWarning size={22} />}>No certificate uploaded.</Empty>}
          {c.status === 'Proof to check' && <div className="flex"><Btn kind="success" icon={<CheckCircle2 size={16} />} onClick={() => upd({ status: c.days > 30 ? 'Valid' : 'Due soon', history: c.history }, `${c.kind} certificate checked for ${p?.address}. In date until ${c.expires}.`)}>Certificate is correct</Btn><Btn kind="outline" icon={<AlertTriangle size={16} />} onClick={() => setM('fault')}>Fault found</Btn></div>}
        </Card>
        <Card title="Previous certificates" sub="Old certificates are kept when a new one is uploaded.">{c.history.length ? <div className="divlist">{c.history.map((h, i) => <div key={i} className="item"><HistoryIcon size={16} color="#667085" /><div className="stack grow"><b>{h.file}</b><span className="caption">Done {h.issued} · ended {h.expires} · {h.by}</span></div><Btn sm kind="ghost" icon={<Eye size={14} />} onClick={() => s.toast('Opening ' + h.file)}>View</Btn></div>)}</div> : <span className="caption">No earlier certificates.</span>}</Card>
        <Card title="Reminders sent" sub="Automatic reminders start 60 days before the end date.">{c.reminders.length ? <Timeline items={c.reminders.map(r => ({ at: r.at, text: `Reminder sent to ${r.to}` }))} /> : <span className="caption">No reminders yet.</span>}</Card>
      </div>
      <div className="col">
        {(c.status === 'Overdue' || c.status === 'Missing' || c.status === 'Due soon') && <ActionCard tone={c.status === 'Due soon' ? 'warn' : 'warn'} text="Book a qualified contractor, or upload the certificate if it is already done."><Btn block icon={<UserPlus size={16} />} onClick={() => setM('book')}>Book contractor</Btn><Btn block kind="outline" icon={<Upload size={16} />} onClick={() => setM('upload')}>Upload certificate</Btn><Btn block kind="ghost" icon={<Bell size={16} />} onClick={() => remindCert(s, L, c)}>Remind landlord</Btn></ActionCard>}
        {c.status === 'Booked' && <ActionCard text={`${k?.name} is booked. When they finish, upload the new certificate.`}><Btn block icon={<Upload size={16} />} onClick={() => setM('upload')}>Upload certificate</Btn><Btn block kind="outline" onClick={() => upd({ status: 'Proof to check', issued: '15 Oct 2026, 11:30', expires: c.kind === 'Gas safety' ? '15 Oct 2027' : '15 Oct 2031', days: c.kind === 'Gas safety' ? 365 : 1826, file: c.kind.split(' ')[0].toLowerCase() + '-certificate-2026.pdf', history: c.file && c.issued ? [{ issued: c.issued, expires: c.expires, file: c.file, by: k?.name ?? 'Contractor' }, ...c.history] : c.history }, `${k?.name} uploaded the ${c.kind} certificate`)}>Contractor uploaded it</Btn></ActionCard>}
        {c.status === 'Proof to check' && <ActionCard tone="ok" text="A new certificate was uploaded. Check it is correct and signed." />}
        {c.status === 'Valid' && <ActionCard tone="ok" title="In date" text={`Nothing to do until ${c.days > 60 ? 'the reminder 60 days before ' + c.expires : c.expires}.`}><Btn block kind="outline" icon={<Upload size={16} />} onClick={() => setM('upload')}>Replace certificate</Btn></ActionCard>}
        <Card title="Contractor">{k ? <div className="flex"><Avatar name={k.name} size="md" /><div className="stack grow"><button className="link" style={{ textAlign: 'left' }} onClick={() => s.go('contractors', k.id)}>{k.name}</button><span className="caption">{k.trade} · {k.phone}</span></div></div> : <span className="caption">No contractor booked.</span>}</Card>
        <HomeCard id={c.property} note={<KV rows={[['Landlord', L.landlord(p?.owner)?.name ?? '—']]} />} />
        <Card title="Other checks at this home"><div className="divlist">{s.safety.filter(x => x.property === c.property && x.id !== id).map(x => <button key={x.id} className="item click" onClick={() => s.go('safety', x.id)}><b className="grow small" style={{ color: 'var(--text-primary)' }}>{x.kind}</b><Chip tone={certTone(x.status)}>{x.status}</Chip><ArrowRight size={14} color="#98A2B3" /></button>)}</div></Card>
      </div>
    </div>
    {m === 'upload' && <UploadModal title={`${c.file ? 'Replace' : 'Upload'} ${c.kind} certificate`} sub={`${p?.address}. Add when it was done and when it ends. The old one is kept.`} withIssued withExpiry cta="Save certificate" onClose={() => setM('')} onSave={v => { saveCert(s, L, c, v); setM(''); }} />}
    {m === 'book' && <AssignContractorModal title={`Book a contractor for ${c.kind}`} trade={trade} onClose={() => setM('')} onPick={x => { upd({ contractor: x, status: 'Booked' }, `Booked ${L.contractor(x)?.name} for ${c.kind} at ${p?.address}`); setM(''); }} />}
    {m === 'fault' && <Reason danger title="Fault found" sub="An urgent repair job is made for this home straight away." cta="Create repair job" placeholder="e.g. Boiler flue not sealed" onClose={() => setM('')} onDone={r => { s.setJobs(js => [{ id: 'J' + Date.now() % 10000, title: `${c.kind} fault: ${r}`, property: c.property, managed: true, cost: 0, price: 0, status: 'New', urgent: true, reported: '15 Oct 2026, 12:00', by: 'Safety check', admin: p?.admin ?? 'et', category: c.kind === 'Gas safety' ? 'Heating' : 'Electrical', comms: [], events: [{ at: '15 Oct 2026, 12:00', by: ME_NAME, text: 'Made from a failed safety check' }] }, ...js]); upd({ status: 'Due soon' }, `Fault found on ${c.kind}. Repair job created.`); setM(''); }} />}
  </>;
}
