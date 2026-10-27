import { useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, Mail, Wrench, ArrowRight, MessageSquareReply, Phone, BellRing, Send, KeyRound, FileText, Plus, Gauge, Inbox, FlaskConical, UserPlus } from 'lucide-react';
import { useStore, useLookups, money, landlordBudget, budgetTone } from '../store';
import { PLAN, nowStamp, ME, ME_NAME, SUPERVISOR, type Comm, type ReqKind, type SupReq } from '../data';
import { ActionCard, Avatar, Bar, Btn, Card, Chip, CommModal, CommsLog, DetailHead, Field, KV, Kpi, Modal, Note, PageTabs, Reason, Select, Tabs, Timeline, Empty, Area, Text, When, sortComms } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { HomeCard, adminName, approveJob, jobEvent, jobTone } from './shared';
import { linkLeadLandlord } from './Switch';

type S = ReturnType<typeof useStore>;

/** A gentle nudge to the Supervisor. Logged so both sides can see it. */
export function remindSupervisor(s: S, what: string) {
  s.log(`Reminded ${SUPERVISOR} about ${what}`, 'Sent to Supervisor');
  s.toast(`Reminder sent to ${SUPERVISOR}`);
}

/** Things only the Supervisor can do go here as a request. */
export function sendRequest(s: S, r: Omit<SupReq, 'id' | 'at' | 'status'>) {
  const id = 'Q' + Date.now();
  s.setRequests(rs => [{ ...r, id, at: nowStamp(), status: 'Waiting' }, ...rs]);
  s.log(`Asked ${SUPERVISOR}: ${r.title}`, 'Sent to Supervisor');
  s.toast(`Sent to ${SUPERVISOR}`);
  return id;
}

/** Prototype only: lets you play the Supervisor's answer so the next step of the flow can be shown. */
export function DemoAnswer({ children, note = `In the live product ${SUPERVISOR} answers from the Supervisor portal. Use these to show what happens next.` }: { children: ReactNode; note?: string }) {
  return <div className="demo"><span className="flex" style={{ gap: 6 }}><FlaskConical size={14} /><b>Prototype: the Supervisor's answer</b></span><span className="caption">{note}</span><div className="flex wrap" style={{ gap: 8 }}>{children}</div></div>;
}

export function answerRequest(s: S, q: SupReq, ok: boolean, reply: string) {
  s.setRequests(rs => rs.map(x => x.id === q.id ? { ...x, status: ok ? 'Done' : 'Declined', reply, answered: nowStamp() } : x));
  if (ok && q.kind === 'New landlord' && q.data) {
    const lid = 'L' + (10 + s.landlords.length);
    s.setLandlords(ls => [...ls, { id: lid, name: q.data!.name, email: q.data!.email, phone: q.data!.phone, billing: q.data!.billing ?? '—', plan: (+q.data!.plan || 16) as 12 | 16 | 20, start: '15 Oct 2026', admin: ME, status: 'Invite sent', bank: '—', comms: [{ id: 'cm' + Date.now(), at: nowStamp(), by: SUPERVISOR, channel: 'Email', dir: 'out', subject: 'Your LSP account', text: 'Login email sent from Outlook.' }] }]);
    if (q.data.enquiry) s.setEnquiries(es => es.map(e => e.id === q.data!.enquiry ? { ...e, stage: 'Converted', converted: lid, comms: [...e.comms, { id: 'cm' + Date.now(), at: nowStamp(), by: SUPERVISOR, channel: 'System', text: 'Landlord account created by the Supervisor. Login email sent.' }] } : e));
    s.setRequests(rs => rs.map(x => x.id === q.id ? { ...x, link: { route: 'landlords', id: lid } } : x));
    if (q.data.lead) linkLeadLandlord(s, q.data.lead, lid);
  }
  s.log(`${SUPERVISOR} ${ok ? 'did' : 'declined'}: ${q.title}${reply ? '. ' + reply : ''}`, 'Sent to Supervisor');
  s.toast(`${SUPERVISOR} ${ok ? 'said yes' : 'said no'}`);
}

