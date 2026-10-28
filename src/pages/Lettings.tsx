import { useState, type ReactNode } from 'react';
import { PipeBoard, PersonChips, PipeStats, ChaseBar, ViewToggle, MoveModal, STALE_DAYS, type PCol, type PCard, type Turn, type MoveOption } from './pipeline';
import { Plus, Home, UserCheck, Mail, CheckCircle2, XCircle, FileSignature, PoundSterling, Search as SearchIcon, CalendarClock, KeyRound, ArrowRight, Eye, Check, X, Send, Undo2, Users, Clock, Briefcase, PawPrint, MapPin, BellRing } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { LET_STAGES, KYC_DOCS, TODAY_LABEL, PORTAL, daysFrom, fmtDate, nowStamp, parseDate, type Applicant, type Comm, type RefStatus } from '../data';
import { ME_NAME, ME, SUPERVISOR } from '../data';
import { remindSupervisor, DemoAnswer } from './Requests';
import { ActionCard, Avatar, Bar, Btn, Card, Chip, CommsLog, DetailHead, DocRow, Field, HSteps, KV, MiniSearch, Modal, Note, Reason, Select, Tabs, Text, Timeline, Empty, sortComms, dateLabel } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { HomeCard, firstName, adminName } from './shared';

type S = ReturnType<typeof useStore>;
const LANE_HINT = ['New applications', 'Office Admin calls or emails', 'Applicant uploads KYC on the portal', 'Deposit, contract and referencing', 'With the Supervisor', 'Move-in booked', 'Now a tenant'];
const LANE_TONE = ['info', 'brand', 'warn', 'brand', 'ok', 'info', 'ok'] as const;
const roomRent = (p?: { type: string; rent: number; rooms?: number }) => !p ? 0 : p.type === 'HMO' ? Math.round(p.rent / (p.rooms ?? 1)) : p.rent;
const SUP = SUPERVISOR;
const sys = (text: string, by = ME_NAME): Comm => ({ id: 'cm' + Date.now() + Math.random(), at: nowStamp(), by, channel: 'System', text });
const mail = (subject: string, text: string): Comm => ({ id: 'cm' + Date.now() + Math.random(), at: nowStamp(), by: ME_NAME, channel: 'Email', dir: 'out', subject, text });
const kycDone = (a: Applicant) => a.kyc.filter(d => d.status === 'Verified').length;
const kycUp = (a: Applicant) => a.kyc.filter(d => d.status !== 'Missing').length;
const checksDone = (a: Applicant) => a.checks.deposit && a.checks.contract && a.checks.reference === 'Passed';

function useLet(a: Applicant) {
  const s = useStore();
  const upd = (patch: Partial<Applicant>, msg: string, ...comms: Comm[]) => { s.setApplicants(as => as.map(x => x.id === a.id ? { ...x, ...patch, comms: [...x.comms, ...comms] } : x)); s.log(msg, 'Lettings'); s.toast(msg); };
  return { upd, s };
}

/* ================= LIST (KANBAN) ================= */
export function Lettings() {
  const s = useStore();
  if (s.detail && s.applicants.some(a => a.id === s.detail)) return <ApplicantPage id={s.detail} />;
  return <Board />;
}


/* ---- pipeline card helpers ---- */
const IS_OA = PORTAL === 'oa';
const MY_TURN: Turn = IS_OA ? 'Office Admin' : 'Supervisor';
const postcode = (area?: string) => (area ?? '').split(' ').slice(-1)[0];
const daysInStage = (a: Applicant) => Math.max(0, -daysFrom(a.since));
const isStale = (a: Applicant) => !a.rejected && a.stage < 6 && daysInStage(a) >= STALE_DAYS;
function turnOf(a: Applicant): Turn {
  switch (a.stage) {
    case 0: return a.admin ? 'Office Admin' : 'Supervisor';
    case 1: return 'Office Admin';
    case 2: return kycUp(a) < KYC_DOCS.length ? 'Applicant' : 'Office Admin';
    case 3: return !checksDone(a) && a.checks.deposit && a.checks.contract && a.checks.reference === 'Waiting' ? 'Referencing' : 'Office Admin';
    case 4: return 'Supervisor';
    case 5: return 'Office Admin';
    default: return 'Done';
  }
}

