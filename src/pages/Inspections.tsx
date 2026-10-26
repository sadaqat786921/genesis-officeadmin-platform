import { useState } from 'react';
import { Plus, UserPlus, CalendarDays, ClipboardCheck, Lock, Upload, Undo2, Download, Wrench, Gauge, KeyRound, Image as ImageIcon, CalendarClock, ArrowRight, FileText } from 'lucide-react';
import { useStore, useLookups } from '../store';
import { daysFrom, nowStamp, parseDate, type Inspection } from '../data';
import { ME_NAME } from '../data';
import { ActionCard, Avatar, Btn, Card, Chip, DetailHead, DocRow, Field, HSteps, KV, Kpi, MiniSearch, Modal, Note, Reason, Tabs, Timeline, UploadModal, Empty, dateLabel } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { AssignContractorModal, BookInspectionModal, HomeCard } from './shared';
import { InspTable, inspStatusLabel, inspTone } from './tables';

export function Inspections() {
  const s = useStore();
  if (s.detail && s.inspections.some(i => i.id === s.detail)) return <InspectionPage id={s.detail} />;
  return <InspectionList />;
}

function InspectionList() {
  const s = useStore(); const L = useLookups();
  const [tab, setTab] = useState<'upcoming' | 'Not assigned' | 'Report uploaded' | 'Locked' | 'all'>('upcoming'); const [q, setQ] = useState(''); const [add, setAdd] = useState(false);
  const I = s.inspections;
  const list = I.filter(i => (tab === 'all' ? true : tab === 'upcoming' ? ['Booked', 'Not assigned'].includes(i.status) : i.status === tab) && ((L.prop(i.property)?.address ?? '') + i.kind).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => tab === 'Locked' || tab === 'all' ? parseDate(b.date).getTime() - parseDate(a.date).getTime() : parseDate(a.date).getTime() - parseDate(b.date).getTime());
  return <>
    <PageHeader crumbs={crumbsFor('inspections', s.go)} title="Inspections" action={<Btn icon={<Plus size={18} />} onClick={() => setAdd(true)}>Book inspection</Btn>} />
    <div className="grid g4">
      <Kpi icon={<UserPlus size={18} />} tone="warn" label="No inspector yet" value={I.filter(i => i.status === 'Not assigned').length} caption="assign someone" active={tab === 'Not assigned'} onClick={() => setTab('Not assigned')} />
      <Kpi icon={<CalendarDays size={18} />} tone="info" label="Booked" value={I.filter(i => i.status === 'Booked').length} caption={`next: ${I.filter(i => i.status === 'Booked' && daysFrom(i.date) >= 0).sort((a, b) => daysFrom(a.date) - daysFrom(b.date))[0]?.date ?? '—'}`} active={tab === 'upcoming'} onClick={() => setTab('upcoming')} />
      <Kpi icon={<ClipboardCheck size={18} />} tone="brand" label="Reports to check" value={I.filter(i => i.status === 'Report uploaded').length} caption="check and lock" active={tab === 'Report uploaded'} onClick={() => setTab('Report uploaded')} />
      <Kpi icon={<Lock size={18} />} tone="ok" label="Checked and locked" value={I.filter(i => i.status === 'Locked').length} caption="all reports kept" active={tab === 'Locked'} onClick={() => setTab('Locked')} />
    </div>
    <Card title="Inspections" sub="Move-in, routine, move-out, gas, electrical and fire checks. Click one for the full report with photos and readings."
      action={<div className="toolbar"><MiniSearch value={q} onChange={setQ} placeholder="Search home or type" /><Tabs value={tab} onChange={setTab} items={[{ id: 'upcoming', label: 'Upcoming' }, { id: 'Not assigned', label: 'No inspector' }, { id: 'Report uploaded', label: 'To check' }, { id: 'Locked', label: 'Reports' }, { id: 'all', label: 'All' }]} /></div>}>
      <InspTable list={list} />
    </Card>
    {add && <BookInspectionModal onClose={() => setAdd(false)} onBooked={id => s.go('inspections', id)} />}
  </>;
}

