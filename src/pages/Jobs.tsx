import { useRef, useState } from 'react';
import { Plus, Wrench, AlertTriangle, Image as ImageIcon, ClipboardCheck, CheckCircle2, UserPlus, Play, Upload, Undo2, Receipt, Send, XCircle, ArrowRight, PoundSterling, Lock, Phone, Star, FileText, BellRing } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { PLAN, nowStamp, SUPERVISOR, type Comm, type Job } from '../data';
import { ActionCard, Avatar, Btn, Card, Chip, CommsLog, DetailHead, Field, HSteps, KV, Kpi, MiniSearch, Modal, Note, Reason, Select, Tabs, Text, Timeline, Empty } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { AssignContractorModal, HomeCard, NewJobModal, adminName, jobEvent, jobTone, jobStepAt, lockJob, jobLines, lineSum, MANAGED_STEPS, CLIENT_STEPS, DONE_JOB } from './shared';
import { JobTable, invoiceState } from './tables';
import { QuoteBuilder, InvoiceModal, JobReportModal } from './docs';
import { remindSupervisor } from './Requests';

export function Jobs() {
  const s = useStore();
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
      <Kpi icon={<ClipboardCheck size={18} />} tone="warn" label="Waiting approval" value={J.filter(j => j.status === 'Waiting approval').length} caption="over the job limit" active={f === 'approval'} onClick={() => setF('approval')} />
      <Kpi icon={<ImageIcon size={18} />} tone="brand" label="Photos to check" value={J.filter(j => j.status === 'Proof uploaded').length} caption="approve or send back" active={f === 'proof'} onClick={() => setF('proof')} />
    </div>
    <Card title="Jobs" sub="Click a job to move it on, one step at a time: price, approval, contractor, work, photo proof, approval and invoice."
      action={<div className="toolbar"><MiniSearch value={q} onChange={setQ} placeholder="Search jobs or homes" /><Tabs value={kind} onChange={setKind} items={[{ id: 'all', label: 'All homes' }, { id: 'managed', label: 'Managed' }, { id: 'client', label: 'Client homes' }]} /></div>}>
      <Tabs value={f} onChange={setF} items={[{ id: 'open', label: 'Open' }, { id: 'urgent', label: 'Emergency' }, { id: 'approval', label: 'Waiting approval' }, { id: 'proof', label: 'Photos to check' }, { id: 'done', label: 'Finished' }]} />
      <JobTable list={list} />
    </Card>
    {add && <NewJobModal onClose={() => setAdd(false)} onCreated={id => s.go('jobs', id)} />}
  </>;
}