function Board() {
  const s = useStore(); const L = useLookups();
  const [home, setHome] = useState('all'); const [q, setQ] = useState(''); const [view, setView] = useState<'board' | 'list'>('board'); const [add, setAdd] = useState(false);
  const [who, setWho] = useState('all'); const [chase, setChase] = useState(false); const [mv, setMv] = useState<string | null>(null);
  const [portal, setPortal] = useState<string | null>(null); const [moved, setMoved] = useState<string | null>(null); const [book, setBook] = useState<string | null>(null);
  const homes = [...new Set(s.applicants.map(a => a.property))];
  const all = s.applicants.filter(a => (home === 'all' || a.property === home) && (who === 'all' || a.admin === who) && (!chase || isStale(a)) && (a.name + (L.prop(a.property)?.address ?? '')).toLowerCase().includes(q.toLowerCase()));
  const nextBtn = (a: Applicant): { label: string; run: () => void; kind?: 'primary' | 'outline' } => {
    const open = () => s.go('lettings', a.id);
    switch (a.stage) {
      case 0: return { label: 'Move to Contact', run: () => { s.setApplicants(as => as.map(x => x.id === a.id ? { ...x, stage: 1, since: TODAY_LABEL, comms: [...x.comms, sys('Moved to Contact.')] } : x)); s.log(`${a.name} moved to Contact`, 'Lettings'); s.toast(`${a.name} moved to Contact`); } };
      case 1: return { label: 'Send portal login', run: () => setPortal(a.id) };
      case 2: return kycDone(a) === KYC_DOCS.length ? { label: 'Approve profile', run: open } : { label: kycUp(a) === KYC_DOCS.length ? 'Check documents' : 'See documents', run: open, kind: kycUp(a) === KYC_DOCS.length ? 'primary' : 'outline' };
      case 3: return { label: checksDone(a) ? 'Send to Supervisor' : 'Open checklist', run: open, kind: checksDone(a) ? 'primary' : 'outline' };
      case 4: return { label: `Remind ${SUPERVISOR.split(' ')[0]}`, run: () => remindSupervisor(s, `the tenant review for ${a.name}`), kind: 'outline' };
      case 5: return a.moveInAt ? { label: 'Mark moved in', run: () => setMoved(a.id) } : { label: 'Book move-in', run: () => setBook(a.id) };
      default: return { label: 'Open tenant', run: () => a.tenant && s.go('tenants', a.tenant), kind: 'outline' };
    }
  };
  const one = (id: string | null) => id ? s.applicants.find(x => x.id === id) : undefined;
  const rentOf = (a: Applicant) => roomRent(L.prop(a.property)) || a.budget;
  const move = (a: Applicant, stage: number, msg: string, note: string) => { s.setApplicants(as => as.map(x => x.id === a.id ? { ...x, stage, since: TODAY_LABEL, ...(stage === 4 ? { review: 'Deposit received, agreement signed by all, referencing passed.' } : {}), comms: [...x.comms, sys(note)] } : x)); s.log(msg, 'Lettings'); s.toast(msg); };
  /** What moving one stage forward needs. Returns the action, or the reason it is locked. */
  const step = (a: Applicant): { run: () => void; note: string } | { reason: string } => {
    switch (a.stage) {
      case 0: return a.admin ? { note: `${adminName(a.admin)} calls or emails them.`, run: () => move(a, 1, `${a.name} moved to Contact`, 'Moved to Contact.') } : { reason: 'Assign an Office Admin first.' };
      case 1: return { note: 'Sends the tenant portal login so they can upload KYC.', run: () => setPortal(a.id) };
      case 2: return kycDone(a) === KYC_DOCS.length ? { note: 'Approves the profile. All 5 documents are checked.', run: () => move(a, 3, `KYC approved for ${a.name}`, 'Profile approved. All KYC documents verified.') } : { reason: `${KYC_DOCS.length - kycDone(a)} of 5 KYC documents still need checking.` };
      case 3: return checksDone(a) ? { note: IS_OA ? `Sends it to ${SUP} for the final review.` : 'Marks it complete for your review.', run: () => move(a, 4, IS_OA ? `${a.name} sent to ${SUP} for review` : `${a.name} is ready for Supervisor review`, IS_OA ? `Marked complete. Sent to ${SUP} for review.` : 'Marked complete. Waiting for Supervisor review.') } : { reason: 'Deposit, contract and referencing must all be done first.' };
      case 4: return IS_OA ? { reason: 'Only the Supervisor can approve a new tenant.' } : { note: 'Approve the tenant and book the move-in date.', run: () => setBook(a.id) };
      case 5: return a.moveInAt ? { note: 'Creates the tenant account after the keys are handed over.', run: () => setMoved(a.id) } : { reason: 'Book the move-in date and time first.' };
      default: return { reason: 'Already a tenant.' };
    }
  };
  const tryMove = (a: Applicant, to: number) => {
    if (to === a.stage) return;
    if (to !== a.stage + 1) { s.toast(to < a.stage ? 'Open the applicant to send them back. A reason is needed.' : 'One stage at a time, so no check is skipped.'); return; }
    const r = step(a); if ('reason' in r) s.toast(r.reason); else r.run();
  };
  const live = all.filter(a => !a.rejected);
  const stale = s.applicants.filter(isStale);
  const people = [...new Set(s.applicants.filter(a => !a.rejected && a.admin).map(a => a.admin!))].map(id => ({ id, count: s.applicants.filter(a => !a.rejected && a.admin === id && a.stage < 6).length })).filter(x => x.count > 0);
  const card = (a: Applicant): PCard => {
    const p = L.prop(a.property); const nb = nextBtn(a); const d = daysInStage(a); const turn = turnOf(a); const r = step(a);
    return {
      key: a.id, name: a.name, photo: p?.photo, sub: `${p?.address.replace(' (HMO)', '')}${a.room ? ' · ' + a.room : ''} · ${postcode(p?.area)}`,
      amount: money(rentOf(a)), amountNote: ' pcm', owner: IS_OA ? undefined : a.admin, badge: !a.admin ? 'Unassigned' : undefined,
      status: <CardStatus a={a} />, turn, next: a.stage < 6 ? nb.label : undefined, mine: turn === MY_TURN && a.stage < 6 && !isStale(a) && (!IS_OA || !('reason' in r)),
      when: a.stage === 0 ? `Wants to move in ${a.moveIn.replace(/ 20\d\d/, '')}` : a.stage === 5 && a.moveInAt ? `Move-in ${a.moveInAt.replace(' 2026', '')}` : undefined,
      age: a.stage < 6 ? (d ? `${d} day${d > 1 ? 's' : ''} in ${LET_STAGES[a.stage]}` : `New in ${LET_STAGES[a.stage]} today`) : undefined, stale: isStale(a),
      action: { label: isStale(a) && 'reason' in r && turn === 'Applicant' ? 'Chase applicant' : nb.label, run: nb.run, kind: nb.kind },
      onMove: a.stage < 6 ? () => setMv(a.id) : undefined, onOpen: () => s.go('lettings', a.id),
    };
  };
  const cols: PCol[] = [
    ...LET_STAGES.map((st, i) => { const lane = live.filter(a => a.stage === i); return { key: String(i), title: st, tone: LANE_TONE[i], hint: LANE_HINT[i], total: lane.length ? money(lane.reduce((x, a) => x + rentOf(a), 0)) : undefined, cards: lane.map(card) }; }),
    { key: 'stop', title: 'Not going ahead', tone: 'err', hint: 'Stopped, with the reason saved', cards: all.filter(a => a.rejected).map(a => { const p = L.prop(a.property); return { key: a.id, name: a.name, photo: p?.photo, sub: `${p?.address.replace(' (HMO)', '')} · ${postcode(p?.area)}`, amount: money(rentOf(a)), amountNote: ' pcm', owner: IS_OA ? undefined : a.admin, muted: true, status: <span>{a.rejected!.reason}</span>, next: `Stopped at ${LET_STAGES[a.stage]}`, age: `${a.rejected!.at.split(',')[0]} · ${a.rejected!.by}`, onOpen: () => s.go('lettings', a.id) }; }) },
  ];
  const ma = one(mv);
  const moveOpts = (a: Applicant): MoveOption[] => LET_STAGES.map((st, i) => {
    if (i < a.stage) return { key: String(i), label: st, state: 'done', note: 'Done. Open the applicant to send them back with a reason.' };
    if (i === a.stage) return { key: String(i), label: st, state: 'current', note: LANE_HINT[i] };
    if (i === a.stage + 1) { const r = step(a); return 'reason' in r ? { key: String(i), label: st, state: 'blocked', note: r.reason } : { key: String(i), label: st, state: 'ok', note: r.note }; }
    return { key: String(i), label: st, state: 'blocked', note: 'Comes later. One stage at a time.' };
  });
  return <>
    <PageHeader crumbs={crumbsFor('lettings', s.go)} title="Lettings" action={<div className="flex"><ViewToggle value={view} onChange={setView} items={[{ id: 'board', label: 'Board', icon: 'board' }, { id: 'list', label: 'List', icon: 'list' }]} /><Btn icon={<Plus size={18} />} onClick={() => setAdd(true)}>Add applicant</Btn></div>} />
    <div className="ptool">
      {IS_OA ? <><MiniSearch value={q} onChange={setQ} placeholder="Search applicant or home" /><div style={{ width: 210 }}><Select value={home} onChange={setHome} options={[{ value: 'all', label: 'All homes' }, ...homes.map(h => ({ value: h, label: L.prop(h)?.address ?? h }))]} /></div></> : <PersonChips value={who} onChange={setWho} people={people} />}
      <div className="grow" />
      <PipeStats items={[['In progress', live.filter(a => a.stage < 6).length], ['Rent if all move in', money(live.filter(a => a.stage < 6).reduce((x, a) => x + rentOf(a), 0)) + ' pcm'], ['Moved in', live.filter(a => a.stage === 6).length, 'ok']]} />
    </div>
    {!IS_OA && <div className="ptool"><MiniSearch value={q} onChange={setQ} placeholder="Search applicant or home" /><div style={{ width: 210 }}><Select value={home} onChange={setHome} options={[{ value: 'all', label: 'All homes' }, ...homes.map(h => ({ value: h, label: L.prop(h)?.address ?? h }))]} /></div></div>}
    <ChaseBar count={stale.length} what="applicant" rule={`${STALE_DAYS}+ days in the same stage.`} onShow={() => setChase(c => !c)} showing={chase} />
    {view === 'board' ? <PipeBoard cols={cols} onDrop={(id, col) => { const a = one(id); if (a && col !== 'stop') tryMove(a, +col); else if (a) s.toast('Open the applicant to stop the application. A reason is needed.'); }}
      hint="Drag a card to the next stage, or use Move. Each move checks the rules first, so a stage is never skipped. Open a card to see everything about the applicant." />
      : <Card title="All applicants" sub="Sorted by the longest wait first."><div className="tablewrap"><table className="t"><thead><tr><th>Applicant</th><th>Home</th><th>Stage</th><th>Whose turn</th><th>Next</th><th>Waiting</th><th>Rent</th>{!IS_OA && <th>Office Admin</th>}</tr></thead><tbody>
        {[...live].sort((x, y) => daysInStage(y) - daysInStage(x)).map(a => { const p = L.prop(a.property); const t2 = turnOf(a); return <tr key={a.id} onClick={() => s.go('lettings', a.id)}>
          <td><span className="cell"><img className="pthumb" src={p?.photo} alt="" /><span className="stack"><b className="strong">{a.name}</b><span className="caption">{a.source}</span></span></span></td>
          <td>{p?.address.replace(' (HMO)', '')}{a.room ? ' · ' + a.room : ''}</td><td><Chip tone={LANE_TONE[a.stage]}>{LET_STAGES[a.stage]}</Chip></td>
          <td><span className={`pturn t-${t2 === 'Supervisor' ? 'brand' : t2 === 'Office Admin' ? 'info' : t2 === 'Done' ? 'ok' : 'warn'}`}>{t2}</span></td><td>{a.stage < 6 ? nextBtn(a).label : 'Open tenant'}</td>
          <td>{a.stage < 6 ? <b className={isStale(a) ? 'c-err' : ''}>{daysInStage(a)} days</b> : <span className="muted">—</span>}</td><td><b>{money(rentOf(a))}</b></td>{!IS_OA && <td>{a.admin ? <span className="cell"><Avatar id={a.admin} />{adminName(a.admin)}</span> : <Chip tone="warn">Unassigned</Chip>}</td>}</tr>; })}
      </tbody></table>{!live.length && <Empty>No applicants match.</Empty>}</div></Card>}
    {ma && <MoveModal name={ma.name} options={moveOpts(ma)} onClose={() => setMv(null)} onPick={() => { setMv(null); tryMove(ma, ma.stage + 1); }} />}
    {add && <AddApplicant onClose={() => setAdd(false)} />}
    
    {portal && <PortalModal a={one(portal)!} onClose={() => setPortal(null)} />}
    {moved && <MovedInModal a={one(moved)!} onClose={() => setMoved(null)} />}
    {book && <MoveInModal a={one(book)!} onClose={() => setBook(null)} />}
  </>;
}