const KIND_ICON: Record<string, ReactNode> = { 'Repair approval': <Wrench size={16} />, 'Tenant review': <KeyRound size={16} />, 'New landlord': <UserPlus size={16} />, 'Unlock record': <FileText size={16} />, 'Plan change': <Gauge size={16} />, 'Pause contractor': <Wrench size={16} />, Other: <Inbox size={16} /> };

export function Requests() {
  const s = useStore();
  if (s.detail && s.jobs.some(j => j.id === s.detail)) return <RepairApproval id={s.detail} />;
  if (s.detail && s.requests.some(r => r.id === s.detail)) return <RequestPage id={s.detail} />;
  return <RequestList />;
}

function RequestList() {
  const s = useStore(); const L = useLookups();
  const [tab, setTab] = useState<'waiting' | 'answered' | 'budgets'>('waiting'); const [add, setAdd] = useState(false);
  const jobs = s.jobs.filter(j => j.status === 'Waiting approval');
  const reviews = s.applicants.filter(a => a.stage === 4 && !a.rejected);
  const asks = s.requests.filter(r => r.status === 'Waiting');
  const decidedJobs = s.jobs.filter(j => j.managed && j.events.some(e => e.text.startsWith('Approved by Supervisor') || e.text.startsWith('Declined by Supervisor')));
  const answered = s.requests.filter(r => r.status !== 'Waiting');
  const rows = [
    ...jobs.map(j => ({ k: j.id, kind: 'Repair approval', title: `${j.title} · ${money(j.price)}`, about: `${L.prop(j.property)?.address} · over ${L.landlord(L.prop(j.property)?.owner)?.name}'s limit${j.landlordOk ? ' · landlord said yes' : ''}`, at: j.events.find(e => e.text.includes('Sent for approval'))?.at ?? j.reported, go: () => s.go('requests', j.id), what: `${j.title} (${money(j.price)})` })),
    ...reviews.map(a => ({ k: a.id, kind: 'Tenant review', title: `Approve tenant · ${a.name}`, about: `${L.prop(a.property)?.address}${a.room ? ' · ' + a.room : ''} · all checks done`, at: a.since, go: () => s.go('lettings', a.id), what: `the tenant review for ${a.name}` })),
    ...asks.map(q => ({ k: q.id, kind: q.kind, title: q.title, about: q.about, at: q.at, go: () => s.go('requests', q.id), what: q.title })),
  ];
  const props = s.properties.filter(p => p.managed && p.budget);
  return <>
    <PageHeader crumbs={crumbsFor('requests', s.go)} title="Sent to Supervisor" action={<Btn icon={<Plus size={18} />} onClick={() => setAdd(true)}>New request</Btn>} />
    <div className="grid g4">
      <Kpi icon={<Wrench size={18} />} tone="warn" label="Repair approvals" value={jobs.length} caption={money(jobs.reduce((a, j) => a + j.price, 0)) + ' over the limits'} onClick={() => setTab('waiting')} active={tab === 'waiting'} />
      <Kpi icon={<KeyRound size={18} />} tone="brand" label="Tenant reviews" value={reviews.length} caption="checks done, waiting" onClick={() => setTab('waiting')} />
      <Kpi icon={<Send size={18} />} tone="info" label="Other requests" value={asks.length} caption="new landlords, unlocks…" onClick={() => setTab('waiting')} />
      <Kpi icon={<CheckCircle2 size={18} />} tone="ok" label="Answered" value={answered.length + decidedJobs.length} caption="see the reply" active={tab === 'answered'} onClick={() => setTab('answered')} />
    </div>
    <Note>An Office Admin can't approve repairs over a landlord's limit, approve a tenant, create a landlord or unlock a record. Those come here for {SUPERVISOR}. You can prepare everything first: email the landlord, log their reply, and remind the Supervisor.</Note>
    <Tabs value={tab} onChange={setTab} items={[{ id: 'waiting', label: 'Waiting', count: rows.length }, { id: 'answered', label: 'Answered', count: answered.length + decidedJobs.length }, { id: 'budgets', label: 'Repair budgets' }]} />
    {tab === 'waiting' && <Card title={`Waiting for ${SUPERVISOR}`} sub="Click a row to see everything about it.">
      <div className="tablewrap"><table className="t"><thead><tr><th>Request</th><th>Type</th><th>Sent</th><th>Status</th><th /></tr></thead><tbody>
        {rows.map(r => <tr key={r.k} onClick={r.go}>
          <td><span className="cell"><span className="tile t-warn" style={{ width: 32, height: 32 }}>{KIND_ICON[r.kind] ?? <Send size={15} />}</span><span className="stack"><b className="strong">{r.title}</b><span className="caption">{r.about}</span></span></span></td>
          <td><Chip tone="neutral" dot={false}>{r.kind}</Chip></td><td><When at={r.at} /></td><td><Chip tone="warn">Waiting</Chip></td>
          <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}><Btn sm kind="ghost" icon={<BellRing size={14} />} onClick={() => remindSupervisor(s, r.what)}>Remind</Btn></td></tr>)}
      </tbody></table>{!rows.length && <Empty icon={<CheckCircle2 size={22} />}>Nothing waiting on the Supervisor.</Empty>}</div></Card>}
    {tab === 'answered' && <Card title="Answered" sub="What the Supervisor decided, with the date and time."><div className="divlist">
      {answered.map(q => <button key={q.id} className="item click" onClick={() => s.go('requests', q.id)}><span className={`tile ${q.status === 'Done' ? 't-ok' : 't-neutral'}`}>{q.status === 'Done' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span><div className="stack grow"><b>{q.title}</b><span className="caption">{q.reply} · {q.answered}</span></div><Chip tone={q.status === 'Done' ? 'ok' : 'neutral'}>{q.status === 'Done' ? 'Done' : 'Declined'}</Chip></button>)}
      {decidedJobs.map(j => { const e = [...j.events].reverse().find(x => x.text.startsWith('Approved by Supervisor') || x.text.startsWith('Declined by Supervisor')); return <button key={j.id} className="item click" onClick={() => s.go('requests', j.id)}><span className={`tile ${j.status === 'Declined' ? 't-neutral' : 't-ok'}`}>{j.status === 'Declined' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}</span><div className="stack grow"><b>{j.title} · {money(j.price)}</b><span className="caption">{L.prop(j.property)?.address} · {e?.at}</span></div><Chip tone={jobTone(j.status)}>{j.status}</Chip></button>; })}
      {!answered.length && !decidedJobs.length && <Empty>Nothing answered yet.</Empty>}</div></Card>}
    {tab === 'budgets' && <Card title="Repair budgets for your landlords" sub="Each property has its own yearly budget. Alerts go to the landlord at 70%, 90% and 100%. Only the Supervisor can approve over-limit jobs.">
      <div className="tablewrap"><table className="t"><thead><tr><th>Property</th><th>Budget</th><th>Used</th><th>Left</th><th style={{ minWidth: 220 }}>Used so far</th><th>Alerts sent</th></tr></thead>
        {s.landlords.filter(l => landlordBudget(s, l.id).budget).map(l => { const b = landlordBudget(s, l.id); return <tbody key={l.id} className="grp">
          <tr className="grp-h" onClick={() => s.go('landlords', l.id)}><td><span className="cell"><Avatar name={l.name} /><span className="stack"><b className="strong">{l.name}</b><span className="caption">{l.plan}% plan · limit {money(PLAN[l.plan].limit)}</span></span></span></td><td><b>{money(b.budget)}</b></td><td><b>{money(b.used)}</b></td><td><b>{money(b.left)}</b></td><td><div className="flex"><Bar value={b.pct} tone={budgetTone(b.pct)} /><b className="small">{b.pct}%</b></div></td><td><span className="caption">Total for landlord</span></td></tr>
          {b.props.map(p => { const pct = Math.round(p.used / p.budget * 100); return <tr key={p.id} onClick={() => s.go('properties', p.id)}><td style={{ paddingLeft: 64 }}>{p.address}</td><td>{money(p.budget)}</td><td>{money(p.used)}</td><td>{money(p.budget - p.used)}</td><td><div className="flex"><Bar value={pct} tone={budgetTone(pct)} /><b className="small">{pct}%</b></div></td><td><div className="flex wrap">{[70, 90, 100].map(a => <Chip key={a} tone={pct >= a ? (a === 70 ? 'warn' : 'err') : 'neutral'} dot={false}>{a}%</Chip>)}</div></td></tr>; })}
        </tbody>; })}
      </table></div>{!props.length && <Empty>No managed homes.</Empty>}</Card>}
    {add && <NewRequest onClose={() => setAdd(false)} />}
  </>;
}