/* ================= JOB DETAIL (also used for client job requests) ================= */
export function JobPage({ id, ctx }: { id: string; ctx: 'jobs' | 'clients' }) {
  const s = useStore(); const L = useLookups(); const j = s.jobs.find(x => x.id === id)!;
  const p = L.prop(j.property); const ll = p?.managed ? L.landlord(p.owner) : undefined; const cl = !p?.managed ? L.client(p?.owner) : undefined;
  const limit = ll ? PLAN[ll.plan].limit : 0; const c = L.contractor(j.contractor);
  const [m, setM] = useState<'' | 'assign' | 'back' | 'decline' | 'quote' | 'pay' | 'inv' | 'report'>('');
  const [price, setPrice] = useState(j.price ? String(j.price) : ''); const [pc, setPc] = useState(j.contractor ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const steps = j.managed ? MANAGED_STEPS : CLIENT_STEPS; const at = jobStepAt(j);
  const inv = j.invoice ? s.invoices.find(i => i.id === j.invoice) : undefined;
  const done = ['Approved', 'Invoiced', 'Declined'].includes(j.status);
  const ev = (text: string, patch: Partial<Job> = {}, area = 'Jobs') => { jobEvent(s, id, text, patch); s.log(`${j.title} at ${p?.address}: ${text}`, area); s.toast(text); };
  const addComm = (cm: Comm) => { s.setJobs(js => js.map(x => x.id === id ? { ...x, comms: [...x.comms, cm] } : x)); s.toast('Saved'); };
  const back = () => s.go(ctx);
  const savePrice = () => {
    const v = +price; const cost = Math.round(v * .8);
    if (v > limit) ev(`Priced at ${money(v)}. Over the ${money(limit)} job limit, sent for approval.`, { price: v, cost, contractor: pc || undefined, status: 'Waiting approval' }, 'Approvals');
    else ev(`Priced at ${money(v)}. Under the ${money(limit)} limit, no approval needed.`, { price: v, cost, contractor: pc || undefined, status: pc ? 'Assigned' : 'Ready to assign' });
  };
  const proof = (names: string[]) => ev(`Photo proof uploaded (${names.length} photos)`, { status: 'Proof uploaded', proof: names });

  const action = (() => {
    switch (j.status) {
      case 'New': return j.managed
        ? <ActionCard text={`Get a price from a contractor. Under ${money(limit)} it goes ahead. Over it, it comes to you for approval.`}><Btn block kind="outline" icon={<XCircle size={16} />} onClick={() => setM('decline')}>Decline job</Btn></ActionCard>
        : <ActionCard text={`${cl?.name} asked for this job. Send them a quote first.`}><Btn block icon={<Plus size={16} />} onClick={() => setM('quote')}>Create quote</Btn><Btn block kind="outline" icon={<XCircle size={16} />} onClick={() => setM('decline')}>Decline request</Btn></ActionCard>;
      case 'Quote sent': return <ActionCard text={`Quote ${j.quoteNo ?? ''} of ${money(j.price)} sent to ${cl?.name}${j.validUntil ? `. Valid until ${j.validUntil}` : ''}. Waiting for them to accept.`}><Btn block icon={<CheckCircle2 size={16} />} onClick={() => ev(`${cl?.name} accepted the quote`, { status: 'Quote accepted' }, 'Clients')}>Client accepted</Btn><Btn block kind="outline" onClick={() => ev(`${cl?.name} declined the quote`, { status: 'Declined', declined: 'Client declined the quote' }, 'Clients')}>Client declined</Btn><Btn block kind="ghost" icon={<Send size={16} />} onClick={() => setM('quote')}>Edit and resend quote</Btn></ActionCard>;
      case 'Quote accepted': return <ActionCard tone="ok" text={c ? `Quote accepted. Send the job to ${c.name}.` : 'Quote accepted. Assign a contractor.'}>{c ? <Btn block icon={<UserPlus size={16} />} onClick={() => ev(`${c.name} assigned`, { status: 'Assigned' })}>Assign {c.name}</Btn> : null}<Btn block kind={c ? 'outline' : 'primary'} icon={<UserPlus size={16} />} onClick={() => setM('assign')}>{c ? 'Choose someone else' : 'Assign contractor'}</Btn></ActionCard>;
      case 'Waiting approval': return <ActionCard tone="warn" title={`Waiting for ${SUPERVISOR}`} text={`${money(j.price)} is over ${ll?.name}'s ${money(limit)} job limit. Only the Supervisor can approve it. Get the landlord's OK first so it is quick.`}><Btn block icon={<ArrowRight size={16} />} onClick={() => s.go('requests', id)}>Open approval and budget</Btn><Btn block kind="ghost" icon={<BellRing size={16} />} onClick={() => remindSupervisor(s, `${j.title} (${money(j.price)})`)}>Remind {SUPERVISOR}</Btn></ActionCard>;
      case 'Ready to assign': return <ActionCard text="The price is agreed. Assign a contractor with documents in date."><Btn block icon={<UserPlus size={16} />} onClick={() => setM('assign')}>Assign contractor</Btn></ActionCard>;
      case 'Assigned': return <ActionCard text={`${c?.name} has the job. Mark it started when they begin.`}><Btn block icon={<Play size={16} />} onClick={() => ev(`${c?.name} started the work`, { status: 'In progress' })}>Mark work started</Btn></ActionCard>;
      case 'In progress': case 'Sent back': return <ActionCard text={j.status === 'Sent back' ? `Sent back: ${j.sentBack}. Waiting for new photos.` : `${c?.name} is doing the work. They upload before and after photos when it is finished.`}><Btn block icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>Upload photo proof</Btn><Btn block kind="outline" onClick={() => proof(['Before', 'After', 'Receipt'])}>Contractor uploaded photos</Btn></ActionCard>;
      case 'Proof uploaded': return <ActionCard tone="ok" text="Check the photos. If the work is done properly, approve it. The record locks."><Btn block icon={<CheckCircle2 size={16} />} onClick={() => lockJob(s, j, L)}>Approve work</Btn><Btn block kind="outline" icon={<Undo2 size={16} />} onClick={() => setM('back')}>Send back to contractor</Btn></ActionCard>;
      case 'Approved': return <ActionCard text={`Work approved. Send the ${money(j.price)} invoice to ${L.ownerName(p)}.`}><Btn block icon={<Receipt size={16} />} onClick={() => setM('inv')}>Create and send invoice</Btn></ActionCard>;
      case 'Invoiced': return <ActionCard tone="ok" title="Done" text={inv ? `Invoice ${inv.id} · ${invoiceState(inv).label}.` : 'Invoice sent.'}>{inv && inv.paid < inv.amount && <Btn block icon={<PoundSterling size={16} />} onClick={() => { s.setInvoices(is => is.map(x => x.id === inv.id ? { ...x, paid: x.amount, overdue: false } : x)); ev(`Invoice ${inv.id} paid`, {}, 'Rent & Invoices'); }}>Mark invoice paid</Btn>}<Btn block kind="outline" icon={<Receipt size={16} />} onClick={() => setM('inv')}>View invoice</Btn><Btn block kind="outline" icon={<Lock size={16} />} onClick={() => s.go('records')}>See locked record</Btn></ActionCard>;
      default: return <ActionCard tone="neutral" title="Not going ahead" text={j.declined} />;
    }
  })();

  return <>
    <PageHeader crumbs={ctx === 'jobs' ? crumbsFor('jobs', s.go, j.title) : crumbsFor('clients', s.go, j.title)} back={back} title={j.title}
      action={<div className="flex"><Btn kind="ghost" icon={<FileText size={16} />} onClick={() => setM('report')}>Job report</Btn>{c && !done && <Btn kind="outline" icon={<UserPlus size={16} />} onClick={() => setM('assign')}>Change contractor</Btn>}{j.status === 'Proof uploaded' && <Btn icon={<CheckCircle2 size={16} />} onClick={() => lockJob(s, j, L)}>Approve work</Btn>}</div>} />
    <DetailHead media={<span className={`tile ${j.urgent && !done ? 't-err' : 't-info'}`} style={{ width: 64, height: 64, borderRadius: 18 }}><Wrench size={28} /></span>} title={j.title}
      chips={<><Chip tone={jobTone(j.status)}>{j.status}</Chip>{j.urgent && <Chip tone="err">Emergency</Chip>}<Chip tone="neutral" dot={false}>{j.managed ? 'Managed home' : 'Client home'}</Chip><Chip tone="neutral" dot={false}>{j.category}</Chip></>}
      meta={[['Home', p?.address ?? ''], ['Reported', j.reported], ['By', j.by], ['Office Admin', adminName(j.admin)]]} />
    <Card><HSteps items={steps} at={at} stopped={j.status === 'Declined' ? 'Declined' : j.status === 'Sent back' ? 'Sent back' : undefined} /></Card>
    {j.urgent && !done && <Note tone="err">Emergency. Get someone there today and call the tenant back.</Note>}
    <div className="dgrid">
      <div className="col">
        {j.status === 'New' && j.managed && <Card title="Step 1 · Price the job" sub={`${ll?.name} is on the ${ll?.plan}% plan. Job limit ${money(limit)}.`}>
          <div className="grid g2"><Field label="Contractor (optional now)"><Select value={pc} onChange={setPc} options={[{ value: '', label: 'Choose later' }, ...s.contractors.filter(x => x.type === 'Trade' && x.status === 'Active').map(x => ({ value: x.id, label: `${x.name} · ${x.trade}` }))]} /></Field><Field label="Price from the quote (£)"><Text value={price} onChange={setPrice} placeholder="e.g. 180" /></Field></div>
          {+price > 0 && (+price > limit ? <Note tone="warn">{money(+price)} is over the {money(limit)} limit. It goes to Approvals for you to decide.</Note> : <Note tone="ok">{money(+price)} is under the limit. No approval needed.</Note>)}
          <Btn disabled={!+price} onClick={savePrice}>Save price</Btn>
        </Card>}
        {j.status === 'Ready to assign' && <Card title="Assign a contractor" sub="Only contractors with documents in date can be chosen."><Btn icon={<UserPlus size={16} />} onClick={() => setM('assign')}>Choose contractor</Btn></Card>}
        {(j.proof || j.status === 'Proof uploaded') && <Card title="Photo proof" sub={j.status === 'Proof uploaded' ? 'Uploaded by the contractor. Check before you approve.' : 'Kept with the locked record.'}>
          <div className="photos">{(j.proof ?? []).map((x, i) => <div key={x + i} className="ph" style={{ backgroundImage: `url(images/home${(i % 3) + 1}.jpg)` }}><span>{x}</span></div>)}</div></Card>}
        {(j.status === 'Approved' || j.status === 'Invoiced') && <Card title="Invoice" sub={j.managed ? 'Landlord invoices are due straight away.' : `Client invoices are due in ${cl?.terms ?? '30 days'}.`}>
          <div className="lrow"><Receipt size={18} color="var(--text-brand)" /><div className="stack grow"><b>{inv ? inv.id : 'Not sent yet'}</b><span className="caption">To {L.ownerName(p)} · {money(j.price)}</span></div>{inv && <Chip tone={invoiceState(inv).tone}>{invoiceState(inv).label}</Chip>}</div></Card>}
        {!j.managed && j.quoteNo && <Card title={`Quote ${j.quoteNo}`} sub={`Sent ${j.quoted}${j.validUntil ? ' · valid until ' + j.validUntil : ''}`} action={!done && <Btn sm kind="ghost" icon={<Send size={14} />} onClick={() => setM('quote')}>Edit</Btn>}>
          <div className="tablewrap"><table className="t"><thead><tr><th>Activity</th><th>Description</th><th>Qty</th><th>Rate</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead><tbody>{jobLines(j).map((l, i) => <tr key={i} className="static"><td><b className="strong">{l.activity}</b></td><td>{l.desc}</td><td>{l.qty}</td><td>{money(l.rate)}</td><td style={{ textAlign: 'right' }}><b>{money(Math.round(l.qty * l.rate * 100) / 100)}</b></td></tr>)}</tbody></table></div>
          <div className="flex between"><span className="label">Quote total</span><b style={{ fontSize: 18 }}>{money(lineSum(jobLines(j)))}</b></div></Card>}
        <Card title="What's wrong"><p style={{ margin: 0, lineHeight: 1.6 }}>{j.note ?? 'No details given.'}</p>
          <KV rows={[['Reported by', j.by], ['Reported on', j.reported], ['Type of work', j.category], ...(j.tenant ? [['Tenant', <button className="link" onClick={() => s.go('tenants', j.tenant)}>{L.tenant(j.tenant)?.name}</button>] as [string, React.ReactNode]] : [])]} /></Card>
        <Card title="Communication" sub="Calls and emails with the tenant, landlord, client or contractor."><CommsLog items={j.comms} to={ll?.email ?? cl?.email} onAdd={addComm} /></Card>
        <Card title="Job history" sub="Every step, with the date and time."><Timeline items={[...j.events].reverse().map(e => ({ at: e.at, text: e.text, by: e.by }))} /></Card>
      </div>
      <div className="col">
        {action}
        <Card title="Contractor">{c ? <><div className="flex"><Avatar name={c.name} size="md" /><div className="stack grow"><button className="link" style={{ textAlign: 'left' }} onClick={() => s.go('contractors', c.id)}>{c.name}</button><span className="caption">{c.trade} · <Star size={11} style={{ verticalAlign: -1 }} /> {c.rating}</span></div></div><div className="flex"><Btn sm kind="outline" icon={<Phone size={14} />} onClick={() => s.toast('Calling ' + c.phone)}>Call</Btn>{!done && <Btn sm kind="ghost" onClick={() => setM('assign')}>Change</Btn>}</div></> : <><span className="caption">No contractor yet.</span>{!done && !['New', 'Quote sent'].includes(j.status) && <Btn sm icon={<UserPlus size={14} />} onClick={() => setM('assign')}>Assign</Btn>}</>}</Card>
        <Card title="Money"><KV rows={[['Contractor cost', j.cost ? money(j.cost) + ' · staff only' : '—'], ['Price', j.price ? money(j.price) : '—'], ['LSP margin', j.price ? money(j.price - j.cost) : '—'], ...(ll ? [['Job limit', `${money(limit)} (${ll.plan}% plan)`] as [string, string], ['Budget left', p ? money(p.budget - p.used) : '—'] as [string, string]] : [])]} /></Card>
        <HomeCard id={j.property} />
      </div>
    </div>
    <input ref={fileRef} type="file" accept="image/*" multiple hidden aria-label="Photo proof" onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) proof(fs.map(f => f.name.replace(/\.[^.]+$/, ''))); }} />
    {m === 'assign' && <AssignContractorModal title={c ? 'Change contractor' : 'Assign a contractor'} onClose={() => setM('')} onPick={x => { ev(`${L.contractor(x)?.name} ${c ? 'now has the job (was ' + c.name + ')' : 'assigned'}`, { contractor: x, status: ['Ready to assign', 'Quote accepted', 'New'].includes(j.status) && j.status !== 'New' ? 'Assigned' : j.status }); setM(''); }} />}
    {m === 'back' && <Reason title="Send back to the contractor" sub="They see your note and must fix it and upload new photos." cta="Send back" placeholder="e.g. After photo doesn't show the finished wall" onClose={() => setM('')} onDone={r => { ev(`Sent back: ${r}`, { status: 'Sent back', sentBack: r }); setM(''); }} />}
    {m === 'decline' && <Reason danger title="Decline this job" sub="The person who reported it is told. Nothing is charged." cta="Decline" options={['Not LSP’s responsibility', 'Tenant damage, tenant to pay', 'Duplicate of another job', 'Landlord will fix it themselves']} onClose={() => setM('')} onDone={r => { ev(`Declined: ${r}`, { status: 'Declined', declined: r }); setM(''); }} />}
    {m === 'quote' && <QuoteBuilder job={j} onClose={() => setM('')} />}
    {m === 'inv' && <InvoiceModal job={s.jobs.find(x => x.id === id)} onClose={() => setM('')} />}
    {m === 'report' && <JobReportModal jobs={[j]} title={`Job report · ${j.title}`} onClose={() => setM('')} />}
  </>;
}

