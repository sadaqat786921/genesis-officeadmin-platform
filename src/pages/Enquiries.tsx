import { useState } from 'react';
import { Inbox, UserCheck, PhoneCall, Mail, CheckCircle2, XCircle, ShieldCheck, KeyRound, UserPlus, ArrowRight, RotateCcw, Archive, Home, MessageSquareText, BellRing } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { nowStamp, SUPERVISOR, ME, type Comm, type Enquiry } from '../data';
import { ME_NAME } from '../data';
import { ActionCard, Avatar, Btn, Card, Chip, CommModal, CommsLog, DetailHead, Field, HSteps, KV, Kpi, MiniSearch, Modal, Note, Select, Tabs, When, Empty, Area, Text, dateLabel } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { adminName, firstName } from './shared';
import { AskNewLandlord } from './Landlords';
import { remindSupervisor } from './Requests';

const stageTone = { New: 'info', Assigned: 'brand', Contacted: 'warn', Converted: 'ok', Closed: 'neutral' } as const;
const convertedLabel = (e: Enquiry) => e.kind === 'Landlord' ? 'Landlord created' : 'Moved to Lettings';
const stageLabel = (e: Enquiry) => e.stage === 'Converted' ? convertedLabel(e) : e.stage === 'Contacted' ? 'Contacted' : e.stage;

export function Enquiries() {
  const s = useStore();
  if (s.detail && s.enquiries.some(e => e.id === s.detail)) return <EnquiryPage id={s.detail} />;
  return <EnquiryList />;
}

function EnquiryList() {
  const s = useStore(); const L = useLookups();
  const [kind, setKind] = useState<'all' | 'Landlord' | 'Home seeker'>('all');
  const [st, setSt] = useState<'open' | 'New' | 'follow' | 'Converted' | 'Closed' | 'all'>('open');
  const [q, setQ] = useState('');
  const E = s.enquiries;
  const match = (e: Enquiry) => st === 'all' ? true : st === 'open' ? !['Converted', 'Closed'].includes(e.stage) : st === 'follow' ? e.stage === 'Contacted' : st === 'New' ? e.stage === 'Assigned' : e.stage === st;
  const list = E.filter(e => match(e) && (kind === 'all' || e.kind === kind) && (e.name + e.about + e.email).toLowerCase().includes(q.toLowerCase()));
  return <>
    <PageHeader crumbs={crumbsFor('enquiries', s.go)} title="Enquiries" />
    <div className="grid g4">
      <Kpi icon={<Inbox size={18} />} tone="info" label="To contact" value={E.filter(e => e.stage === 'Assigned').length} caption={`given to you by ${SUPERVISOR}`} active={st === 'New'} onClick={() => setSt('New')} />
      <Kpi icon={<PhoneCall size={18} />} tone="brand" label="Contacted" value={E.filter(e => e.stage === 'Contacted').length} caption="decide the next step" active={st === 'follow'} onClick={() => setSt('follow')} />
      <Kpi icon={<CheckCircle2 size={18} />} tone="ok" label="Converted" value={E.filter(e => e.stage === 'Converted').length} caption="became a landlord or applicant" active={st === 'Converted'} onClick={() => setSt('Converted')} />
      <Kpi icon={<Archive size={18} />} tone="neutral" label="Closed" value={E.filter(e => e.stage === 'Closed').length} caption="reason saved" active={st === 'Closed'} onClick={() => setSt('Closed')} />
    </div>
    <Card title="Your enquiries" sub={`Enquiries ${SUPERVISOR} gave you. Contact each one within 24 hours, then move it on or close it.`}
      action={<div className="toolbar"><MiniSearch value={q} onChange={setQ} placeholder="Search name or topic" />
        <Tabs value={kind} onChange={setKind} items={[{ id: 'all', label: 'Everyone' }, { id: 'Landlord', label: 'Landlords', count: E.filter(e => e.kind === 'Landlord').length }, { id: 'Home seeker', label: 'Home seekers', count: E.filter(e => e.kind === 'Home seeker').length }]} /></div>}>
      <Tabs value={st} onChange={setSt} items={[{ id: 'open', label: 'Open', count: E.filter(e => !['Converted', 'Closed'].includes(e.stage)).length }, { id: 'New', label: 'To contact' }, { id: 'follow', label: 'Contacted' }, { id: 'Converted', label: 'Converted' }, { id: 'Closed', label: 'Closed' }, { id: 'all', label: 'All', count: E.length }]} />
      <div className="tablewrap"><table className="t"><thead><tr><th>From</th><th>Type</th><th>About</th><th>Source</th><th>Received</th><th>Next step</th><th>Stage</th><th /></tr></thead><tbody>
        {list.map(e => <tr key={e.id} onClick={() => s.go('enquiries', e.id)}>
          <td><span className="cell"><Avatar name={e.name} /><span className="stack"><b className="strong">{e.name}</b><span className="caption">{e.email}</span></span></span></td>
          <td><Chip tone={e.kind === 'Landlord' ? 'brand' : 'ok'} dot={false}>{e.kind}</Chip></td>
          <td>{e.about}{e.property && <div className="caption">{L.prop(e.property)?.address}</div>}</td><td>{e.source}</td><td><When at={e.received} /></td>
          <td><span className="caption" style={{ fontWeight: 600 }}>{e.stage === 'Assigned' ? 'Call or email them' : e.stage === 'Contacted' ? (e.kind === 'Landlord' ? 'Ask Supervisor to create landlord' : 'Move to Lettings') : '—'}</span></td>
          <td><Chip tone={stageTone[e.stage]}>{stageLabel(e)}</Chip></td><td><ArrowRight size={16} color="#98A2B3" /></td></tr>)}
      </tbody></table>{!list.length && <Empty icon={<Inbox size={22} />}>No enquiries here.</Empty>}</div>
    </Card>
  </>;
}