function NewRequest({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [kind, setKind] = useState<ReqKind>('Plan change'); const [title, setTitle] = useState(''); const [about, setAbout] = useState('');
  return <Modal title="Ask the Supervisor" sub={`${SUPERVISOR} sees it straight away and answers here.`} onClose={onClose} footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Send size={16} />} disabled={!title.trim() || !about.trim()} onClick={() => { const id = sendRequest(s, { kind, title: title.trim(), about: about.trim() }); onClose(); s.go('requests', id); }}>Send request</Btn></>}>
    <Field label="What do you need?"><Select value={kind} onChange={v => setKind(v as ReqKind)} options={(['Plan change', 'Pause contractor', 'Unlock record', 'New landlord', 'Other'] as ReqKind[]).map(x => ({ value: x, label: x }))} /></Field>
    <Field label="Short title"><Text value={title} onChange={setTitle} placeholder="e.g. Move Margaret Okafor to the 20% plan" /></Field>
    <Field label="Details"><Area value={about} onChange={setAbout} placeholder="What happened and why it is needed" /></Field>
    {kind === 'New landlord' && <Note>Tip: for a landlord enquiry, use "Ask Supervisor to create landlord" on the enquiry. Their details are sent with it.</Note>}
  </Modal>;
}

function RequestPage({ id }: { id: string }) {
  const s = useStore(); const q = s.requests.find(r => r.id === id)!;
  const [no, setNo] = useState(false);
  return <>
    <PageHeader crumbs={crumbsFor('requests', s.go, q.title)} back={() => s.go('requests')} title={q.title}
      action={q.status === 'Waiting' && <Btn kind="outline" icon={<BellRing size={16} />} onClick={() => remindSupervisor(s, q.title)}>Remind {SUPERVISOR.split(' ')[0]}</Btn>} />
    <DetailHead media={<span className="tile t-brand" style={{ width: 64, height: 64, borderRadius: 18 }}><Send size={26} /></span>} title={q.title}
      chips={<><Chip tone="neutral" dot={false}>{q.kind}</Chip><Chip tone={q.status === 'Waiting' ? 'warn' : q.status === 'Done' ? 'ok' : 'neutral'}>{q.status === 'Waiting' ? `Waiting for ${SUPERVISOR}` : q.status}</Chip></>}
      meta={[['Sent', q.at], ['From', ME_NAME], ['To', SUPERVISOR], ['Answered', q.answered ?? '—']]} />
    <div className="dgrid">
      <div className="col">
        <Card title="What you asked"><p style={{ margin: 0, lineHeight: 1.6 }}>{q.about}</p>{q.data && <KV rows={Object.entries(q.data).filter(([k]) => k !== 'enquiry').map(([k, v]) => [k[0].toUpperCase() + k.slice(1), k === 'plan' ? v + '% plan' : v] as [string, string])} />}</Card>
        <Card title="History"><Timeline items={[{ at: q.at, text: `Sent to ${SUPERVISOR}`, by: ME_NAME }, ...(q.answered ? [{ at: q.answered, text: `${q.status === 'Done' ? 'Done' : 'Declined'}: ${q.reply}`, by: SUPERVISOR }] : [])].reverse()} /></Card>
      </div>
      <div className="col">
        {q.status === 'Waiting' ? <ActionCard tone="warn" title={`Waiting for ${SUPERVISOR}`} text="You'll get an alert when it's answered."><Btn block kind="outline" icon={<BellRing size={16} />} onClick={() => remindSupervisor(s, q.title)}>Send a reminder</Btn></ActionCard>
          : <ActionCard tone={q.status === 'Done' ? 'ok' : 'neutral'} title={q.status === 'Done' ? 'Done' : 'Declined'} text={q.reply ?? ''}>{q.link && <Btn block kind="outline" icon={<ArrowRight size={16} />} onClick={() => s.go(q.link!.route as never, q.link!.id)}>Open the record</Btn>}</ActionCard>}
        {q.link && q.status === 'Waiting' && <Card title="About"><Btn kind="ghost" icon={<ArrowRight size={16} />} onClick={() => s.go(q.link!.route as never, q.link!.id)}>Open the record</Btn></Card>}
        {q.status === 'Waiting' && <DemoAnswer><Btn sm kind="success" icon={<CheckCircle2 size={14} />} onClick={() => answerRequest(s, q, true, q.kind === 'New landlord' ? 'Landlord account created. Login email sent from Outlook.' : 'Done.')}>Supervisor says yes</Btn><Btn sm kind="outline" icon={<XCircle size={14} />} onClick={() => setNo(true)}>Supervisor says no</Btn></DemoAnswer>}
      </div>
    </div>
    {no && <Reason danger title="Supervisor's reason" sub="Shown to the Office Admin." cta="Save" options={['Not enough information, call me', 'Not this time', 'Duplicate of an existing record']} onClose={() => setNo(false)} onDone={r => { answerRequest(s, q, false, r); setNo(false); }} />}
  </>;
}