function CardStatus({ a }: { a: Applicant }) {
  const L = useLookups(); const last = sortComms(a.comms)[0];
  switch (a.stage) {
    case 0: return <span>{a.source} · {a.household}</span>;
    case 1: return last ? <span className="caption">Last: {last.channel.toLowerCase()} · {last.at.replace(' 2026', '')}</span> : <Chip tone="warn">Not contacted yet</Chip>;
    case 2: return <div className="stack" style={{ gap: 5 }}><span className="caption">KYC: {kycUp(a)}/5 uploaded · {kycDone(a)} checked</span><Bar value={kycUp(a) / 5 * 100} tone={kycDone(a) === 5 ? 'ok' : 'brand'} /></div>;
    case 3: return <div className="flex wrap" style={{ gap: 6 }}><Chip tone={a.checks.deposit ? 'ok' : 'neutral'} dot={false}>{a.checks.deposit ? <Check size={11} /> : null}Deposit</Chip><Chip tone={a.checks.contract ? 'ok' : 'neutral'} dot={false}>{a.checks.contract ? <Check size={11} /> : null}Contract</Chip><Chip tone={a.checks.reference === 'Passed' ? 'ok' : a.checks.reference === 'Failed' ? 'err' : 'warn'} dot={false}>Ref: {a.checks.reference}</Chip></div>;
    case 4: return <Chip tone="ok">All checks passed</Chip>;
    case 5: return a.moveInAt ? <Chip tone="info" dot={false}><CalendarClock size={12} /> {a.moveInAt.replace(' 2026', '')}</Chip> : <Chip tone="warn">Date not set</Chip>;
    default: return <span className="caption">Tenant since {a.moveIn} · {L.prop(a.property)?.address.split(',')[0]}</span>;
  }
}