const STEPS = ['Booked', 'Inspector assigned', 'Visit done and report uploaded', 'Checked and locked'];
function InspectionPage({ id }: { id: string }) {
  const s = useStore(); const L = useLookups(); const i = s.inspections.find(x => x.id === id)!;
  const [m, setM] = useState<'' | 'assign' | 'back' | 'upload' | 'move'>('');
  const p = L.prop(i.property); const c = L.contractor(i.inspector);
  const tenant = s.tenants.find(t => t.property === i.property && t.status !== 'Moved out' && (!i.room || t.room === i.room));
  const upd = (patch: Partial<Inspection>, msg: string) => { s.setInspections(is => is.map(x => x.id === id ? { ...x, ...patch } : x)); s.log(msg, 'Inspections'); s.toast(msg); };
  const at = i.status === 'Not assigned' ? 1 : i.status === 'Booked' ? 2 : i.status === 'Locked' ? 4 : 3;
  const engineer = i.kind === 'Gas safety' || i.kind === 'Electrical';
  const lock = () => { upd({ status: 'Locked' }, `Checked and locked ${i.kind.toLowerCase()} report for ${p?.address}`); s.setLocked(ls => [{ id: 'LR' + Date.now(), kind: 'Inspection report', title: `${i.kind} · ${p?.address}${i.room ? ' ' + i.room : ''}`, locked: nowStamp(), by: ME_NAME, versions: [] }, ...ls]); };
  const followUp = (room: string, note: string) => { const jid = 'J' + Date.now() % 10000; s.setJobs(js => [{ id: jid, title: `${note} (${room})`, property: i.property, managed: true, cost: 0, price: 0, status: 'New', reported: nowStamp(), by: 'Inspection', admin: p?.admin ?? 'et', category: 'General', comms: [], events: [{ at: nowStamp(), by: ME_NAME, text: `Made from the ${i.kind.toLowerCase()} inspection on ${i.date}` }] }, ...js]); s.log(`Created follow-up job from inspection: ${note}`, 'Jobs'); s.toast('Follow-up job created'); };
  const fakeReport = (file?: string) => upd({ status: 'Report uploaded', doneAt: nowStamp(), rooms: engineer ? [{ name: i.kind === 'Gas safety' ? 'Boiler' : 'Consumer unit', photos: 3, note: 'Tested and safe', condition: 'Good' }, { name: i.kind === 'Gas safety' ? 'Gas hob' : 'Sockets and lights', photos: 2, note: i.kind === 'Gas safety' ? 'Safe' : 'One socket needs a new face plate', diff: i.kind !== 'Gas safety', condition: i.kind === 'Gas safety' ? 'Good' : 'Fair' }] : [{ name: 'Living room', photos: 5, note: 'Good', condition: 'Good' }, { name: 'Kitchen', photos: 4, note: 'Good', condition: 'Good' }, { name: 'Bathroom', photos: 3, note: 'Sealant worn round the bath', diff: true, condition: 'Fair' }], meters: engineer ? {} : { gas: '04412', electric: '18877', water: '00931' }, keys: engineer ? 0 : 3, summary: (file ? `Report ${file} uploaded. ` : '') + (engineer ? 'Certificate issued.' : 'Home in good order. One small repair needed.'), result: engineer ? 'Pass' : undefined }, `${c?.name ?? 'Inspector'} uploaded the report`);
  return <>
    <PageHeader crumbs={crumbsFor('inspections', s.go, `${i.kind} · ${p?.address}`)} back={() => s.go('inspections')} title={`${i.kind} inspection`}
      action={<div className="flex">{i.status !== 'Locked' && <Btn kind="outline" icon={<CalendarClock size={16} />} onClick={() => setM('move')}>Change date</Btn>}{i.rooms.length > 0 && <Btn kind="outline" icon={<Download size={16} />} onClick={() => s.toast(`${i.kind} report downloaded as PDF`)}>Download report</Btn>}</div>} />
    <DetailHead media={<span className="tile t-brand" style={{ width: 64, height: 64, borderRadius: 18 }}><ClipboardCheck size={28} /></span>} title={`${i.kind} inspection`}
      chips={<><Chip tone={inspTone[i.status]}>{inspStatusLabel(i.status)}</Chip><Chip tone="neutral" dot={false}>{i.scope}{i.room ? ' · ' + i.room : ''}</Chip>{i.result && <Chip tone={i.result === 'Pass' ? 'ok' : 'err'}>{i.result}</Chip>}</>}
      meta={[['Home', p?.address ?? ''], ['Booked for', `${i.date}, ${i.time}`], [engineer ? 'Engineer' : 'Site Inspector', c?.name ?? 'Not assigned'], ['Done on', i.doneAt ?? 'Not yet']]} />
    <Card><HSteps items={STEPS} at={at} /></Card>
    <div className="dgrid">
      <div className="col">
        {i.rooms.length === 0 && <Card title="Visit details"><KV rows={[['What', `${i.kind}${engineer ? ' check' : ' inspection'}`], ['Part of the home', `${i.scope}${i.room ? ' · ' + i.room : ''}`], ['Date and time', `${i.date}, ${i.time}`], ['Notes', i.notes ?? '—'], ['Tenant', tenant?.name ?? 'Empty']]} />
          <Note>{i.status === 'Not assigned' ? 'Assign someone so the visit can go ahead.' : `${c?.name} visits on ${i.date} at ${i.time}. The tenant gets a reminder 24 hours before.`}</Note></Card>}
        {i.rooms.length > 0 && <Card title="Report" sub={i.summary}>
          <div className="divlist">{i.rooms.map(r => <div key={r.name} className="item"><span className={`tile ${r.diff ? 't-warn' : 't-ok'}`} style={{ width: 32, height: 32 }}><ImageIcon size={15} /></span><div className="stack grow"><b>{r.name}</b><span className="caption">{r.photos} photos · {r.note}</span></div><Chip tone={r.condition === 'Good' ? 'ok' : r.condition === 'Fair' ? 'warn' : 'err'}>{r.condition}</Chip>{r.diff && i.status !== 'Locked' && <Btn sm kind="ghost" icon={<Wrench size={14} />} onClick={() => followUp(r.name, r.note)}>Make job</Btn>}</div>)}</div>
        </Card>}
        {i.rooms.length > 0 && <Card title="Photo proof" sub="Taken during the visit, with the date and time."><div className="photos">{i.rooms.flatMap(r => [r.name]).concat(['Front', 'Meters']).slice(0, 8).map((n, k) => <div key={k} className="ph" style={{ backgroundImage: `url(images/home${(k % 3) + 1}.jpg)` }}><span>{n}</span></div>)}</div><span className="caption">All photos stamped {i.doneAt}</span></Card>}
        {i.rooms.length > 0 && !engineer && <Card title="Meters and keys"><div className="grid g4">{(['gas', 'electric', 'water'] as const).map(mt => <div key={mt} className="mt stack"><span className="caption"><Gauge size={12} /> {mt}</span><b>{i.meters[mt] ?? '—'}</b></div>)}<div className="mt stack"><span className="caption"><KeyRound size={12} /> keys</span><b>{i.keys}</b></div></div></Card>}
        {i.rooms.length > 0 && <Card title="Documents"><DocRow name={`${i.kind} report.pdf`} meta={`Uploaded ${i.doneAt}`}><Btn sm kind="ghost" icon={<Download size={14} />} onClick={() => s.toast('Report downloaded')}>Download</Btn></DocRow>{engineer && <DocRow name={i.kind === 'Gas safety' ? 'Gas safety certificate (CP12)' : 'Electrical certificate (EICR)'} meta="Saved to Safety & Compliance"><Btn sm kind="ghost" icon={<ArrowRight size={14} />} onClick={() => s.go('safety')}>Open</Btn></DocRow>}{tenant && <DocRow name="Signed by the tenant" meta={`${tenant.name} · ${i.doneAt}`} />}</Card>}
      </div>
      <div className="col">
        {i.status === 'Not assigned' && <ActionCard text={`Choose ${engineer ? 'an engineer' : 'a Site Inspector'} for ${i.date} at ${i.time}.`}><Btn block icon={<UserPlus size={16} />} onClick={() => setM('assign')}>Assign {engineer ? 'engineer' : 'Site Inspector'}</Btn></ActionCard>}
        {i.status === 'Booked' && <ActionCard text={`After the visit, ${c?.name} uploads the report. You can also upload it for them.`}><Btn block icon={<Upload size={16} />} onClick={() => setM('upload')}>Upload report</Btn><Btn block kind="outline" onClick={() => fakeReport()}>Inspector uploaded report</Btn></ActionCard>}
        {i.status === 'Report uploaded' && <ActionCard tone="ok" text="Check the rooms, photos and readings. Then lock the report. Locked reports can't be changed without a reason."><Btn block icon={<Lock size={16} />} onClick={lock}>Approve and lock</Btn><Btn block kind="outline" icon={<Undo2 size={16} />} onClick={() => setM('back')}>Send back</Btn></ActionCard>}
        {i.status === 'Locked' && <ActionCard tone="ok" title="Locked" text="This report is final. To change it, ask the Supervisor to unlock it with a reason. The old version is kept."><Btn block kind="outline" icon={<FileText size={16} />} onClick={() => s.go('records')}>Open in Records</Btn></ActionCard>}
        <Card title={engineer ? 'Engineer' : 'Site Inspector'}>{c ? <div className="flex"><Avatar name={c.name} size="md" /><div className="stack grow"><button className="link" style={{ textAlign: 'left' }} onClick={() => s.go('contractors', c.id)}>{c.name}</button><span className="caption">{c.contact} · {c.phone}</span></div>{i.status !== 'Locked' && <Btn sm kind="ghost" onClick={() => setM('assign')}>Change</Btn>}</div> : <Note tone="warn">No one assigned.</Note>}</Card>
        <HomeCard id={i.property} note={<span className="caption">{tenant ? 'Tenant: ' + tenant.name : 'No tenant'}{p?.managed ? ' · Landlord: ' + L.landlord(p.owner)?.name : ''}</span>} />
        <Card title="Timeline"><Timeline items={[{ at: `${i.date}, ${i.time}`, text: 'Visit booked' }, ...(c ? [{ at: c.name, text: 'Inspector assigned' }] : []), ...(i.doneAt ? [{ at: i.doneAt, text: 'Report uploaded', tone: 'ok' as const }] : []), ...(i.status === 'Locked' ? [{ at: 'Final version', text: 'Checked and locked', tone: 'ok' as const }] : [])]} /></Card>
      </div>
    </div>
    {m === 'assign' && <AssignContractorModal title={engineer ? 'Assign an engineer' : 'Assign a Site Inspector'} inspector={!engineer} trade={i.kind === 'Gas safety' ? 'Gas' : i.kind === 'Electrical' ? 'Electric' : undefined} onClose={() => setM('')} onPick={x => { upd({ inspector: x, status: i.status === 'Not assigned' ? 'Booked' : i.status }, `Assigned ${L.contractor(x)?.name} to the ${i.kind.toLowerCase()} inspection`); setM(''); }} />}
    {m === 'back' && <Reason title="Send report back" sub="The inspector fixes it and uploads again." cta="Send back" placeholder="e.g. Missing photos of the bathroom" onClose={() => setM('')} onDone={r => { upd({ status: 'Booked', summary: 'Sent back: ' + r }, `Sent report back: ${r}`); setM(''); }} />}
    {m === 'upload' && <UploadModal title="Upload inspection report" sub="Add the PDF report. Photos and readings are read from it." withIssued cta="Upload report" onClose={() => setM('')} onSave={v => { fakeReport(v.file); setM(''); }} />}
    {m === 'move' && <MoveVisit i={i} onClose={() => setM('')} />}
  </>;
}

function MoveVisit({ i, onClose }: { i: Inspection; onClose: () => void }) {
  const s = useStore(); const [d, setD] = useState('2026-10-28'); const [t, setT] = useState(i.time);
  return <Modal title="Change the date" sub="The inspector and tenant get an email with the new time." onClose={onClose} footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn onClick={() => { s.setInspections(is => is.map(x => x.id === i.id ? { ...x, date: dateLabel(d), time: t } : x)); s.log(`Moved ${i.kind.toLowerCase()} inspection to ${dateLabel(d)}, ${t}`, 'Inspections'); s.toast(`Moved to ${dateLabel(d)}, ${t}`); onClose(); }}>Save</Btn></>}>
    <div className="grid g2"><Field label="New date"><input className="input" type="date" value={d} onChange={e => setD(e.target.value)} /></Field><Field label="Time"><input className="input" type="time" value={t} onChange={e => setT(e.target.value)} /></Field></div>
  </Modal>;
}