function EnquiryPage({ id }: { id: string }) {
  const s = useStore(); const L = useLookups();
  const e = s.enquiries.find(x => x.id === id)!;
  const [close, setClose] = useState(false); const [contact, setContact] = useState<'' | 'Call' | 'Email'>(''); const [newLL, setNewLL] = useState(false); const [toLet, setToLet] = useState(false);
  const asked = s.requests.find(r => r.kind === 'New landlord' && r.status === 'Waiting' && r.data?.enquiry === id);
  const p = L.prop(e.property);
  const isLL = e.kind === 'Landlord';
  const upd = (patch: Partial<Enquiry>, msg: string, comm?: Comm) => { s.setEnquiries(es => es.map(x => x.id === id ? { ...x, ...patch, comms: comm ? [...x.comms, comm] : x.comms } : x)); s.log(msg, 'Enquiries'); s.toast(msg); };
  const sys = (text: string): Comm => ({ id: 'cm' + Date.now() + Math.random(), at: nowStamp(), by: ME_NAME, channel: 'System', text });
  const addComm = (c: Comm) => { const moves = e.stage === 'Assigned' && (c.channel === 'Call' || c.channel === 'Email'); s.setEnquiries(es => es.map(x => x.id === id ? { ...x, stage: moves ? 'Contacted' : x.stage, comms: [...x.comms, c] } : x)); s.log(`${c.channel === 'Email' ? 'Emailed' : c.channel === 'Call' ? 'Called' : 'Added a note for'} ${e.name}`, 'Enquiries'); s.toast(moves ? 'Saved. Stage moved to Contacted.' : 'Saved'); };
  const contacted = e.comms.some(c => c.channel === 'Call' || c.channel === 'Email');
  const steps = ['Received', 'Given to you', 'Contacted', isLL ? 'Landlord created by Supervisor' : convertedLabel(e)];
  const at = e.stage === 'New' ? 1 : e.stage === 'Assigned' ? 2 : e.stage === 'Contacted' ? 3 : e.stage === 'Converted' ? 4 : (e.admin ? (contacted ? 3 : 2) : 1);
  const live = e.stage !== 'Closed' && e.stage !== 'Converted';
  return <>
    <PageHeader crumbs={crumbsFor('enquiries', s.go, e.name)} back={() => s.go('enquiries')} title={e.name}
      action={<div className="flex">{live && <Btn kind="outline" icon={<XCircle size={16} />} onClick={() => setClose(true)}>Close enquiry</Btn>}{e.stage === 'Closed' && <Btn kind="outline" icon={<RotateCcw size={16} />} onClick={() => upd({ stage: e.admin ? (contacted ? 'Contacted' : 'Assigned') : 'New', closed: undefined }, `Reopened enquiry from ${e.name}`, sys('Enquiry reopened.'))}>Reopen</Btn>}</div>} />
    <DetailHead media={<Avatar name={e.name} size="xl" />} title={e.name}
      chips={<><Chip tone={isLL ? 'brand' : 'ok'} dot={false}>{isLL ? 'Landlord enquiry' : 'Home seeker'}</Chip><Chip tone={stageTone[e.stage]}>{stageLabel(e)}</Chip></>}
      meta={[['Email', e.email], ['Phone', e.phone], ['Source', e.source], ['Received', e.received]]} />
    <Card><HSteps items={steps} at={at} stopped={e.stage === 'Closed' ? 'Closed' : undefined} /></Card>
    <div className="dgrid">
      <div className="col">
        <Card title="Their message" action={<span className="caption">{e.received}</span>}>
          <div className="quote"><MessageSquareText size={18} /><p>“{e.message}”</p></div>
          <div className="flex wrap"><Chip tone="ok" dot={false}><CheckCircle2 size={12} /> Consent to contact given</Chip><Chip tone="ok" dot={false}><ShieldCheck size={12} /> Passed spam check</Chip></div>
        </Card>
        <Card title={isLL ? 'What they want managed' : 'The home they asked about'}>
          {p ? <button className="lrow click" onClick={() => s.go('properties', p.id)}><div className="photo" style={{ width: 96, height: 68, flex: 'none', backgroundImage: `url(${p.photo})` }} /><div className="stack grow"><b>{p.address}</b><span className="caption">{p.area} · {p.type === 'HMO' ? `${p.rooms} rooms` : `${p.beds} bed`} · {money(p.type === 'HMO' ? 440 : p.rent)} pcm</span><span className="caption">{p.status}</span></div><ArrowRight size={16} color="#98A2B3" /></button>
            : <KV rows={[['About', e.about], ['Wants', isLL ? 'LSP to manage their homes' : 'A home to rent'], ['Next', isLL ? 'Call them, explain the plans, then create the landlord account' : 'Call them, then move them to Lettings']]} />}
        </Card>
        <Card title="Communication" sub="Every call, email and note, with the date and time.">
          <CommsLog items={e.comms} to={e.email} onAdd={live ? addComm : undefined} emptyText="No one has contacted them yet." />
        </Card>
      </div>
      <div className="col">

        {e.stage === 'Assigned' && <ActionCard text={`Waiting for ${adminName(e.admin)} to contact ${firstName(e.name)}. Log the call or email when it's done.`}><Btn block icon={<PhoneCall size={16} />} onClick={() => setContact('Call')}>Log a call</Btn><Btn block kind="outline" icon={<Mail size={16} />} onClick={() => setContact('Email')}>Send email</Btn></ActionCard>}
        {e.stage === 'Contacted' && (isLL
          ? (asked ? <ActionCard tone="warn" title={`With ${SUPERVISOR}`} text={`You asked ${SUPERVISOR} to create ${firstName(e.name)}'s landlord account on ${asked.at}. Only the Supervisor can create landlords.`}><Btn block kind="outline" icon={<ArrowRight size={16} />} onClick={() => s.go('requests', asked.id)}>Open request</Btn><Btn block kind="ghost" icon={<BellRing size={16} />} onClick={() => remindSupervisor(s, asked.title)}>Remind {SUPERVISOR}</Btn></ActionCard> : <ActionCard tone="ok" text={`${firstName(e.name)} has been contacted. If they want to go ahead, send their details to ${SUPERVISOR}, who creates the landlord account.`}><Btn block icon={<UserPlus size={16} />} onClick={() => setNewLL(true)}>Ask Supervisor to create landlord</Btn></ActionCard>)
          : <ActionCard tone="ok" text={`${firstName(e.name)} has been contacted. If they want to apply, move them to Lettings as a new applicant.`}><Btn block icon={<KeyRound size={16} />} onClick={() => setToLet(true)}>Move to Lettings</Btn></ActionCard>)}
        {e.stage === 'Converted' && <ActionCard tone="ok" title="Done" text={isLL ? 'This enquiry became a landlord account.' : 'This enquiry is now an applicant in Lettings.'}><Btn block icon={<ArrowRight size={16} />} onClick={() => e.converted && s.go(isLL ? 'landlords' : 'lettings', e.converted)}>{isLL ? 'Open landlord record' : 'Open in Lettings'}</Btn></ActionCard>}
        {e.stage === 'Closed' && e.closed && <ActionCard tone="neutral" title="Closed" text={e.closed.reason}><KV rows={[['Note', e.closed.note || '—'], ['Closed', e.closed.at], ['By', e.closed.by]]} /></ActionCard>}
        <Card title="Given to you"><div className="flex"><Avatar id="sk" size="md" /><div className="stack grow"><b>By {SUPERVISOR}</b><span className="caption">{e.comms.find(c => c.channel === 'System')?.at ?? e.received} · contact within 24 hours</span></div></div></Card>
        <Card title="Details"><KV rows={[['Type', e.kind], ['About', e.about], ['Source', e.source], ['Received', e.received]]} /></Card>
      </div>
    </div>

    {contact && <CommModal mode={contact} to={e.email} onClose={() => setContact('')} onSave={c => { addComm(c); setContact(''); }} />}
    {close && <CloseEnquiry e={e} onClose={() => setClose(false)} onDone={(reason, note) => { upd({ stage: 'Closed', closed: { reason, note, at: nowStamp(), by: ME_NAME } }, `Closed enquiry from ${e.name}: ${reason}`, sys(`Closed: ${reason}${note ? '. ' + note : ''}`)); setClose(false); }} />}
    {newLL && <AskNewLandlord prefill={{ name: e.name, email: e.email, phone: e.phone }} enquiry={id} onClose={() => setNewLL(false)} />}
    {toLet && <MoveToLettings e={e} onClose={() => setToLet(false)} />}
  </>;
}