/* ================= DETAIL ================= */
function ApplicantPage({ id }: { id: string }) {
  const s = useStore(); const L = useLookups(); const a = s.applicants.find(x => x.id === id)!; const { upd } = useLet(a);
  const p = L.prop(a.property); const rent = roomRent(p);
  const [m, setM] = useState<'' | 'assign' | 'portal' | 'more' | 'reject' | 'stop' | 'back' | 'movein' | 'moved' | `doc${number}`>('');
  const affordable = a.income >= rent * 30;
  const live = !a.rejected && a.stage < 6;
  const setDoc = (i: number, patch: Partial<Applicant['kyc'][number]>, msg: string) => upd({ kyc: a.kyc.map((d, k) => k === i ? { ...d, ...patch } : d) }, msg);
  const allVerified = kycDone(a) === KYC_DOCS.length;

  const next: Record<number, ReactNode> = {
    0: <ActionCard text={`${SUPERVISOR} gave you this applicant. Move ${firstName(a.name)} to Contact, then call or email them.`}><Btn block icon={<ArrowRight size={16} />} onClick={() => upd({ stage: 1, since: TODAY_LABEL }, `${a.name} moved to Contact`, sys('Moved to Contact.'))}>Move to Contact</Btn></ActionCard>,

    1: <ActionCard text={`Once ${firstName(a.name)} is happy to go ahead, send their tenant portal login. They upload their KYC documents there.`}><Btn block icon={<Send size={16} />} onClick={() => setM('portal')}>Send portal login</Btn></ActionCard>,
    2: allVerified ? <ActionCard tone="ok" text="All 5 documents are checked. Approve the profile to move to deposit and referencing."><Btn block icon={<CheckCircle2 size={16} />} onClick={() => upd({ stage: 3, since: TODAY_LABEL }, `KYC approved for ${a.name}. Next: deposit, contract and referencing.`, sys('Profile approved after KYC checks.'), mail('Your documents are approved', 'Next we need your holding deposit, then you sign the tenancy agreement.')) }>Approve profile</Btn><Btn block kind="outline" icon={<XCircle size={16} />} onClick={() => setM('stop')}>Reject profile</Btn></ActionCard>
      : <ActionCard text={kycUp(a) < KYC_DOCS.length ? `${KYC_DOCS.length - kycUp(a)} document${KYC_DOCS.length - kycUp(a) > 1 ? 's are' : ' is'} still missing. Ask for them, or wait for the upload.` : 'All documents are uploaded. Open each one and verify it.'}>
        <Btn block kind={kycUp(a) < 5 ? 'primary' : 'outline'} icon={<Mail size={16} />} onClick={() => setM('more')}>Ask for more documents</Btn>
        <Btn block kind="outline" icon={<XCircle size={16} />} onClick={() => setM('stop')}>Reject profile</Btn></ActionCard>,
    3: checksDone(a) ? <ActionCard tone="ok" text="Deposit, contract and referencing are all done. Send it to the Supervisor for the final review."><Btn block icon={<CheckCircle2 size={16} />} onClick={() => upd({ stage: 4, since: TODAY_LABEL, review: 'Deposit received, agreement signed by all, referencing passed.' }, `${a.name} sent to ${SUPERVISOR} for review`, sys(`Marked complete. Sent to ${SUPERVISOR} for review.`))}>Send to Supervisor for review</Btn></ActionCard>
      : <ActionCard text="Tick off each item in the checklist. Referencing is done by the outside firm, then the result is saved here." />,
    4: <><ActionCard tone="warn" title={`With ${SUPERVISOR}`} text={`Everything is checked for ${firstName(a.name)}. Only the Supervisor can approve a new tenant. When they do, you book the move-in.`}><Btn block kind="outline" icon={<BellRing size={16} />} onClick={() => remindSupervisor(s, `the tenant review for ${a.name}`)}>Remind {SUPERVISOR}</Btn></ActionCard>
      <DemoAnswer><Btn sm kind="success" icon={<CheckCircle2 size={14} />} onClick={() => { upd({ stage: 5, since: TODAY_LABEL }, `${SUPERVISOR} approved ${a.name}. Book the move-in.`, { ...sys('Profile approved by Supervisor. Ready to book the move-in.'), by: SUPERVISOR }); }}>Supervisor approves</Btn><Btn sm kind="outline" icon={<Undo2 size={14} />} onClick={() => setM('back')}>Supervisor sends back</Btn></DemoAnswer></>,
    5: a.moveInAt ? <ActionCard text={`Move-in is booked for ${a.moveInAt}. On the day, hand over the keys and mark them as moved in.`}><Btn block icon={<KeyRound size={16} />} onClick={() => setM('moved')}>Mark moved in · create tenant</Btn><Btn block kind="outline" icon={<CalendarClock size={16} />} onClick={() => setM('movein')}>Change date</Btn></ActionCard>
      : <ActionCard text="Book the move-in date and time."><Btn block icon={<CalendarClock size={16} />} onClick={() => setM('movein')}>Book move-in</Btn></ActionCard>,
    6: <ActionCard tone="ok" title="Done" text={`${firstName(a.name)} moved in and is now a live tenant.`}><Btn block icon={<ArrowRight size={16} />} onClick={() => a.tenant && s.go('tenants', a.tenant)}>Open tenant profile</Btn></ActionCard>,
  };

  return <>
    <PageHeader crumbs={crumbsFor('lettings', s.go, a.name)} back={() => s.go('lettings')} title={a.name}
      action={live && <Btn kind="outline" icon={<XCircle size={16} />} onClick={() => setM('stop')}>Not going ahead</Btn>} />
    <DetailHead media={<Avatar name={a.name} size="xl" />} title={a.name}
      chips={<>{a.rejected ? <Chip tone="neutral">Not going ahead</Chip> : <Chip tone={LANE_TONE[a.stage]}>{LET_STAGES[a.stage]}</Chip>}<Chip tone="neutral" dot={false}>From {a.source}</Chip></>}
      meta={[['Email', a.email], ['Phone', a.phone], ['Applied', a.applied], ['In this step since', a.since]]} />
    <Card><HSteps items={LET_STAGES} at={a.stage === 6 ? 7 : a.stage} stopped={a.rejected ? 'Not going ahead' : undefined} /></Card>
    {a.rejected && <Note tone="err">Stopped at {LET_STAGES[a.stage]}: {a.rejected.reason}. {a.rejected.at} by {a.rejected.by}.</Note>}
    <div className="dgrid">
      <div className="col">
        {a.stage === 0 && <Card title="New application" sub={`Applied from ${a.source} on ${a.applied}.`}><Note>An Office Admin contacts every new applicant, checks they fit the home and books a viewing if needed.</Note></Card>}
        {a.stage === 1 && <Card title="Contact the applicant" sub="Call or email them. Save what was said below. When they want to go ahead, send their portal login.">
          <div className="emailprev"><b>Login email preview</b><span className="caption">To: {a.email} · Subject: Your Genesis tenant portal login</span><p>Hello {firstName(a.name)}, your tenant portal is ready. Log in with your email and the temporary password <b>LSP-{a.id.replace('AP', '')}48</b>. Then upload your ID, proof of address, right to rent share code, 3 payslips and 3 months of bank statements.</p></div>
        </Card>}
        {a.stage === 2 && <Card title="KYC documents" sub={a.stage === 2 ? 'Uploaded by the applicant on their portal. Open each one, then verify it or ask for a new one.' : 'All checked and saved.'} action={<Chip tone={allVerified ? 'ok' : 'info'}>{kycDone(a)}/5 checked</Chip>}>
          <Bar value={kycDone(a) / 5 * 100} tone={allVerified ? 'ok' : 'brand'} />
          {a.kyc.map((d, i) => <DocRow key={d.name} name={d.name} status={d.status} meta={d.status === 'Missing' ? 'Not uploaded yet' : `${d.file} · uploaded ${d.at}${d.note ? ' · ' + d.note : ''}`}>
            {d.status !== 'Missing' && <Btn sm kind="ghost" icon={<Eye size={14} />} onClick={() => s.toast('Opening ' + d.file)}>View</Btn>}
            {a.stage === 2 && d.status === 'Uploaded' && <><Btn sm kind="success" icon={<Check size={14} />} onClick={() => setDoc(i, { status: 'Verified' }, `Verified ${d.name.split(' (')[0]} for ${a.name}`)}>Verify</Btn><Btn sm kind="ghost" icon={<X size={14} />} onClick={() => setM(`doc${i}`)}>Reject</Btn></>}
          </DocRow>)}
        </Card>}
        {a.stage === 3 && <Card title="Deposit, contract and referencing" sub="Tick each item when it is done.">
          <CheckRow done={a.checks.deposit} icon={<PoundSterling size={16} />} title={`Holding deposit received · ${money(a.deposit)}`} sub={a.checks.deposit ? 'Seen in the bank' : 'Check the bank first'}>
            {!a.checks.deposit && <Btn sm onClick={() => upd({ checks: { ...a.checks, deposit: true } }, `Deposit of ${money(a.deposit)} received from ${a.name}`, sys(`Deposit ${money(a.deposit)} received.`))}>Mark received</Btn>}</CheckRow>
          <CheckRow done={a.checks.contract} icon={<FileSignature size={16} />} title="Tenancy agreement signed by everyone" sub={a.checks.contract ? 'Signed by the tenant and the landlord' : 'Sent to sign online'}>
            {!a.checks.contract && <><Btn sm kind="ghost" onClick={() => upd({}, `Signing reminder sent to ${a.name}`, mail('Please sign your tenancy agreement', 'Your agreement is waiting for your signature.'))}>Remind</Btn><Btn sm onClick={() => upd({ checks: { ...a.checks, contract: true } }, `Agreement signed for ${a.name}`, sys('Agreement signed by everyone.'))}>Mark signed</Btn></>}</CheckRow>
          <CheckRow done={a.checks.reference === 'Passed'} icon={<SearchIcon size={16} />} title="Referencing check (outside firm)" sub={`Result: ${a.checks.reference}`}>
            <div style={{ width: 150 }}><Select value={a.checks.reference} onChange={v => upd({ checks: { ...a.checks, reference: v as RefStatus } }, `Referencing for ${a.name}: ${v}`, sys(`Referencing result saved: ${v}.`))} options={['Not started', 'Waiting', 'Passed', 'Failed'].map(x => ({ value: x, label: x }))} /></div></CheckRow>
          {a.checks.reference === 'Failed' && <Note tone="err">Referencing failed. Ask for a guarantor, or mark the application as not going ahead.</Note>}
        </Card>}
        {a.stage === 4 && <Card title="Review summary" sub={a.review}>
          <div className="grid g2">{[['KYC documents', '5 of 5 checked'], ['Holding deposit', money(a.deposit) + ' received'], ['Tenancy agreement', 'Signed by everyone'], ['Referencing', a.checks.reference], ['Affordability', affordable ? 'Income is over 30× rent' : 'Below 30× rent'], ['Office Admin', adminName(a.admin)]].map(([k, v]) => <div key={k} className="lrow"><CheckCircle2 size={18} color="var(--ok)" /><div className="stack"><span className="caption">{k}</span><b>{v}</b></div></div>)}</div>
        </Card>}
        {a.stage >= 5 && <Card title="Move-in" sub="Keys are only handed over once the money is in and the move-in inspection is booked.">
          <KV rows={[['Date and time', a.moveInAt ?? 'Not booked'], ['Move-in inspection', s.inspections.find(i => i.property === a.property && i.kind === 'Move-in' && i.status !== 'Locked') ? 'Booked' : a.stage === 6 ? 'Done' : 'Booked with the date'], ['First month’s rent', money(rent)], ['Deposit', money(a.deposit) + ' · protected after move-in']]} />
        </Card>}
        {a.stage >= 3 && <Card title="KYC documents" sub={a.stage === 2 ? 'Uploaded by the applicant on their portal. Open each one, then verify it or ask for a new one.' : 'All checked and saved.'} action={<Chip tone={allVerified ? 'ok' : 'info'}>{kycDone(a)}/5 checked</Chip>}>
          <Bar value={kycDone(a) / 5 * 100} tone={allVerified ? 'ok' : 'brand'} />
          {a.kyc.map((d, i) => <DocRow key={d.name} name={d.name} status={d.status} meta={d.status === 'Missing' ? 'Not uploaded yet' : `${d.file} · uploaded ${d.at}${d.note ? ' · ' + d.note : ''}`}>
            {d.status !== 'Missing' && <Btn sm kind="ghost" icon={<Eye size={14} />} onClick={() => s.toast('Opening ' + d.file)}>View</Btn>}
            {a.stage === 2 && d.status === 'Uploaded' && <><Btn sm kind="success" icon={<Check size={14} />} onClick={() => setDoc(i, { status: 'Verified' }, `Verified ${d.name.split(' (')[0]} for ${a.name}`)}>Verify</Btn><Btn sm kind="ghost" icon={<X size={14} />} onClick={() => setM(`doc${i}`)}>Reject</Btn></>}
          </DocRow>)}
        </Card>}
        <Card title="About the applicant">
          <div className="grid g2">{([[Users, 'Household', a.household], [PoundSterling, 'Budget', money(a.budget) + ' pcm'], [CalendarClock, 'Wants to move in', a.moveIn], [Briefcase, 'Work', a.employment], [PoundSterling, 'Yearly income', a.income ? money(a.income) : '—'], [PawPrint, 'Pets', a.pets], [MapPin, 'Lives now at', a.current], [Clock, 'Applied', a.applied]] as const).map(([Ic, k, v]) => <div key={k} className="flex" style={{ gap: 10 }}><span className="tile t-neutral" style={{ width: 32, height: 32 }}><Ic size={15} /></span><div className="stack"><span className="caption">{k}</span><b>{v}</b></div></div>)}</div>
          {a.income > 0 && <Note tone={affordable ? 'ok' : 'warn'}>{affordable ? `Income ${money(a.income)} is over 30 × the rent (${money(rent * 30)}).` : `Income is below 30 × the rent (${money(rent * 30)}). A guarantor may be needed.`}</Note>}
        </Card>
        <Card title="Communication" sub="Calls, emails, portal messages and notes, with the date and time.">
          <CommsLog items={a.comms} to={a.email} onAdd={live ? c => upd({}, c.channel === 'Email' ? `Emailed ${a.name}` : `Saved ${c.channel.toLowerCase()} for ${a.name}`, c) : undefined} />
        </Card>
      </div>
      <div className="col">
        {a.rejected ? <ActionCard tone="neutral" title="Stopped" text={a.rejected.reason} /> : next[a.stage]}
        <HomeCard id={a.property} title="The home they want" note={<div className="flex between"><span className="caption">{a.room ?? 'Whole home'}</span><b style={{ color: 'var(--text-brand)' }}>{money(rent)} pcm</b></div>} />
        <Card title="Office Admin"><div className="flex"><Avatar id={ME} size="md" /><div className="stack grow"><b>You · {ME_NAME}</b><span className="caption">Given to you by {SUPERVISOR}</span></div></div></Card>
        <Card title="Progress"><Timeline items={[{ at: a.applied, text: `Applied from ${a.source}` }, ...sortComms(a.comms).filter(c => c.channel === 'System').reverse().map(c => ({ at: c.at, text: c.text, by: c.by }))]} /></Card>
      </div>
    </div>

    {m === 'portal' && <PortalModal a={a} onClose={() => setM('')} />}
    {m === 'more' && <Reason title="Ask for more documents" sub={`${firstName(a.name)} gets an email and sees what is missing on their portal.`} cta="Send email" placeholder="e.g. Please upload your right to rent share code and your last 3 payslips" onClose={() => setM('')} onDone={r => { upd({ kyc: a.kyc.map(d => d.status === 'Rejected' ? { ...d, status: 'Missing' } : d) }, `Asked ${a.name} for more documents`, mail('More documents needed', r)); setM(''); }} />}
    {m.startsWith('doc') && (() => { const i = +m.slice(3); return <Reason title={`Reject ${a.kyc[i].name.split(' (')[0]}`} sub="The applicant is asked to upload it again." cta="Reject document" danger options={['Not clear enough to read', 'Expired', 'Name does not match', 'Wrong document', 'Not valid']} onClose={() => setM('')} onDone={r => { setDoc(i, { status: 'Rejected', note: r }, `Rejected ${a.kyc[i].name.split(' (')[0]} for ${a.name}: ${r}`); setM(''); }} />; })()}
    {m === 'stop' && <Reason danger title={a.stage === 2 ? 'Reject this profile' : 'Not going ahead'} sub="The applicant is told by email. The home stays available. The reason is saved." cta="Stop application" options={['Could not show the right to rent', 'Failed referencing', 'Cannot afford the rent', 'Applicant pulled out', 'Chose another applicant', 'No reply after 3 tries']} onClose={() => setM('')} onDone={r => { upd({ rejected: { reason: r, at: nowStamp(), by: ME_NAME } }, `${a.name} not going ahead: ${r}`, sys('Application stopped: ' + r)); setM(''); }} />}
    {m === 'back' && <Reason title="Supervisor sends it back" sub="It goes back to Deposit and referencing with the Supervisor's note." cta="Send back" placeholder="e.g. The guarantor form is missing" onClose={() => setM('')} onDone={r => { upd({ stage: 3, since: TODAY_LABEL }, `Sent ${a.name} back: ${r}`, { ...sys('Sent back by Supervisor: ' + r), by: SUPERVISOR }); setM(''); }} />}
    {m === 'movein' && <MoveInModal a={a} onClose={() => setM('')} />}
    {m === 'moved' && <MovedInModal a={a} onClose={() => setM('')} />}
  </>;
}

