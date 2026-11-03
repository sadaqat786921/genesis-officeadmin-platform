import { useRef, useState } from 'react';
import { Plus, Wrench, AlertTriangle, Image as ImageIcon, ClipboardCheck, CheckCircle2, UserPlus, Play, Upload, Undo2, Receipt, Send, XCircle, ArrowRight, PoundSterling, Lock, Phone, Star, FileText, BellRing } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { PLAN, nowStamp, SUPERVISOR, ME_NAME, type Comm, type Job } from '../data';
import { ActionCard, Avatar, Btn, Card, Chip, CommsLog, DetailHead, Field, HSteps, KV, Kpi, MiniSearch, Modal, Note, Reason, Tabs, Text, Area, Timeline, Empty } from '../ui';
import { isLeased } from '../pricing';
import { PageHeader, crumbsFor } from '../Shell';
import { AssignContractorModal, ContractorSearch, HomeCard, NewJobModal, adminName, jobEvent, jobTone, jobStepAt, lockJob, jobLines, lineSum, MANAGED_STEPS, MANAGED_STEPS_LL, CLIENT_STEPS, DONE_JOB, needsLandlord } from './shared';
import { JobTable, invoiceState } from './tables';
import { InvoiceModal, JobReportModal } from './docs';
import { EditorRoute, editorLink } from './Editor';
import { remindSupervisor } from './Requests';

export function Jobs() {
  const s = useStore();
  if (s.detail && /^(quote|invoice)~/.test(s.detail)) return <EditorRoute detail={s.detail} ctx="jobs" />;
  if (s.detail && s.jobs.some(j => j.id === s.detail)) return <JobPage id={s.detail} ctx="jobs" />;
  return <JobList />;
}

function JobList() {
  const s = useStore(); const L = useLookups();
  const [f, setF] = useState<'open' | 'urgent' | 'proof' | 'approval' | 'done'>('open'); const [kind, setKind] = useState<'all' | 'managed' | 'client'>('all'); const [q, setQ] = useState(''); const [add, setAdd] = useState(false);
  const J = s.jobs;
  const list = J.filter(j => (f === 'open' ? !DONE_JOB.includes(j.status) : f === 'proof' ? j.status === 'Proof uploaded' : f === 'urgent' ? j.urgent && !DONE_JOB.includes(j.status) : f === 'approval' ? j.status === 'Waiting approval' : DONE_JOB.includes(j.status))
    && (kind === 'all' || (kind === 'managed') === j.managed) && (j.title + (L.prop(j.property)?.address ?? '')).toLowerCase().includes(q.toLowerCase()));
  return <>
    <PageHeader crumbs={crumbsFor('jobs', s.go)} title="Jobs" action={<Btn icon={<Plus size={18} />} onClick={() => setAdd(true)}>New job</Btn>} />
    <div className="grid g4">
      <Kpi icon={<AlertTriangle size={18} />} tone="err" label="Emergencies" value={J.filter(j => j.urgent && !DONE_JOB.includes(j.status)).length} caption="act today" active={f === 'urgent'} onClick={() => setF('urgent')} />
      <Kpi icon={<Wrench size={18} />} tone="info" label="Open jobs" value={J.filter(j => !DONE_JOB.includes(j.status)).length} caption="every step" active={f === 'open'} onClick={() => setF('open')} />
      <Kpi icon={<ClipboardCheck size={18} />} tone="warn" label="Waiting approval" value={J.filter(j => j.status === 'Waiting approval').length} caption="Supervisor to approve" active={f === 'approval'} onClick={() => setF('approval')} />
      <Kpi icon={<ImageIcon size={18} />} tone="brand" label="Photos to check" value={J.filter(j => j.status === 'Proof uploaded').length} caption="approve or send back" active={f === 'proof'} onClick={() => setF('proof')} />
    </div>
    <Card title="Jobs" sub="Click a job to move it on, one step at a time. Managed homes: price, Supervisor approval (and the landlord approves an invoice first when it is over the limit), work, photo proof and the contractor's invoice, approval and invoice. Client homes: quote first."
      action={<div className="toolbar"><MiniSearch value={q} onChange={setQ} placeholder="Search jobs or homes" /><Tabs value={kind} onChange={setKind} items={[{ id: 'all', label: 'All homes' }, { id: 'managed', label: 'Managed' }, { id: 'client', label: 'Client homes' }]} /></div>}>
      <Tabs value={f} onChange={setF} items={[{ id: 'open', label: 'Open' }, { id: 'urgent', label: 'Emergency' }, { id: 'approval', label: 'Waiting approval' }, { id: 'proof', label: 'Photos to check' }, { id: 'done', label: 'Finished' }]} />
      <JobTable list={list} search={false} />
    </Card>
    {add && <NewJobModal onClose={() => setAdd(false)} onCreated={id => s.go('jobs', id)} />}
  </>;
}