/** A job over the landlord's limit. The Office Admin prepares it; only the Supervisor decides. */
function RepairApproval({ id }: { id: string }) {
  const s = useStore(); const L = useLookups(); const j = s.jobs.find(x => x.id === id)!;
  const p = L.prop(j.property)!; const ll = L.landlord(p.owner); const limit = ll ? PLAN[ll.plan].limit : 0; const c = L.contractor(j.contractor);
  const [tab, setTab] = useState<'details' | 'comms'>('details'); const [m, setM] = useState<'' | 'decline' | 'email' | 'reply'>('');
  const waiting = j.status === 'Waiting approval';
  const usedNow = waiting ? p.used : p.used - (j.events.some(e => e.text.startsWith('Approved by Supervisor')) ? j.price : 0);
  const after = p.budget ? Math.round((usedNow + j.price) / p.budget * 100) : 0; const before = p.budget ? Math.round(usedNow / p.budget * 100) : 0;
  const hit = [100, 90, 70].find(t => before < t && after >= t);
  const lb = ll ? landlordBudget(s, ll.id) : undefined;
  const addComm = (cm: Comm, msg: string) => { s.setJobs(js => js.map(x => x.id === id ? { ...x, comms: [...x.comms, cm], landlordOk: msg.includes('said yes') ? true : x.landlordOk } : x)); s.log(msg, 'Sent to Supervisor'); s.toast(msg); };
  const u = p.budget ? Math.min(100, usedNow / p.budget * 100) : 0; const a = p.budget ? Math.min(100 - u, j.price / p.budget * 100) : 0;
  return <>
    <PageHeader crumbs={crumbsFor('requests', s.go, j.title)} back={() => s.go('requests')} title={`${j.title} · approval`}
      action={waiting && <div className="flex"><Btn kind="outline" icon={<Mail size={16} />} onClick={() => setM('email')}>Email landlord</Btn><Btn icon={<BellRing size={16} />} onClick={() => remindSupervisor(s, `${j.title} (${money(j.price)})`)}>Remind {SUPERVISOR.split(' ')[0]}</Btn></div>} />
    <DetailHead media={<span className="tile t-warn" style={{ width: 64, height: 64, borderRadius: 18 }}><Wrench size={28} /></span>} title={`${j.title} · ${money(j.price)}`}
      chips={<><Chip tone={jobTone(j.status)}>{waiting ? `Waiting for ${SUPERVISOR}` : j.status}</Chip>{j.landlordOk && <Chip tone="ok">Landlord said yes</Chip>}</>}
      meta={[['Home', p.address], ['Landlord', `${ll?.name} · ${ll?.plan}% plan`], ['Job limit', money(limit)], ['Over the limit by', money(Math.max(0, j.price - limit))]]} />
    <PageTabs value={tab} onChange={setTab} items={[{ id: 'details', label: 'Details and budget' }, { id: 'comms', label: 'Communication', count: j.comms.length }]} />
    <div className="dgrid">
      <div className="col">
        {tab === 'details' && <>
          <Card title="Budget impact" sub={`${p.address} has its own yearly repair budget of ${money(p.budget)}.`}>
            <div className="grid g4" style={{ gap: 12 }}>{[['Budget', money(p.budget)], ['Used before', `${money(usedNow)} · ${before}%`], ['This job', money(j.price)], ['Left after', money(p.budget - usedNow - j.price)]].map(([k, v]) => <div key={k} className="mt stack"><span className="caption">{k}</span><b>{v}</b></div>)}</div>
            <div className="bbar"><i className={`u ${budgetTone(after)}`} style={{ width: u + '%' }} /><i className={`j ${budgetTone(after)}`} style={{ width: a + '%' }} />{[70, 90].map(mk => <span key={mk} className="mk" style={{ left: mk + '%' }}><em>{mk}%</em></span>)}</div>
            <div className="flex wrap" style={{ gap: 14 }}><span className="legend"><i className="lg-u" />Already used</span><span className="legend"><i className="lg-j" />This job</span><span className="legend"><i className="lg-f" />Left</span></div>
            {hit ? <Note tone={hit >= 90 ? 'err' : 'warn'}>If approved, the budget goes from {before}% to {after}%. {ll?.name} gets the {hit}% alert email.</Note> : <Note tone="ok">If approved, the budget goes from {before}% to {after}%. No new alert.</Note>}
          </Card>
          <Card title="The job"><p style={{ margin: 0, lineHeight: 1.6 }}>{j.note}</p><KV rows={[['Reported by', j.by], ['Reported', j.reported], ['Contractor', c ? `${c.name} · ★ ${c.rating}` : '—'], ['Quote', money(j.price)], ['Contractor cost', money(j.cost) + ' · staff only'], ['Office Admin', adminName(j.admin)]]} />
            <Btn kind="ghost" icon={<ArrowRight size={16} />} onClick={() => s.go('jobs', id)}>Open the full job</Btn></Card>
          <Card title="History"><Timeline items={[...j.events].reverse().map(e => ({ at: e.at, text: e.text, by: e.by }))} /></Card>
        </>}
        {tab === 'comms' && <Card title="Communication with the landlord" sub="Get the landlord's OK before the Supervisor decides. Every email and reply is saved with the date and time.">
          <div className="flex wrap"><Btn sm icon={<Mail size={14} />} onClick={() => setM('email')}>Email landlord</Btn><Btn sm kind="outline" icon={<MessageSquareReply size={14} />} onClick={() => setM('reply')}>Log landlord reply</Btn></div>
          <CommsLog items={j.comms} to={ll?.email} onAdd={c2 => addComm(c2, 'Saved')} emptyText="No messages with the landlord yet." /></Card>}
      </div>
      <div className="col">
        {waiting ? <ActionCard tone="warn" title={`Waiting for ${SUPERVISOR}`} text={`${money(j.price)} is ${money(j.price - limit)} over the ${money(limit)} limit. Only the Supervisor can approve it.${j.landlordOk ? ' The landlord has said yes. That is shown to the Supervisor.' : ' Ask the landlord first so the Supervisor can decide quickly.'}`}>
          {!j.landlordOk && <Btn block icon={<Mail size={16} />} onClick={() => setM('email')}>Email landlord</Btn>}
          <Btn block kind="outline" icon={<MessageSquareReply size={16} />} onClick={() => setM('reply')}>Log landlord reply</Btn>
          <Btn block kind="ghost" icon={<BellRing size={16} />} onClick={() => remindSupervisor(s, `${j.title} (${money(j.price)})`)}>Remind {SUPERVISOR}</Btn></ActionCard>
          : <ActionCard tone={j.status === 'Declined' ? 'neutral' : 'ok'} title="Decided" text={j.status === 'Declined' ? `Declined by ${SUPERVISOR}: ${j.declined}` : `${SUPERVISOR} approved it. The job is now ${j.status.toLowerCase()}. Carry on from the job page.`}><Btn block icon={<ArrowRight size={16} />} onClick={() => s.go('jobs', id)}>Open job</Btn></ActionCard>}
        {waiting && <DemoAnswer><Btn sm kind="success" icon={<CheckCircle2 size={14} />} onClick={() => approveJob(s, j, L)}>Approve {money(j.price)}</Btn><Btn sm kind="outline" icon={<XCircle size={14} />} onClick={() => setM('decline')}>Decline</Btn></DemoAnswer>}
        {ll && <Card title="Landlord"><div className="flex"><Avatar name={ll.name} size="md" /><div className="stack grow"><button className="link" style={{ textAlign: 'left' }} onClick={() => s.go('landlords', ll.id)}>{ll.name}</button><span className="caption">{ll.plan}% plan · {ll.phone}</span></div></div><div className="flex"><Btn sm kind="outline" icon={<Phone size={14} />} onClick={() => s.toast('Calling ' + ll.phone)}>Call</Btn><Btn sm kind="outline" icon={<Mail size={14} />} onClick={() => setM('email')}>Email</Btn></div>{sortComms(j.comms)[0]?.dir === 'in' && <Note>Last message is from the landlord.</Note>}</Card>}
        <Card title="Budgets for this landlord">{lb?.props.map(x => { const pc = Math.round(x.used / (x.budget || 1) * 100); return <div key={x.id} className="stack" style={{ gap: 5 }}><span className="flex between"><b className="small" style={{ color: 'var(--text-primary)' }}>{x.address}</b><span className="caption">{pc}%</span></span><Bar value={pc} tone={budgetTone(pc)} /></div>; })}</Card>
        <HomeCard id={j.property} />
      </div>
    </div>
    {m === 'decline' && <Reason danger title="Supervisor declines" sub="You are told. The budget is not touched." cta="Decline" options={['Too expensive, get another quote', 'Landlord said no', 'Not urgent, wait', 'Landlord will fix it themselves']} onClose={() => setM('')} onDone={r => { jobEvent(s, id, `Declined by Supervisor: ${r}`, { status: 'Declined', declined: r }, SUPERVISOR); s.log(`${SUPERVISOR} declined ${j.title}: ${r}`, 'Sent to Supervisor'); s.toast('Declined. The budget was not touched.'); setM(''); }} />}
    {m === 'email' && <CommModal mode="Email" to={ll?.email} presetSubject={`Repair approval needed · ${p.address}`} presetText={`Hello ${ll?.name.split(' ')[0]},\n\n${j.title} at ${p.address} needs a repair at ${money(j.price)}. This is over your ${money(limit)} job limit, so we need your OK before we book it.\n\nYour repair budget for this property will be ${after}% used after this job.\n\nThank you,\n${ME_NAME}, LSP`} onClose={() => setM('')} onSave={cm => { addComm(cm, `Emailed ${ll?.name} about ${j.title}`); setM(''); setTab('comms'); }} />}
    {m === 'reply' && <Reason title="Log the landlord's reply" sub="Saved with today's date and time. The Supervisor sees it." cta="Save reply" label="What did they say?" options={['Landlord said yes, go ahead', 'Landlord said no', 'Landlord wants more photos', 'Landlord wants a second quote']} onClose={() => setM('')} onDone={r => { addComm({ id: 'cm' + Date.now(), at: nowStamp(), by: ll?.name ?? 'Landlord', channel: 'Email', dir: 'in', subject: 'Reply from landlord', text: r }, r.includes('yes') ? `${ll?.name} said yes to ${j.title}` : `Saved reply from ${ll?.name}`); setM(''); setTab('comms'); }} />}
  </>;
}