function CheckRow({ done, icon, title, sub, children }: { done: boolean; icon: ReactNode; title: string; sub: string; children?: ReactNode }) {
  return <div className={`checkrow${done ? ' done' : ''}`}><span className={`tile ${done ? 't-ok' : 't-neutral'}`} style={{ width: 34, height: 34 }}>{done ? <Check size={16} /> : icon}</span><div className="stack grow"><b>{title}</b><span className="caption">{sub}</span></div>{children}</div>;
}

function PortalModal({ a, onClose }: { a: Applicant; onClose: () => void }) {
  const s = useStore();
  return <Modal title="Send tenant portal login" sub="The applicant logs in and uploads their KYC documents. The card moves to Screening." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Send size={16} />} onClick={() => { s.setApplicants(as => as.map(x => x.id === a.id ? { ...x, stage: 2, portal: true, since: TODAY_LABEL, comms: [...x.comms, mail('Your Genesis tenant portal login', 'Portal login sent. Please upload your documents.')] } : x)); s.log(`Sent portal login to ${a.name}`, 'Lettings'); s.toast(`Login sent to ${a.email}. ${firstName(a.name)} is now in Screening.`); onClose(); }}>Send login email</Btn></>}>
    <div className="emailprev"><b>To: {a.email}</b><span className="caption">From: lettings@lsp.co.uk (Outlook) · Subject: Your Genesis tenant portal login</span>
      <p>Hello {firstName(a.name)},<br />Your tenant portal is ready. Log in with this email and the temporary password below. You will be asked to choose your own password.</p>
      <div className="flex wrap"><Chip tone="brand" dot={false}>Username: {a.email}</Chip><Chip tone="brand" dot={false}>Password: LSP-{a.id.replace('AP', '')}48</Chip></div>
      <p>Please upload: photo ID, proof of address, right to rent share code, 3 payslips and 3 months of bank statements.</p></div>
  </Modal>;
}