/* ================= JOB DETAIL (also used for client job requests) ================= */
export function JobPage({ id, ctx }: { id: string; ctx: 'jobs' | 'clients' }) {
  const s = useStore(); const L = useLookups(); const j = s.jobs.find(x => x.id === id)!;
  const p = L.prop(j.property); const ll = p?.managed ? L.landlord(p.owner) : undefined; const cl = !p?.managed ? L.client(p?.owner) : undefined;
  const limit = ll ? PLAN[ll.plan].limit : 0; const c = L.contractor(j.contractor);
  const [m, setM0] = useState<'' | 'assign' | 'back' | 'decline' | 'pay' | 'inv' | 'report' | 'done' | 'fdecline' | 'lldecline'>('');
  const setM = (v: typeof m | 'quote') => v === 'quote' ? s.go(ctx, editorLink('quote', id)) : setM0(v);
  const [price, setPrice] = useState(j.price ? String(j.price) : ''); const [pc, setPc] = useState(j.contractor ?? '');
  const [hours, setHours] = useState(j.hours ? String(j.hours) : ''); const [auto, setAuto] = useState(!j.price); const [pick, setPick] = useState(false);
  const pcC = L.contractor(pc); const labour = pcC && +hours ? Math.round(+hours * pcC.rate * 100) / 100 : 0;
  const shownPrice = auto ? (labour ? String(labour) : '') : price;
  const over = j.price > limit; const nl = needsLandlord(j, L); const fr = j.followReq;
  const fileRef = useRef<HTMLInputElement>(null);
  const steps = j.managed ? (nl ? MANAGED_STEPS_LL : MANAGED_STEPS) : CLIENT_STEPS; const at = jobStepAt(j, nl);
  const inv = j.invoice ? s.invoices.find(i => i.id === j.invoice) : undefined;
  const done = ['Approved', 'Invoiced', 'Declined'].includes(j.status);
  const ev = (text: string, patch: Partial<Job> = {}, area = 'Jobs') => { jobEvent(s, id, text, patch); s.log(`${j.title} at ${p?.address}: ${text}`, area); s.toast(text); };
  const addComm = (cm: Comm) => { s.setJobs(js => js.map(x => x.id === id ? { ...x, comms: [...x.comms, cm] } : x)); s.toast('Saved'); };
  const back = () => s.go(ctx);
  const savePrice = () => {
    if (!pcC) return; const v = +shownPrice; const h = +hours; const cost = Math.round(h * pcC.rate * 100) / 100;
    ev(`Priced at ${money(v)} (${pcC.name}, ${h} hours at ${money(pcC.rate)}). ${v > limit ? 'Over' : 'Under'} the ${money(limit)} limit. Sent for Supervisor approval.`, { price: v, cost, hours: h, rate: pcC.rate, contractor: pc, status: 'Waiting approval' }, 'Approvals');
  };
  /** The contractor's follow-up request becomes its own job, waiting for the Supervisor. */
  const sendFollow = () => {
    if (!fr) return; const nid = 'J' + (Date.now() % 100000); const at2 = nowStamp(); const rate = c?.rate ?? 0;
    s.setJobs(js => [{ id: nid, title: fr.title, property: j.property, managed: true, contractor: j.contractor, hours: fr.hours, rate, cost: Math.round(fr.hours * rate * 100) / 100, price: fr.amount, status: 'Waiting approval' as const, reported: at2, by: `Contractor · ${c?.name} (follow-up)`, tenant: j.tenant, admin: j.admin, category: j.category, note: fr.note, followOf: j.id, comms: [], events: [{ at: fr.at, by: c?.name ?? 'Contractor', text: `Asked for follow-up work while doing "${j.title}"` }, { at: at2, by: ME_NAME, text: `Checked and sent for Supervisor approval: ${money(fr.amount)}` }] },
      ...js.map(x => x.id === id ? { ...x, followReq: { ...fr, status: 'Sent to Supervisor' as const, job: nid }, events: [...x.events, { at: at2, by: ME_NAME, text: `Follow-up work "${fr.title}" sent for Supervisor approval as a new job` }] } : x)]);
    s.log(`Sent follow-up work "${fr.title}" (${money(fr.amount)}) at ${p?.address} for Supervisor approval`, 'Approvals'); s.toast('Follow-up job sent for Supervisor approval');
  };
  const proof = (names: string[]) => ev(`Photo proof uploaded (${names.length} photos)`, { status: 'Proof uploaded', proof: names });

  const action = (() => {
    switch (j.status) {
      case 'New': return j.managed
        ? <ActionCard text={`Assign a contractor, add the hours and the budget amount. Then it goes to the Supervisor for approval. Over ${money(limit)}, the landlord also approves an invoice before work starts.`}><Btn block kind="outline" icon={<XCircle size={16} />} onClick={() => setM('decline')}>Decline job</Btn></ActionCard>
        : <ActionCard text={`${cl?.name} asked for this job. Send them a quote first.`}><Btn block icon={<Plus size={16} />} onClick={() => setM('quote')}>Create quote</Btn><Btn block kind="outline" icon={<XCircle size={16} />} onClick={() => setM('decline')}>Decline request</Btn></ActionCard>;
      case 'Quote sent': return <ActionCard text={`Quote ${j.quoteNo ?? ''} of ${money(j.price)} sent to ${cl?.name}${j.validUntil ? `. Valid until ${j.validUntil}` : ''}. Waiting for them to accept.`}><Btn block icon={<CheckCircle2 size={16} />} onClick={() => ev(`${cl?.name} accepted the quote`, { status: 'Quote accepted' }, 'Clients')}>Client accepted</Btn><Btn block kind="outline" onClick={() => ev(`${cl?.name} declined the quote`, { status: 'Declined', declined: 'Client declined the quote' }, 'Clients')}>Client declined</Btn><Btn block kind="ghost" icon={<Send size={16} />} onClick={() => setM('quote')}>Edit and resend quote</Btn></ActionCard>;
      case 'Quote accepted': return <ActionCard tone="ok" text={c ? `Quote accepted. Send the job to ${c.name}.` : 'Quote accepted. Assign a contractor.'}>{c ? <Btn block icon={<UserPlus size={16} />} onClick={() => ev(`${c.name} assigned`, { status: 'Assigned' })}>Assign {c.name}</Btn> : null}<Btn block kind={c ? 'outline' : 'primary'} icon={<UserPlus size={16} />} onClick={() => setM('assign')}>{c ? 'Choose someone else' : 'Assign contractor'}</Btn></ActionCard>;
      case 'Waiting approval': return <ActionCard tone="warn" title={`Waiting for ${SUPERVISOR}`} text={`${money(j.price)} is ${over ? 'over' : 'under'} ${ll?.name}'s ${money(limit)} job limit. Every managed job needs the Supervisor's approval.${nl ? ' After that, the landlord approves the invoice before work starts.' : ''}`}><Btn block icon={<ArrowRight size={16} />} onClick={() => s.go('requests', id)}>Open approval and budget</Btn><Btn block kind="ghost" icon={<BellRing size={16} />} onClick={() => remindSupervisor(s, `${j.title} (${money(j.price)})`)}>Remind {SUPERVISOR}</Btn></ActionCard>;
      case 'Landlord approval': return j.landlordAsk
        ? <ActionCard tone="warn" title="Waiting for the landlord" text={`Invoice ${j.invoice} for ${money(j.price)} sent to ${ll?.name} on ${j.landlordAsk}. No work starts until they approve it.`}><Btn block icon={<CheckCircle2 size={16} />} onClick={() => ev(`${ll?.name} approved invoice ${j.invoice}. ${c?.name} has the job.`, { status: 'Assigned', landlordOk: true })}>Landlord approved</Btn><Btn block kind="outline" icon={<XCircle size={16} />} onClick={() => setM('lldecline')}>Landlord said no</Btn></ActionCard>
        : <ActionCard tone="warn" title="Landlord approval" text={`The Supervisor approved ${money(j.price)}. Now send ${ll?.name} the invoice to approve before any work starts.`}><Btn block icon={<Receipt size={16} />} onClick={() => s.go(ctx, editorLink('invoice', id))}>Create invoice for approval</Btn></ActionCard>;
      case 'Ready to assign': return <ActionCard text="The price is agreed. Assign a contractor with documents in date."><Btn block icon={<UserPlus size={16} />} onClick={() => setM('assign')}>Assign contractor</Btn></ActionCard>;
      case 'Assigned': return <ActionCard text={`${c?.name} has the job. Mark it started when they begin.`}><Btn block icon={<Play size={16} />} onClick={() => ev(`${c?.name} started the work`, { status: 'In progress' })}>Mark work started</Btn></ActionCard>;
      case 'In progress': case 'Sent back': return j.managed
        ? <ActionCard text={j.status === 'Sent back' ? `Sent back: ${j.sentBack}. Waiting for new photos.` : `${c?.name} is doing the work. When it is finished they upload before and after photos, their invoice and any follow-up work.`}><Btn block icon={<Upload size={16} />} onClick={() => setM('done')}>Contractor finished the job</Btn></ActionCard>
        : <ActionCard text={j.status === 'Sent back' ? `Sent back: ${j.sentBack}. Waiting for new photos.` : `${c?.name} is doing the work. They upload before and after photos when it is finished.`}><Btn block icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>Upload photo proof</Btn><Btn block kind="outline" onClick={() => proof(['Before', 'After', 'Receipt'])}>Contractor uploaded photos</Btn></ActionCard>;
      case 'Proof uploaded': return <ActionCard tone="ok" text={j.managed ? `Check the photos and ${c?.name}'s invoice${j.cInvoice ? ` ${j.cInvoice.no} (${money(j.cInvoice.amount)})` : ''}. If the work is done properly, approve it. The record locks.${fr?.status === 'Asked' ? ' They also asked for follow-up work. Decide on it below.' : ''}` : 'Check the photos. If the work is done properly, approve it. The record locks.'}><Btn block icon={<CheckCircle2 size={16} />} onClick={() => lockJob(s, j, L)}>Approve work</Btn><Btn block kind="outline" icon={<Undo2 size={16} />} onClick={() => setM('back')}>Send back to contractor</Btn></ActionCard>;
      case 'Approved': return j.managed && j.landlordAsk && j.invoice
        ? <ActionCard text={`Work approved${j.cInvoice ? ` and ${c?.name}'s invoice is approved for payment` : ''}. ${ll?.name} already approved invoice ${j.invoice}. Send it as the final invoice.`}><Btn block icon={<Send size={16} />} onClick={() => ev(`Final invoice ${j.invoice} sent to ${ll?.name}`, { status: 'Invoiced' }, 'Rent & Invoices')}>Send final invoice</Btn></ActionCard>
        : <ActionCard text={`Work approved${j.managed && j.cInvoice ? ` and ${c?.name}'s invoice is approved for payment` : ''}. Send the ${money(j.price)} invoice to ${L.ownerName(p)}.`}><Btn block icon={<Receipt size={16} />} onClick={() => s.go(ctx, editorLink('invoice', id))}>Create and send invoice</Btn></ActionCard>;
      case 'Invoiced': return <ActionCard tone="ok" title="Done" text={inv ? `Invoice ${inv.id} · ${invoiceState(inv).label}.` : 'Invoice sent.'}>{inv && inv.paid < inv.amount && <Btn block icon={<PoundSterling size={16} />} onClick={() => { s.setInvoices(is => is.map(x => x.id === inv.id ? { ...x, paid: x.amount, overdue: false } : x)); ev(`Invoice ${inv.id} paid`, {}, 'Rent & Invoices'); }}>Mark invoice paid</Btn>}<Btn block kind="outline" icon={<Receipt size={16} />} onClick={() => setM('inv')}>View invoice</Btn><Btn block kind="outline" icon={<Lock size={16} />} onClick={() => s.go('records')}>See locked record</Btn></ActionCard>;
      default: return <ActionCard tone="neutral" title="Not going ahead" text={j.declined} />;
    }
  })();

  return <>
    <PageHeader crumbs={ctx === 'jobs' ? crumbsFor('jobs', s.go, j.title) : crumbsFor('clients', s.go, j.title)} back={back} title={j.title}
      action={<div className="flex"><Btn kind="ghost" icon={<FileText size={16} />} onClick={() => setM('report')}>Job report</Btn>{c && !done && <Btn kind="outline" icon={<UserPlus size={16} />} onClick={() => setM('assign')}>Change contractor</Btn>}{j.status === 'Proof uploaded' && <Btn icon={<CheckCircle2 size={16} />} onClick={() => lockJob(s, j, L)}>Approve work</Btn>}</div>} />
    <DetailHead media={<span className={`tile ${j.urgent && !done ? 't-err' : 't-info'}`} style={{ width: 64, height: 64, borderRadius: 18 }}><Wrench size={28} /></span>} title={j.title}
      chips={<><Chip tone={jobTone(j.status)}>{j.status}</Chip>{j.urgent && <Chip tone="err">Emergency</Chip>}{j.followOf && <Chip tone="brand" dot={false}>Follow-up · from contractor</Chip>}<Chip tone="neutral" dot={false}>{j.managed ? 'Managed home' : 'Client home'}</Chip><Chip tone="neutral" dot={false}>{j.category}</Chip></>}
      meta={[['Home', p?.address ?? ''], ['Reported', j.reported], ['By', j.by], ['Office Admin', adminName(j.admin)]]} />
    <Card><HSteps items={steps} at={at} stopped={j.status === 'Declined' ? 'Declined' : j.status === 'Sent back' ? 'Sent back' : undefined} /></Card>
    {j.urgent && !done && <Note tone="err">Emergency. Get someone there today and call the tenant back.</Note>}
    <div className="dgrid">
      <div className="col">
        {j.status === 'New' && j.managed && <Card title="Step 1 · Price the job" sub={`${ll?.name} is on the ${ll?.plan}% plan. Job limit ${money(limit)}. Every job then goes to the Supervisor for approval.`}>
          {pcC && !pick ? <div className="lrow"><Avatar name={pcC.name} /><div className="stack grow"><b>{pcC.name}</b><span className="caption">{pcC.trade} · ★ {pcC.rating}</span></div><Btn sm kind="ghost" onClick={() => setPick(true)}>Change</Btn></div>
            : pick ? <ContractorSearch value={pc} onPick={x => { setPc(x); setPick(false); }} />
            : <Btn kind="outline" icon={<UserPlus size={16} />} onClick={() => setPick(true)}>Assign contractor</Btn>}
          <div className="grid g3">
            <Field label="Hourly rate"><input className="input" readOnly value={pcC ? `${money(pcC.rate)} an hour` : 'Assign a contractor first'} /></Field>
            <Field label="Hours for this job"><Text value={hours} onChange={setHours} placeholder="e.g. 3" /></Field>
            <Field label="Budget amount (£)" hint={labour ? `${hours} hours × ${money(pcC!.rate)} = ${money(labour)}` : undefined}><Text value={shownPrice} onChange={v => { setAuto(false); setPrice(v); }} placeholder="e.g. 180" /></Field>
          </div>
          {+shownPrice > 0 && (+shownPrice > limit ? <Note tone="warn">{money(+shownPrice)} is over the {money(limit)} limit. {isLeased(p) ? 'The Supervisor approves it.' : `After the Supervisor approves, ${ll?.name} gets an invoice to approve before any work starts.`}</Note> : <Note tone="ok">{money(+shownPrice)} is under the {money(limit)} limit. The Supervisor approves it, then {pcC?.name ?? 'the contractor'} gets the job.</Note>)}
          <Btn disabled={!pcC || !+hours || !+shownPrice} onClick={savePrice}>Save and send for approval</Btn>
        </Card>}
        {(j.proof || j.status === 'Proof uploaded') && <Card title="Photo proof" sub={j.status === 'Proof uploaded' ? 'Uploaded by the contractor. Check before you approve.' : 'Kept with the locked record.'}>
          <div className="photos">{(j.proof ?? []).map((x, i) => <div key={x + i} className="ph" style={{ backgroundImage: `url(images/home${(i % 3) + 1}.jpg)` }}><span>{x}</span></div>)}</div></Card>}
        {(j.status === 'Approved' || j.status === 'Invoiced' || j.cInvoice || (j.managed && j.invoice)) && <Card title={j.managed ? 'Invoices' : 'Invoice'} sub={j.managed ? 'The landlord invoice and the contractor\'s own invoice. Both stay with this job and the property.' : `Client invoices are due in ${cl?.terms ?? '30 days'}.`}>
          {(j.status === 'Approved' || j.status === 'Invoiced' || j.invoice) && <div className="lrow"><Receipt size={18} color="var(--text-brand)" /><div className="stack grow"><b>{inv ? inv.id : 'Not sent yet'}</b><span className="caption">To {L.ownerName(p)} · {money(j.price)}{j.status === 'Landlord approval' ? ' · sent for approval before work' : ''}</span></div>{inv && <Chip tone={j.status === 'Landlord approval' ? 'warn' : invoiceState(inv).tone}>{j.status === 'Landlord approval' ? 'Waiting for approval' : invoiceState(inv).label}</Chip>}</div>}
          {j.cInvoice && <div className="lrow"><Receipt size={18} color="var(--text-brand)" /><div className="stack grow"><b>{j.cInvoice.no} · from {c?.name}</b><span className="caption">Contractor's invoice · {money(j.cInvoice.amount)} · uploaded {j.cInvoice.at} · staff only</span></div><Chip tone={DONE_JOB.includes(j.status) ? (c?.bills.find(b => b.id === j.cInvoice!.no)?.status === 'Paid' ? 'ok' : 'info') : 'warn'}>{DONE_JOB.includes(j.status) ? (c?.bills.find(b => b.id === j.cInvoice!.no)?.status === 'Paid' ? 'Paid' : 'Approved for payment') : 'To check'}</Chip></div>}</Card>}
        {fr && <Card title="Follow-up work" sub={`Asked by ${c?.name} on ${fr.at}, while doing this job.`} action={<Chip tone={fr.status === 'Asked' ? 'warn' : fr.status === 'Declined' ? 'neutral' : 'info'}>{fr.status === 'Asked' ? 'Needs your decision' : fr.status}</Chip>}>
          <div className="lrow"><Wrench size={18} color="var(--text-brand)" /><div className="stack grow"><b>{fr.title}</b><span className="caption">{fr.note}</span></div><b>{money(fr.amount)}</b></div>
          <KV rows={[['Hours', `${fr.hours} at ${money(c?.rate ?? 0)} an hour`], ['Budget amount', money(fr.amount)]]} />
          {fr.status === 'Asked' && <div className="flex wrap"><Btn icon={<Send size={16} />} onClick={sendFollow}>Send to the Supervisor for approval</Btn><Btn kind="outline" icon={<XCircle size={16} />} onClick={() => setM('fdecline')}>Decline</Btn></div>}
          {fr.status === 'Sent to Supervisor' && fr.job && <Btn kind="ghost" icon={<ArrowRight size={16} />} onClick={() => s.go('jobs', fr.job)}>Open the follow-up job</Btn>}
          {fr.status === 'Declined' && <Note>Declined: {fr.reason}</Note>}
        </Card>}
        {!j.managed && j.quoteNo && <Card title={`Quote ${j.quoteNo}`} sub={`${j.quoted ? 'Sent ' + j.quoted : 'Draft, not sent yet'}${j.validUntil ? ' · valid until ' + j.validUntil : ''}`} action={!done && <Btn sm kind="ghost" icon={<Send size={14} />} onClick={() => setM('quote')}>Edit</Btn>}>
          <div className="tablewrap"><table className="t"><thead><tr><th>Product or service</th><th>Description</th><th>Qty</th><th>Rate</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead><tbody>{jobLines(j).map((l, i) => <tr key={i} className="static"><td><span className="stack"><b className="strong">{l.activity}</b>{l.code && l.code !== 'DISCOUNT' && <span className="caption">{l.code}</span>}</span></td><td>{l.desc}</td><td>{l.qty}</td><td>{money(l.rate)}</td><td style={{ textAlign: 'right' }}><b>{money(Math.round(l.qty * l.rate * 100) / 100)}</b></td></tr>)}</tbody></table></div>
          <div className="flex between"><span className="label">Quote total</span><b style={{ fontSize: 18 }}>{money(lineSum(jobLines(j)))}</b></div>
          {(j.attachments?.length || j.memo) && <KV rows={[...(j.attachments?.length ? [['Attachments', j.attachments.join(', ')] as [string, string]] : []), ...(j.memo ? [['Memo (staff only)', j.memo] as [string, string]] : [])]} />}</Card>}
        <Card title="What's wrong"><p style={{ margin: 0, lineHeight: 1.6 }}>{j.note ?? 'No details given.'}</p>
          <KV rows={[['Reported by', j.by], ['Reported on', j.reported], ['Type of work', j.category], ...(j.followOf ? [['Follow-up of', <button className="link" onClick={() => s.go('jobs', j.followOf)}>{s.jobs.find(x => x.id === j.followOf)?.title}</button>] as [string, React.ReactNode]] : []), ...(j.tenant ? [['Tenant', <button className="link" onClick={() => s.go('tenants', j.tenant)}>{L.tenant(j.tenant)?.name}</button>] as [string, React.ReactNode]] : [])]} /></Card>
        <Card title="Communication" sub="Calls and emails with the tenant, landlord, client or contractor."><CommsLog items={j.comms} to={ll?.email ?? cl?.email} onAdd={addComm} /></Card>
        <Card title="Job history" sub="Every step, with the date and time."><Timeline items={[...j.events].reverse().map(e => ({ at: e.at, text: e.text, by: e.by }))} /></Card>
      </div>
      <div className="col">
        {action}
        <Card title="Contractor">{c ? <><div className="flex"><Avatar name={c.name} size="md" /><div className="stack grow"><button className="link" style={{ textAlign: 'left' }} onClick={() => s.go('contractors', c.id)}>{c.name}</button><span className="caption">{c.trade} · {money(c.rate)} an hour · <Star size={11} style={{ verticalAlign: -1 }} /> {c.rating}</span></div></div><div className="flex"><Btn sm kind="outline" icon={<Phone size={14} />} onClick={() => s.toast('Calling ' + c.phone)}>Call</Btn>{!done && <Btn sm kind="ghost" onClick={() => setM('assign')}>Change</Btn>}</div></> : <><span className="caption">No contractor yet.</span>{!done && !['New', 'Quote sent'].includes(j.status) && <Btn sm icon={<UserPlus size={14} />} onClick={() => setM('assign')}>Assign</Btn>}</>}</Card>
        <Card title="Money"><KV rows={[...(j.managed ? [['Hours', j.hours ? `${j.hours} at ${money(j.rate ?? c?.rate ?? 0)} an hour` : '—'] as [string, string]] : []), ['Contractor cost', j.cost ? money(j.cost) + ' · staff only' : '—'], [j.managed ? 'Budget amount' : 'Price', j.price ? money(j.price) : '—'], ['LSP margin', j.price ? money(j.price - j.cost) : '—'], ...(ll ? [['Job limit', `${money(limit)} (${ll.plan}% plan)`] as [string, string], ['Budget left', p ? money(p.budget - p.used) : '—'] as [string, string]] : [])]} /></Card>
        <HomeCard id={j.property} />
      </div>
    </div>
    <input ref={fileRef} type="file" accept="image/*" multiple hidden aria-label="Photo proof" onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) proof(fs.map(f => f.name.replace(/\.[^.]+$/, ''))); }} />
    {m === 'assign' && <AssignContractorModal title={c ? 'Change contractor' : 'Assign a contractor'} onClose={() => setM('')} onPick={x => { ev(`${L.contractor(x)?.name} ${c ? 'now has the job (was ' + c.name + ')' : 'assigned'}`, { contractor: x, status: ['Ready to assign', 'Quote accepted', 'New'].includes(j.status) && j.status !== 'New' ? 'Assigned' : j.status }); setM(''); }} />}
    {m === 'back' && <Reason title="Send back to the contractor" sub="They see your note and must fix it and upload new photos." cta="Send back" placeholder="e.g. After photo doesn't show the finished wall" onClose={() => setM('')} onDone={r => { ev(`Sent back: ${r}`, { status: 'Sent back', sentBack: r }); setM(''); }} />}
    {m === 'decline' && <Reason danger title="Decline this job" sub="The person who reported it is told. Nothing is charged." cta="Decline" options={['Not LSP’s responsibility', 'Tenant damage, tenant to pay', 'Duplicate of another job', 'Landlord will fix it themselves']} onClose={() => setM('')} onDone={r => { ev(`Declined: ${r}`, { status: 'Declined', declined: r }); setM(''); }} />}
    {m === 'done' && <ContractorDone id={id} onClose={() => setM('')} />}
    {m === 'fdecline' && fr && <Reason danger title="Decline the follow-up work" sub={`${c?.name} is told. Nothing is charged.`} cta="Decline" options={['Not needed now', 'Too expensive', 'Landlord will arrange it', 'Already covered by this job']} onClose={() => setM('')} onDone={r => { ev(`Follow-up work "${fr.title}" declined: ${r}`, { followReq: { ...fr, status: 'Declined', reason: r } }); setM(''); }} />}
    {m === 'lldecline' && <Reason danger title="The landlord said no" sub="The job stops. The amount goes back into the maintenance budget." cta="Save" options={['Too expensive', 'Landlord will fix it themselves', 'Wants a second quote', 'Not needed now']} onClose={() => setM('')} onDone={r => { s.setProperties(ps => ps.map(x => x.id === j.property ? { ...x, used: Math.max(0, x.used - j.price) } : x)); ev(`Landlord said no: ${r}. ${money(j.price)} back in the budget.`, { status: 'Declined', declined: `Landlord said no: ${r}` }); setM(''); }} />}
    {m === 'inv' && <InvoiceModal job={s.jobs.find(x => x.id === id)} onClose={() => setM('')} />}
    {m === 'report' && <JobReportModal jobs={[j]} title={`Job report · ${j.title}`} onClose={() => setM('')} />}
  </>;
}


/** Prototype: what the contractor sends from their own app when they finish. Photos, their invoice and any follow-up work. */
function ContractorDone({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useStore(); const L = useLookups(); const j = s.jobs.find(x => x.id === id)!; const c = L.contractor(j.contractor); const p = L.prop(j.property);
  const ref = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>(['Before', 'After']);
  const [no, setNo] = useState(`${(c?.name ?? 'CT').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}-${2240 + s.jobs.length}`);
  const [amount, setAmount] = useState(String(j.cost || ''));
  const [follow, setFollow] = useState(false); const [ft, setFt] = useState(''); const [fn, setFn] = useState(''); const [fh, setFh] = useState(''); const [fa, setFa] = useState('');
  const fAmount = fa || (+fh && c ? String(Math.round(+fh * c.rate * 100) / 100) : '');
  const save = () => {
    const at = nowStamp();
    const patch: Partial<Job> = { status: 'Proof uploaded', proof: photos, cInvoice: { no, amount: +amount, at }, ...(follow ? { followReq: { title: ft, note: fn, hours: +fh, amount: +fAmount, at, status: 'Asked' as const } } : {}) };
    jobEvent(s, id, `Finished. Uploaded ${photos.length} photos and invoice ${no} (${money(+amount)})`, patch, c?.name);
    if (follow) jobEvent(s, id, `Asked for follow-up work: ${ft} (${money(+fAmount)})`, {}, c?.name);
    s.log(`${c?.name} finished ${j.title} at ${p?.address}: photos and invoice ${no}${follow ? ', plus a follow-up request' : ''}`, 'Jobs');
    s.toast(follow ? 'Photos, invoice and follow-up request received' : 'Photos and invoice received'); onClose();
  };
  return <Modal wide title={`${c?.name} finished the job`} sub="Prototype: in the live system the contractor sends this from their own app." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Upload size={16} />} disabled={!photos.length || !no || !+amount || (follow && (!ft || !+fAmount))} onClick={save}>Send to the Office Admin</Btn></>}>
    <Field label="Photo proof"><div className="flex wrap">{photos.map(x => <Chip key={x} tone="neutral" dot={false}>{x}</Chip>)}<Btn sm kind="outline" icon={<ImageIcon size={14} />} onClick={() => ref.current?.click()}>Add photos</Btn></div></Field>
    <input ref={ref} type="file" accept="image/*" multiple hidden aria-label="Photo proof" onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) setPhotos(ps => [...ps, ...fs.map(f => f.name.replace(/\.[^.]+$/, ''))]); }} />
    <div className="grid g2"><Field label="Contractor's invoice number"><Text value={no} onChange={setNo} /></Field><Field label="Invoice amount (£)" hint={j.hours ? `Agreed: ${j.hours} hours at ${money(j.rate ?? c?.rate ?? 0)}` : undefined}><Text value={amount} onChange={setAmount} /></Field></div>
    <label className="check" style={{ cursor: 'pointer' }}><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} /> Ask for follow-up work</label>
    {follow && <>
      <Field label="What else needs doing"><Text value={ft} onChange={setFt} placeholder="e.g. Replace corroded pipe under the sink" /></Field>
      <Field label="Details"><Area value={fn} onChange={setFn} placeholder="Why it is needed" /></Field>
      <div className="grid g2"><Field label="Hours"><Text value={fh} onChange={setFh} placeholder="e.g. 2" /></Field><Field label="Budget amount (£)" hint={c ? `${money(c.rate)} an hour` : undefined}><Text value={fAmount} onChange={setFa} /></Field></div>
      <Note>The Office Admin checks it, then declines it or sends it to the Supervisor for approval as a new job.</Note>
    </>}
  </Modal>;
}
