import { useState } from 'react';
import { Mail, UserCheck, TriangleAlert, Home, Wrench, ArrowRight, Plus, CalendarDays, Clock, Image as ImageIcon, Send, BellRing, Check, KeyRound, FileText, ListChecks } from 'lucide-react';
import { useStore, useLookups, money, rentStatus, type Route } from '../store';
import { daysFrom, nowStamp, ME, ME_NAME, SUPERVISOR } from '../data';
import { Btn, Card, Chip, Drawer, IBtn, KV, Kpi, Note, Tabs } from '../ui';
import { PageHeader } from '../Shell';
import { NewJobModal, DONE_JOB } from './shared';
import { remindSupervisor } from './Requests';

type Item = { kind: 'overdue' | 'todo' | 'waiting'; t: string; d: string; next: string; due: string; r: Route; id?: string; tone: 'err' | 'warn' | 'info' | 'brand' | 'ok' };

export default function Today() {
  const s = useStore(); const L = useLookups();
  const [tab, setTab] = useState<'all' | Item['kind']>('all');
  const [open, setOpen] = useState<Item | null>(null);
  const [newJob, setNewJob] = useState(false);
  const late = s.rent.filter(r => rentStatus(r).tone === 'err');
  const lateSum = late.reduce((a, r) => a + r.amount - r.paid, 0);
  const waitingJobs = s.jobs.filter(j => j.status === 'Waiting approval');
  const reviews = s.applicants.filter(a => a.stage === 4 && !a.rejected);
  const asks = s.requests.filter(r => r.status === 'Waiting');
  const myTasks = s.tasks.filter(t => !t.done).sort((a, b) => daysFrom(a.due) - daysFrom(b.due));
  const today = myTasks.filter(t => t.late || daysFrom(t.due) <= 1);

  const items: Item[] = [
    ...s.jobs.filter(j => j.urgent && !DONE_JOB.includes(j.status)).map(j => ({ kind: 'overdue' as const, t: 'Emergency: ' + j.title, d: L.prop(j.property)?.address ?? '', next: j.contractor ? 'Make sure the contractor is there today' : 'Assign a contractor now', due: 'Today', r: 'jobs' as Route, id: j.id, tone: 'err' as const })),
    ...s.tasks.filter(t => t.late && !t.done).map(t => ({ kind: 'overdue' as const, t: t.title, d: `${t.area} · task`, next: 'Do it or move the date', due: t.due.replace(' 2026', ''), r: 'tasks' as Route, id: t.id, tone: 'err' as const })),
    ...late.map(r => { const t = L.tenant(r.tenant); return { kind: 'overdue' as const, t: `Rent late · ${money(r.amount - r.paid)}`, d: `${t?.name}, ${L.prop(t?.property)?.address}`, next: 'Send a reminder or call', due: r.due.replace(' 2026', ''), r: 'rent' as Route, id: r.id, tone: 'err' as const }; }),
    ...s.safety.filter(c => c.status === 'Overdue' || c.status === 'Missing').map(c => ({ kind: 'overdue' as const, t: `${c.kind} ${c.status === 'Missing' ? 'missing' : 'overdue'}`, d: L.prop(c.property)?.address ?? '', next: c.status === 'Missing' ? 'Book the check, then upload the certificate' : 'Book a qualified contractor', due: c.status === 'Missing' ? 'Now' : c.expires.replace(' 2026', ''), r: 'safety' as Route, id: c.id, tone: 'err' as const })),
    ...s.enquiries.filter(e => e.stage === 'Assigned').map(e => ({ kind: 'todo' as const, t: `Contact ${e.name}`, d: e.about, next: 'Call or email within 24 hours', due: 'Today', r: 'enquiries' as Route, id: e.id, tone: 'info' as const })),
    ...s.applicants.filter(a => !a.rejected && a.stage === 0).map(a => ({ kind: 'todo' as const, t: `New applicant · ${a.name}`, d: L.prop(a.property)?.address ?? '', next: 'Call them and send the portal login', due: 'Today', r: 'lettings' as Route, id: a.id, tone: 'brand' as const })),
    ...s.applicants.filter(a => !a.rejected && a.stage === 2 && a.kyc.some(d => d.status === 'Uploaded')).map(a => ({ kind: 'todo' as const, t: `Check documents · ${a.name}`, d: `${a.kyc.filter(d => d.status === 'Uploaded').length} uploaded on the portal`, next: 'Verify each document', due: 'Today', r: 'lettings' as Route, id: a.id, tone: 'brand' as const })),
    ...s.jobs.filter(j => j.status === 'Proof uploaded').map(j => ({ kind: 'todo' as const, t: `Check photos · ${j.title}`, d: L.prop(j.property)?.address ?? '', next: 'Approve the work or send it back', due: 'Today', r: 'jobs' as Route, id: j.id, tone: 'warn' as const })),
    ...s.jobs.filter(j => j.status === 'New' && !j.urgent).map(j => ({ kind: 'todo' as const, t: `${j.managed ? 'Price' : 'Quote'} · ${j.title}`, d: L.prop(j.property)?.address ?? '', next: j.managed ? 'Get a price from a contractor' : 'Create the quote for the client', due: j.reported.split(',')[0].replace(' 2026', ''), r: 'jobs' as Route, id: j.id, tone: 'info' as const })),
    ...s.inspections.filter(i => i.status === 'Not assigned').map(i => ({ kind: 'todo' as const, t: `${i.kind} inspection has no inspector`, d: L.prop(i.property)?.address ?? '', next: 'Assign a Site Inspector', due: i.date.replace(' 2026', ''), r: 'inspections' as Route, id: i.id, tone: 'warn' as const })),
    ...s.inspections.filter(i => i.status === 'Report uploaded').map(i => ({ kind: 'todo' as const, t: `Review ${i.kind.toLowerCase()} report`, d: `${L.prop(i.property)?.address}${i.room ? ' · ' + i.room : ''}`, next: 'Accept and lock, or send back', due: 'Now', r: 'inspections' as Route, id: i.id, tone: 'warn' as const })),
    ...waitingJobs.map(j => ({ kind: 'waiting' as const, t: `${j.title} · ${money(j.price)}`, d: `${L.prop(j.property)?.address} · over the landlord's limit`, next: `Waiting for ${SUPERVISOR} to approve`, due: j.reported.split(',')[0].replace(' 2026', ''), r: 'requests' as Route, id: j.id, tone: 'warn' as const })),
    ...reviews.map(a => ({ kind: 'waiting' as const, t: `Supervisor review · ${a.name}`, d: L.prop(a.property)?.address ?? '', next: `Waiting for ${SUPERVISOR} to approve the tenant`, due: a.since.replace(' 2026', ''), r: 'lettings' as Route, id: a.id, tone: 'info' as const })),
    ...asks.map(q => ({ kind: 'waiting' as const, t: q.title, d: q.about, next: `Waiting for ${SUPERVISOR}`, due: q.at.split(',')[0].replace(' 2026', ''), r: 'requests' as Route, id: q.id, tone: 'info' as const })),
  ];
  const shown = items.filter(a => tab === 'all' || a.kind === tab);
  const coming = [
    ...s.inspections.filter(i => i.status !== 'Locked' && daysFrom(i.date) >= 0).map(i => ({ d: i.date, t: `${i.kind} · ${i.time}`, p: L.prop(i.property)?.address ?? '', r: 'inspections' as Route, id: i.id, c: 't-info' })),
    ...s.applicants.filter(a => a.stage === 5 && a.moveInAt).map(a => ({ d: a.moveInAt!.split(',')[0], t: 'Move-in · ' + a.name, p: L.prop(a.property)?.address ?? '', r: 'lettings' as Route, id: a.id, c: 't-ok' })),
    ...s.safety.filter(c => c.days >= 0 && c.days <= 30).map(c => ({ d: c.expires, t: c.kind + ' ends', p: L.prop(c.property)?.address ?? '', r: 'safety' as Route, id: c.id, c: 't-warn' })),
    ...s.tenants.filter(t => t.status === 'Moving out').map(t => ({ d: t.end, t: 'Moves out · ' + t.name, p: L.prop(t.property)?.address ?? '', r: 'tenants' as Route, id: t.id, c: 't-err' })),
  ].filter(c => daysFrom(c.d) >= 0).sort((a, b) => daysFrom(a.d) - daysFrom(b.d)).slice(0, 5);

  const managed = s.properties.filter(p => p.managed);
  const onTrack = managed.filter(p => !s.safety.some(c => c.property === p.id && ['Overdue', 'Missing'].includes(c.status)) && !s.tenants.some(t => t.property === p.id && late.some(r => r.tenant === t.id)) && !s.jobs.some(j => j.property === p.id && j.urgent && !DONE_JOB.includes(j.status)));
  const pct = managed.length ? Math.round(onTrack.length / managed.length * 100) : 100;
  const due = s.rent.reduce((a, r) => a + r.amount, 0), paid = s.rent.reduce((a, r) => a + r.paid, 0);
  const tick = (id: string) => { const t = s.tasks.find(x => x.id === id)!; s.setTasks(ts => ts.map(x => x.id === id ? { ...x, done: true, late: false } : x)); s.log(`Finished task: ${t.title}`, 'My Tasks'); s.toast('Task done'); };

  return <>
    <PageHeader title={`Good morning, ${ME_NAME.split(' ')[0]}`} action={<div className="flex"><Btn kind="outline" icon={<ListChecks size={18} />} onClick={() => s.go('tasks')}>My tasks</Btn><Btn icon={<Plus size={18} />} onClick={() => setNewJob(true)}>Log a job</Btn></div>} />
    <div className="row">
      <div className="hero grow">
        <div className="col grow" style={{ gap: 14 }}>
          <span className="chip-dark" style={{ alignSelf: 'flex-start' }}>Your homes · October</span>
          <div className="flex" style={{ alignItems: 'flex-end', gap: 10 }}><span className="big">{pct}%</span><span className="chip accent nodot" style={{ marginBottom: 12 }}>{onTrack.length} of {managed.length} on track</span></div>
          <p style={{ margin: 0, color: '#C3CDE4', fontSize: 13, fontWeight: 500, maxWidth: 420 }}>of the homes {SUPERVISOR} gave you are fully on track: rent paid, safety checks in date and no emergencies.</p>
          <div className="flex" style={{ gap: 12 }}>{[[String(s.properties.length), 'Your homes'], [`${due ? Math.round(paid / due * 100) : 100}%`, 'Rent collected'], [String(s.jobs.filter(j => !DONE_JOB.includes(j.status)).length), 'Open jobs']].map(([v, l]) => <div className="mtile" key={l}><b>{v}</b><span>{l}</span></div>)}</div>
        </div>
        <div className="gring"><svg viewBox="0 0 176 176"><circle cx="88" cy="88" r="80" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="14" /><circle cx="88" cy="88" r="80" fill="none" stroke="#5BAF00" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 80 * (s.tasks.length ? s.tasks.filter(t => t.done).length / s.tasks.length : 0)} 999`} transform="rotate(-90 88 88)" /></svg>
          <div className="stack" style={{ alignItems: 'center' }}><ListChecks size={22} color="#5BAF00" /><b style={{ fontSize: 13 }}>{s.tasks.filter(t => t.done).length} of {s.tasks.length}</b><span style={{ fontSize: 10.5, color: '#AEBBDA' }}>tasks done</span></div></div>
      </div>
      <Card title={`Waiting for ${SUPERVISOR}`} sub="Things only the Supervisor can decide." action={<Chip tone="warn">{waitingJobs.length + reviews.length + asks.length} waiting</Chip>} style={{ width: 400, flex: 'none' }}>
        {[...waitingJobs.map(j => ({ k: j.id, icon: <Wrench size={18} />, t: j.title, v: money(j.price), d: `${L.prop(j.property)?.address} · over the limit`, go: () => s.go('requests', j.id), what: `approval for ${j.title} (${money(j.price)})` })),
          ...reviews.map(a => ({ k: a.id, icon: <KeyRound size={18} />, t: a.name, v: 'Review', d: `${L.prop(a.property)?.address}${a.room ? ' · ' + a.room : ''}`, go: () => s.go('lettings', a.id), what: `the tenant review for ${a.name}` })),
          ...asks.map(q => ({ k: q.id, icon: <FileText size={18} />, t: q.title, v: '', d: q.about, go: () => s.go('requests', q.id), what: q.title }))].slice(0, 4).map(x => <div className="lrow" key={x.k}>
          <span className="tile t-white" style={{ width: 36, height: 36 }}>{x.icon}</span>
          <button className="stack grow" style={{ border: 0, background: 'none', textAlign: 'left', padding: 0, minWidth: 0 }} onClick={x.go}><span className="flex" style={{ gap: 6 }}><b className="ellip">{x.t}</b>{x.v && <b style={{ color: 'var(--warn)' }}>{x.v}</b>}</span><span className="caption ellip">{x.d}</span></button>
          <IBtn sm icon={<BellRing size={16} />} label="Remind the Supervisor" onClick={() => remindSupervisor(s, x.what)} />
        </div>)}
        {!(waitingJobs.length + reviews.length + asks.length) && <Note tone="ok">Nothing waiting on the Supervisor.</Note>}
        <button className="btn ghost sm" onClick={() => s.go('requests')}>Open Sent to Supervisor</button>
      </Card>
    </div>
    <div className="grid g4">
      <Kpi icon={<Mail size={18} />} tone="info" label="Enquiries to contact" value={s.enquiries.filter(e => e.stage === 'Assigned').length} caption={`${s.enquiries.filter(e => e.stage === 'Contacted').length} already contacted`} onClick={() => s.go('enquiries')} />
      <Kpi icon={<UserCheck size={18} />} tone="brand" label="Applicants to move on" value={s.applicants.filter(a => !a.rejected && (a.stage <= 3 || a.stage === 5)).length} caption={`${reviews.length} with the Supervisor`} onClick={() => s.go('lettings')} />
      <Kpi icon={<ImageIcon size={18} />} tone="warn" label="Photos to check" value={s.jobs.filter(j => j.status === 'Proof uploaded').length} caption="finished jobs" onClick={() => s.go('jobs')} />
      <Kpi icon={<TriangleAlert size={18} />} tone="err" label="Late rent" value={money(lateSum)} caption={`${late.length} tenant${late.length === 1 ? '' : 's'}`} onClick={() => s.go('rent')} />
    </div>
    <div className="row">
      <Card title="My tasks" sub="Due today, tomorrow or late." className="grow" action={<Btn sm kind="ghost" onClick={() => s.go('tasks')}>All {myTasks.length}</Btn>}>
        <div className="divlist">{today.map(t => <div key={t.id} className="item">
          <button className="tickbox" aria-label={`Mark ${t.title} done`} onClick={() => tick(t.id)}><Check size={14} /></button>
          <button className="stack grow" style={{ border: 0, background: 'none', textAlign: 'left', padding: 0 }} onClick={() => t.link ? s.go(t.link.route as Route, t.link.id) : s.go('tasks')}><b>{t.title}</b><span className="caption">{t.area} · due {t.due}</span></button>
          <Chip tone={t.late ? 'err' : 'info'}>{t.late ? 'Late' : daysFrom(t.due) <= 0 ? 'Today' : 'Tomorrow'}</Chip>
        </div>)}{!today.length && <Note tone="ok">Nothing due today.</Note>}</div>
      </Card>
      <Card title="Coming up" action={<CalendarDays size={18} color="#667085" />} style={{ width: 340, flex: 'none' }}>
        {coming.map(c => { const [d, m] = c.d.split(' '); return <button key={c.t + c.d} className="item click" style={{ padding: 0 }} onClick={() => s.go(c.r, c.id)}><span className={`datetile ${c.c}`}><b>{d}</b><span>{m.toUpperCase()}</span></span><div className="stack"><b>{c.t}</b><span className="caption">{c.p}</span></div></button>; })}
        {!coming.length && <span className="caption">Nothing booked.</span>}
        <div className="grow" />
        <Btn kind="outline" sm onClick={() => s.go('inspections')}>Open inspections</Btn>
      </Card>
    </div>
    <Card title="Your list for today" sub="Everything late, everything to do next, and everything you are waiting on. Start here every morning."
      action={<Tabs value={tab} onChange={setTab} items={[{ id: 'all', label: 'All', count: items.length }, { id: 'overdue', label: 'Late', count: items.filter(a => a.kind === 'overdue').length }, { id: 'todo', label: 'To do', count: items.filter(a => a.kind === 'todo').length }, { id: 'waiting', label: 'Waiting on others', count: items.filter(a => a.kind === 'waiting').length }]} />}>
      <div className="divlist">{shown.map((a, i) => <button key={i} className="item click" onClick={() => setOpen(a)}>
        <span className={`tile t-${a.tone}`}>{a.kind === 'overdue' ? <Clock size={17} /> : a.kind === 'waiting' ? <Send size={17} /> : <Home size={17} />}</span>
        <div className="stack grow"><b>{a.t}</b><span className="caption">{a.d}</span></div>
        <span className="caption" style={{ width: 240 }}>{a.next}</span>
        <Chip tone={a.tone}>{a.due}</Chip>
      </button>)}{!shown.length && <Note tone="ok">Nothing here.</Note>}</div>
    </Card>
    {open && <Drawer title={open.t} sub={open.d} onClose={() => setOpen(null)} footer={<><Btn kind="outline" icon={<Plus size={16} />} onClick={() => { s.setTasks(t => [{ id: 'K' + Date.now(), title: open.t, admin: ME, due: '16 Oct 2026', late: false, done: false, created: nowStamp(), area: 'My Day', link: { route: open.r, id: open.id } }, ...t]); s.log(`Added task: ${open.t}`, 'My Tasks'); s.toast('Added to your tasks for tomorrow'); setOpen(null); }}>Add to my tasks</Btn><Btn icon={<ArrowRight size={16} />} onClick={() => { setOpen(null); s.go(open.r, open.id); }}>Open item</Btn></>}>
      <Card className="flat"><KV rows={[['What it is', open.t], ['Where', open.d], ['Due', open.due], ['Next step', open.next], ['Who', open.kind === 'waiting' ? SUPERVISOR : ME_NAME]]} /></Card>
    </Drawer>}
    {newJob && <NewJobModal onClose={() => setNewJob(false)} onCreated={id => s.go('jobs', id)} />}
  </>;
}