function MoveInModal({ a, onClose }: { a: Applicant; onClose: () => void }) {
  const s = useStore(); const L = useLookups(); const [d, setD] = useState('2026-10-20'); const [t, setT] = useState('11:00'); const [insp, setInsp] = useState('C6');
  const p = L.prop(a.property);
  return <Modal title={a.stage === 4 ? 'Approve and book move-in' : 'Book move-in'} sub="The move-in inspection is booked for the same time. The tenant and landlord get an email." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<CalendarClock size={16} />} onClick={() => {
      const at = `${dateLabel(d)}, ${t}`;
      s.setApplicants(as => as.map(x => x.id === a.id ? { ...x, stage: 5, since: TODAY_LABEL, moveInAt: at, moveIn: dateLabel(d), comms: [...x.comms, sys(a.stage === 4 ? `Profile approved by Supervisor. Move-in booked for ${at}.` : `Move-in booked for ${at}.`), mail('Your move-in date', `Your move-in is booked for ${at} at ${p?.address}.`)] } : x));
      s.setInspections(is => [{ id: 'I' + Date.now() % 10000, kind: 'Move-in', scope: a.room ? 'HMO room' : 'Whole property', property: a.property, room: a.room, date: dateLabel(d), time: t, inspector: insp || undefined, status: insp ? 'Booked' : 'Not assigned', rooms: [], meters: {}, keys: 0, notes: `${a.name} moves in.` }, ...is.filter(i => !(i.property === a.property && i.kind === 'Move-in' && i.status !== 'Locked' && i.room === a.room))]);
      s.log(`${a.stage === 4 ? 'Approved ' + a.name + ' and booked' : 'Booked'} move-in for ${at}`, 'Lettings'); s.toast(`Move-in booked for ${at}`); onClose();
    }}>{a.stage === 4 ? 'Approve and book' : 'Book move-in'}</Btn></>}>
    {a.stage === 4 && <Note tone="ok">You are approving {a.name} as the new tenant for {p?.address}{a.room ? ', ' + a.room : ''}.</Note>}
    <div className="grid g3"><Field label="Move-in date"><input className="input" type="date" value={d} onChange={e => setD(e.target.value)} /></Field><Field label="Time"><input className="input" type="time" value={t} onChange={e => setT(e.target.value)} /></Field>
      <Field label="Site Inspector"><Select value={insp} onChange={setInsp} options={[{ value: '', label: 'Assign later' }, ...s.contractors.filter(c => c.type === 'Site Inspector' && c.status === 'Active').map(c => ({ value: c.id, label: c.name }))]} /></Field></div>
  </Modal>;
}