function CloseEnquiry({ e, onClose, onDone }: { e: Enquiry; onClose: () => void; onDone: (reason: string, note: string) => void }) {
  const [reason, setReason] = useState('Not interested any more'); const [note, setNote] = useState(''); const [ok, setOk] = useState(false);
  return <Modal title={`Close the enquiry from ${e.name}?`} sub="It moves to Closed. You can reopen it later. The reason is saved in History." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn kind="danger" icon={<XCircle size={16} />} disabled={!ok} onClick={() => onDone(reason, note.trim())}>Close enquiry</Btn></>}>
    <Field label="Why is it closing?"><Select value={reason} onChange={setReason} options={['Not interested any more', 'No reply after 3 tries', 'Only wanted information', 'Not a fit for LSP', 'Found a home elsewhere', 'Duplicate enquiry', 'Spam'].map(x => ({ value: x, label: x }))} /></Field>
    <Field label="Note (optional)"><Area value={note} onChange={setNote} placeholder="e.g. Will come back in spring" /></Field>
    <label className="check"><input type="checkbox" checked={ok} onChange={ev => setOk(ev.target.checked)} /> I confirm this enquiry is finished</label>
  </Modal>;
}

function MoveToLettings({ e, onClose }: { e: Enquiry; onClose: () => void }) {
  const s = useStore(); const L = useLookups();
  const homes = s.properties.filter(p => p.managed && p.status !== 'Let');
  const [prop, setProp] = useState(e.property ?? homes[0]?.id ?? ''); const [room, setRoom] = useState('Room 1'); const admin = ME;
  const [d, setD] = useState({ household: '', moveIn: '', budget: '', work: '', income: '', pets: 'None', current: '' });
  const p = L.prop(prop);
  return <Modal wide title="Move to Lettings" sub={`${e.name} becomes a new applicant in the Applied column. Fill in what you learned on the call, so the applicant profile is complete.`} onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<KeyRound size={16} />} onClick={() => {
      const aid = 'AP' + Date.now() % 10000;
      s.setApplicants(ap => [{ id: aid, name: e.name, email: e.email, phone: e.phone, property: prop, room: p?.type === 'HMO' ? room : undefined, stage: 0, source: 'Enquiry', admin, applied: nowStamp(), since: '15 Oct 2026', household: d.household.trim() || '—', budget: +d.budget || (p?.type === 'HMO' ? 440 : p?.rent ?? 0), moveIn: d.moveIn ? dateLabel(d.moveIn) : '—', employment: d.work.trim() || '—', income: +d.income || 0, pets: d.pets.trim() || '—', current: d.current.trim() || '—', portal: false, kyc: ['Photo ID (passport or driving licence)', 'Proof of address', 'Right to rent share code', 'Proof of income (3 payslips)', 'Bank statements (3 months)'].map(n => ({ name: n, status: 'Missing' as const })), checks: { deposit: false, contract: false, reference: 'Not started' }, deposit: Math.round((p?.type === 'HMO' ? 440 : p?.rent ?? 0) * 12 / 52 * 5), comms: e.comms }, ...ap]);
      s.setEnquiries(es => es.map(x => x.id === e.id ? { ...x, stage: 'Converted', converted: aid, admin, comms: [...x.comms, { id: 'cm' + Date.now(), at: nowStamp(), by: ME_NAME, channel: 'System', text: 'Moved to Lettings as a new applicant.' }] } : x));
      s.log(`${e.name} moved from Enquiries to Lettings`, 'Lettings'); s.toast(`${e.name} is now in Lettings`); onClose(); s.go('lettings', aid);
    }}>Move to Lettings</Btn></>}>
    <Field label="Home they want"><Select value={prop} onChange={setProp} options={homes.map(h => ({ value: h.id, label: `${h.address} · ${h.status}` }))} /></Field>
    {p?.type === 'HMO' && <Field label="Room"><Select value={room} onChange={setRoom} options={Array.from({ length: p.rooms ?? 0 }, (_, i) => `Room ${i + 1}`).map(r => ({ value: r, label: r }))} /></Field>}
    <div className="sec-label">About the applicant · from your conversation</div>
    <div className="grid g2">
      <Field label="Household"><Text value={d.household} onChange={v => setD({ ...d, household: v })} placeholder="e.g. 2 adults, 1 child" /></Field>
      <Field label="Wants to move in"><input className="input" type="date" value={d.moveIn} onChange={ev => setD({ ...d, moveIn: ev.target.value })} /></Field>
      <Field label="Budget (£ pcm)"><Text value={d.budget} onChange={v => setD({ ...d, budget: v })} placeholder={String(p?.type === 'HMO' ? 440 : p?.rent ?? '')} /></Field>
      <Field label="Work"><Text value={d.work} onChange={v => setD({ ...d, work: v })} placeholder="e.g. Nurse, Leeds General Infirmary" /></Field>
      <Field label="Yearly income (£)"><Text value={d.income} onChange={v => setD({ ...d, income: v })} placeholder="e.g. 32000" /></Field>
      <Field label="Pets"><Text value={d.pets} onChange={v => setD({ ...d, pets: v })} placeholder="None" /></Field>
    </div>
    <Field label="Lives now at"><Text value={d.current} onChange={v => setD({ ...d, current: v })} placeholder="Current address" /></Field>
    <Note>You stay the Office Admin for this applicant.</Note>
    <Note>Their calls, emails and notes move with them.</Note>
  </Modal>;
}