function MovedInModal({ a, onClose }: { a: Applicant; onClose: () => void }) {
  const s = useStore(); const L = useLookups(); const p = L.prop(a.property); const rent = roomRent(p);
  const [keys, setKeys] = useState(false); const [ok, setOk] = useState(false);
  const run = () => createTenant(s, a, rent, p?.type === 'HMO');
  return <Modal title={`${a.name} moved in?`} sub="This creates the tenant account and moves the card to Moved in." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<KeyRound size={16} />} disabled={!keys || !ok} onClick={() => { const tid = run(); onClose(); s.go('tenants', tid); }}>Mark moved in</Btn></>}>
    <KV rows={[['Home', `${p?.address}${a.room ? ' · ' + a.room : ''}`], ['Start date', a.moveIn], ['Rent', money(rent) + ' pcm'], ['Deposit', money(a.deposit)]]} />
    <label className="check"><input type="checkbox" checked={keys} onChange={e => setKeys(e.target.checked)} /> Keys handed over and meter readings taken</label>
    <label className="check"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> First month's rent and deposit are in the bank</label>
  </Modal>;
}

function createTenant(s: S, a: Applicant, rent: number, hmo: boolean) {
  const tid = 'T' + Date.now() % 10000;
  const start = a.moveIn.includes(' ') ? a.moveIn : TODAY_LABEL;
  const sd = parseDate(start); const end = new Date(sd); end.setFullYear(end.getFullYear() + 1); end.setDate(end.getDate() - 1);
  s.setTenants(ts => [{ id: tid, name: a.name, email: a.email, phone: a.phone, property: a.property, room: a.room, rent, deposit: a.deposit, depositRef: 'DPS-' + (600000 + Date.now() % 99999), depositScheme: 'DPS', start, end: fmtDate(end), status: 'Live', employment: a.employment, emergency: '—', rentDay: sd.getDate(), kyc: a.kyc, comms: [...a.comms, sys('Moved in. Tenant account created.')], applicant: a.id }, ...ts]);
  s.setRent(rs => [{ id: 'R' + Date.now() % 10000, tenant: tid, month: 'Oct 2026', due: start, amount: rent, paid: rent, history: [{ date: TODAY_LABEL, amount: rent, note: 'Paid before move-in' }], reminders: [] }, ...rs]);
  s.setApplicants(as => as.map(x => x.id === a.id ? { ...x, stage: 6, since: TODAY_LABEL, tenant: tid, comms: [...x.comms, sys('Keys handed over. Now a live tenant.')] } : x));
  s.setProperties(ps => ps.map(p => p.id === a.property ? { ...p, status: hmo ? 'Partly let' : 'Let' } : p));
  s.setInspections(is => is.map(i => i.property === a.property && i.kind === 'Move-in' && i.status === 'Booked' && i.room === a.room ? { ...i, status: 'Report uploaded', doneAt: nowStamp(), rooms: [{ name: 'Living room', photos: 5, note: 'Good', condition: 'Good' }, { name: 'Kitchen', photos: 4, note: 'Good', condition: 'Good' }, { name: 'Bedroom', photos: 4, note: 'Good', condition: 'Good' }], meters: { gas: '01220', electric: '30110' }, keys: 2, summary: 'Move-in report uploaded on the day.' } : i));
  s.log(`${a.name} moved in. Tenant account created.`, 'Tenants'); s.toast(`${a.name} is now a live tenant`);
  return tid;
}

function AddApplicant({ onClose }: { onClose: () => void }) {
  const s = useStore(); const L = useLookups();
  const homes = s.properties.filter(p => p.managed && p.status !== 'Let');
  const [f, setF] = useState({ name: '', email: '', phone: '', property: homes[0]?.id ?? '', room: 'Room 1', source: 'Rightmove' as Applicant['source'], household: '1 adult', budget: '', moveIn: '2026-11-15', admin: '' });
  const p = L.prop(f.property);
  return <Modal wide title="Add an applicant" sub="For people who applied on Rightmove, Zoopla or by phone. They start in Applied." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!f.name || !/@/.test(f.email)} onClick={() => {
      const id = 'AP' + Date.now() % 10000;
      s.setApplicants(as => [{ id, name: f.name, email: f.email, phone: f.phone, property: f.property, room: p?.type === 'HMO' ? f.room : undefined, stage: 0, source: f.source, admin: ME, applied: nowStamp(), since: TODAY_LABEL, household: f.household, budget: +f.budget || roomRent(p), moveIn: dateLabel(f.moveIn), employment: '—', income: 0, pets: '—', current: '—', portal: false, kyc: KYC_DOCS.map(n => ({ name: n, status: 'Missing' as const })), checks: { deposit: false, contract: false, reference: 'Not started' }, deposit: Math.round(roomRent(p) * 12 / 52 * 5), comms: [sys('Added by Supervisor.')] }, ...as]);
      s.log(`Added applicant ${f.name} for ${p?.address}`, 'Lettings'); s.toast('Applicant added to Applied'); onClose();
    }}>Add applicant</Btn></>}>
    <div className="grid g3"><Field label="Full name"><Text value={f.name} onChange={v => setF({ ...f, name: v })} /></Field><Field label="Email"><Text value={f.email} onChange={v => setF({ ...f, email: v })} /></Field><Field label="Phone"><Text value={f.phone} onChange={v => setF({ ...f, phone: v })} /></Field></div>
    <div className="grid g3"><Field label="Home"><Select value={f.property} onChange={v => setF({ ...f, property: v })} options={homes.map(h => ({ value: h.id, label: h.address }))} /></Field>
      {p?.type === 'HMO' ? <Field label="Room"><Select value={f.room} onChange={v => setF({ ...f, room: v })} options={Array.from({ length: p.rooms ?? 0 }, (_, i) => ({ value: `Room ${i + 1}`, label: `Room ${i + 1}` }))} /></Field> : <Field label="Household"><Text value={f.household} onChange={v => setF({ ...f, household: v })} /></Field>}
      <Field label="Found us on"><Select value={f.source} onChange={v => setF({ ...f, source: v as Applicant['source'] })} options={['Rightmove', 'Zoopla', 'Website', 'Enquiry'].map(x => ({ value: x, label: x }))} /></Field></div>
    <div className="grid g3"><Field label="Budget (£ pcm)"><Text value={f.budget} onChange={v => setF({ ...f, budget: v })} placeholder={String(roomRent(p))} /></Field><Field label="Wants to move in"><input className="input" type="date" value={f.moveIn} onChange={e => setF({ ...f, moveIn: e.target.value })} /></Field></div>
    <Note>New applicants you add are yours. The Supervisor sees them too.</Note>
  </Modal>;
}
