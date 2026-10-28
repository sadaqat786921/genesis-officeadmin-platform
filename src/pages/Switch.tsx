import { useState, type ReactNode } from 'react';
import { ArrowRightLeft, Plus, Phone, Mail, CalendarClock, AlertTriangle, CheckCircle2, XCircle, FileText, Upload, Send, UserCheck, ArrowRight, ShieldCheck, Ban, Users, Building2, Home, FlaskConical, BellRing, KeyRound, BarChart3 } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { SW_STAGES, HANDOVER, PORTAL, ME, ME_NAME, SUPERVISOR, nowStamp, daysFrom, parseDate, fmtDate, type Lead, type SwProp, type SwRoute, type SwFact, type Comm, type Enquiry } from '../data';
import { ActionCard, Avatar, Btn, Card, Chip, CommModal, CommsLog, DetailHead, Field, HSteps, KV, Kpi, MiniSearch, Modal, Note, PageTabs, Reason, Select, Tabs, Text, Area, Timeline, When, Empty, UploadModal, dateLabel } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { AssignAdminModal, NewLandlordModal, adminName } from './shared';
import { PipeBoard, PersonChips, PipeStats, ChaseBar, MoveModal, type PCol, type PCard, type Turn, type MoveOption } from './pipeline';

/* Planned Switch: landlords who already pay another managing agent.
   Enquiry → contact → check the current agent's contract and dates → decide (ready / later / clarify)
   → proposal → signed → onboarding (handover) → activated. Only an activated switch becomes a managed home. */

type S = ReturnType<typeof useStore>;
const IS_OA = PORTAL === 'oa';
const ROUTE_TONE: Record<SwRoute, 'ok' | 'info' | 'warn'> = { 'Ready to plan': 'ok', 'Future switch': 'info', 'Needs clarification': 'warn' };
const LANE_TONE = ['info', 'brand', 'warn', 'brand', 'info', 'ok', 'brand', 'ok'] as const;
const LANE_HINT = ['From the website or an enquiry', 'Call or email the landlord', 'Check the agent contract and dates', 'Ready, later or clarify', 'Waiting for the landlord', 'Not managed yet', 'Handover checklist', 'Now a managed home'];
export const PLANS: { p: 10 | 12 | 16 | 20; t: string; d: string }[] = [
  { p: 10, t: 'Management Only', d: 'Management only. Repairs are arranged and charged separately.' },
  { p: 12, t: 'Management + routine maintenance', d: 'Routine maintenance included. Materials charged separately.' },
  { p: 16, t: 'Management + maintenance + materials', d: 'Routine maintenance and covered materials included.' },
  { p: 20, t: 'Premium', d: 'Maintenance, covered materials and extra agreed property-care services.' },
];
export const AREAS = ['Barnet', 'Camden', 'Crouch End', 'Enfield', 'Finchley', 'Hampstead', 'Highgate', 'Islington', 'Muswell Hill', 'Tottenham', 'Other North London'];
const isDate = (v: string) => /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(v.trim());
const toInput = (v?: string) => { if (!v || !isDate(v)) return ''; const d = parseDate(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (v: string, n: number) => { const d = parseDate(v); d.setDate(d.getDate() + n); return fmtDate(d); };
const actor = () => ME_NAME;
const sys = (text: string, by = actor()): Comm => ({ id: 'cm' + Date.now() + Math.random(), at: nowStamp(), by, channel: 'System', text });

/* ---------------- helpers used elsewhere ---------------- */
export function updLead(s: S, id: string, patch: Partial<Lead> | ((l: Lead) => Partial<Lead>), msg?: string, comm?: Comm) {
  s.setLeads(ls => ls.map(l => { if (l.id !== id) return l; const p = typeof patch === 'function' ? patch(l) : patch; return { ...l, ...p, comms: comm ? [...(p.comms ?? l.comms), comm] : (p.comms ?? l.comms) }; }));
  if (msg) { s.log(msg, 'Planned Switch'); s.toast(msg); }
}
const updProp = (s: S, l: Lead, pid: string, patch: Partial<SwProp>, msg?: string, comm?: Comm) => updLead(s, l.id, x => ({ props: x.props.map(p => p.id === pid ? { ...p, ...patch } : p) }), msg, comm);

/** A landlord account was created for a signed lead: link it and move to onboarding. */
export function linkLeadLandlord(s: S, leadId: string, landlordId: string, by = SUPERVISOR) {
  s.setLeads(ls => ls.map(l => l.id !== leadId ? l : { ...l, landlordId, props: l.props.map(p => p.stage === 5 ? { ...p, stage: 6 } : p), comms: [...l.comms, sys('Onboarding approved. Landlord account created and login email sent from Outlook.', by)] }));
}

/** Office Admin or Supervisor: an enquiry from a landlord who already has an agent moves here, with its calls and notes. */
export function moveEnquiryToSwitch(s: S, e: Enquiry, f: { agent: string; postcode: string; area: string; address: string; timeframe: string }) {
  const id = 'SW' + (100 + s.leads.length);
  const lead: Lead = { id, created: nowStamp(), name: e.name, email: e.email, phone: e.phone, contactPref: 'Phone', permission: true, marketing: false, source: 'Enquiry', campaign: e.source, owner: e.admin ?? (IS_OA ? ME : undefined), reason: e.message, timeframe: f.timeframe || 'Not sure', enquiry: e.id,
    comms: [...e.comms, sys(`Moved from Enquiries. ${e.name} already has a managing agent (${f.agent || 'agent not named yet'}).`)],
    props: [blankProp('a', f.address || e.about, f.postcode, f.area, e.admin ? 1 : 0, f.agent)] };
  s.setLeads(ls => [lead, ...ls]);
  s.setEnquiries(es => es.map(x => x.id === e.id ? { ...x, stage: 'Converted', switchLead: id, comms: [...x.comms, sys('Moved to Planned Switch. The landlord already has a managing agent.')] } : x));
  s.log(`${e.name} moved from Enquiries to Planned Switch`, 'Planned Switch'); s.toast(`${e.name} is now in Planned Switch`);
  return id;
}

/** Website "Planned Switch" form → exactly one lead with source and time. Duplicates (same email or phone) are not created twice. */
export function leadFromWebsite(s: S, f: { name: string; email: string; phone: string; contactPref: Lead['contactPref']; area: string; homes: string; agent: string; timeframe: string; reason: string; permission: boolean }) {
  const dup = s.leads.find(l => l.email.toLowerCase() === f.email.toLowerCase() || (f.phone && l.phone.replace(/\s/g, '') === f.phone.replace(/\s/g, '')));
  if (dup) { updLead(s, dup.id, {}, undefined, sys('Sent the website form again. No new lead made.', 'Website')); return dup.id; }
  const id = 'SW' + (100 + s.leads.length);
  const n = Math.max(1, Math.min(5, +f.homes || 1));
  s.setLeads(ls => [{ id, created: nowStamp(), name: f.name, email: f.email, phone: f.phone, contactPref: f.contactPref, permission: f.permission, marketing: false, source: 'Website', campaign: 'planned-switch-landing', reason: f.reason || '—', timeframe: f.timeframe, comms: [sys('Planned Switch form sent from the LSP website.', 'Website')], props: Array.from({ length: n }, (_, i) => blankProp(String.fromCharCode(97 + i), n > 1 ? `Property ${i + 1}` : 'Address to confirm', '', f.area, 0, f.agent)) }, ...ls]);
  s.log(`New Planned Switch lead from the website: ${f.name} (${f.area})`, 'Planned Switch');
  return id;
}
function blankProp(id: string, address: string, postcode: string, area: string, stage: number, agent = ''): SwProp {
  return { id, address, postcode, area, type: 'Flat', beds: 2, rent: 0, stage, handover: HANDOVER.map(item => ({ item })), agent: { name: agent, fee: '', vat: 'Not known', extras: '', endDate: { value: '', confirmed: false }, notice: { value: '', confirmed: false }, method: 'Not known', continuing: { value: '', confirmed: false } }, dates: { safeNotice: { value: '', confirmed: false }, earliest: { value: '', confirmed: false }, preferred: '', blockers: '' } };
}
function setFollowUp(s: S, l: Lead, date: string, note: string) {
  const tid = 'KSW-' + l.id; const owner = l.owner ?? ME;
  s.setTasks(ts => [{ id: tid, title: `Follow up ${l.name}: ${note}`, admin: owner, due: date, late: daysFrom(date) < 0, done: false, created: nowStamp(), area: 'Planned Switch', link: { route: 'switch', id: l.id } }, ...ts.filter(t => t.id !== tid)]);
  updLead(s, l.id, { nextContact: date, nextNote: note }, `Follow-up set for ${date}. The reminder moved with it.`);
}

/* ---------------- router ---------------- */
export function Switch() {
  const s = useStore();
  const [lid, pid] = (s.detail ?? '').split('.');
  if (lid && s.leads.some(l => l.id === lid)) return <LeadPage id={lid} pid={pid} />;
  return <Board />;
}

/* ---------------- board, calendar, closed, report ---------------- */
const ACT = ['Call landlord', 'Log contact', 'Check contract', 'Decide route', 'Record reply', 'Approve onboarding', 'Open checklist', 'Open home'];
const NEXT = ['Call the landlord', 'Log the call or email', 'Check the agent contract and dates', 'Decide: ready, later or clarify', 'Record the landlord’s reply', 'Approve onboarding', 'Finish the handover checklist', 'Managed home'];
function swTurn(l: Lead, p: SwProp): Turn { return p.stage === 0 ? (l.owner ? 'Office Admin' : 'Supervisor') : p.stage === 4 ? 'Landlord' : p.stage === 5 ? 'Supervisor' : p.stage === 7 ? 'Done' : 'Office Admin'; }
const swNext = (l: Lead, p: SwProp) => p.stage === 0 && !l.owner ? 'Give to an Office Admin' : p.stage === 3 && p.route === 'Ready to plan' ? 'Send the proposal' : p.stage === 5 && IS_OA ? `Ask ${SUPERVISOR.split(' ')[0]} to approve onboarding` : NEXT[p.stage];
const overdueBy = (l: Lead) => l.nextContact ? -daysFrom(l.nextContact) : 0;
const swStale = (l: Lead, p: SwProp) => p.stage < 7 && overdueBy(l) > 0;

function Board() {
  const s = useStore();
  const [view, setView] = useState<'board' | 'calendar' | 'closed' | 'report'>('board');
  const [q, setQ] = useState(''); const [area, setArea] = useState('all'); const [owner, setOwner] = useState('all'); const [agent, setAgent] = useState('all'); const [add, setAdd] = useState(false);
  const [chase, setChase] = useState(false); const [mv, setMv] = useState<string | null>(null);
  const open = s.leads.filter(l => !l.closed);
  const cards = open.flatMap(l => l.props.map(p => ({ l, p }))).filter(({ l, p }) => (area === 'all' || p.area === area) && (owner === 'all' || (owner === 'none' ? !l.owner : l.owner === owner)) && (agent === 'all' || p.agent.name === agent) && (!chase || swStale(l, p)) && (l.name + p.address + p.agent.name + p.postcode).toLowerCase().includes(q.toLowerCase()));
  const cal = calendar(s);
  const agents = [...new Set(s.leads.flatMap(l => l.props.map(p => p.agent.name)).filter(Boolean))];
  const stale = open.flatMap(l => l.props.filter(p => swStale(l, p)));
  const people = [...new Set(open.map(l => l.owner).filter(Boolean) as string[])].map(id => ({ id, count: open.filter(l => l.owner === id).length }));
  const find = (key: string) => { const [lid, pid] = key.split('.'); const l = s.leads.find(x => x.id === lid); const p = l?.props.find(x => x.id === pid); return l && p ? { l, p } : undefined; };
  const step = (l: Lead, p: SwProp): { run: () => void; note: string } | { reason: string } => {
    switch (p.stage) {
      case 0: return l.owner ? { note: `${adminName(l.owner)} calls or emails the landlord.`, run: () => updProp(s, l, p.id, { stage: 1 }, `${l.name} moved to Contact pending`, sys('Moved to Contact pending.')) } : { reason: IS_OA ? `${SUPERVISOR} gives it to an Office Admin first.` : 'Give it to an Office Admin first.' };
      case 1: return l.comms.some(c => c.channel === 'Call' || c.channel === 'Email') ? { note: 'Starts the check of the agent contract and dates.', run: () => updProp(s, l, p.id, { stage: 2 }, `Assessment started for ${p.address}`, sys('Assessment started.')) } : { reason: 'Log a call or email with the landlord first.' };
      case 2: return { reason: 'Open the lead and choose Ready to plan, Future switch or Needs clarification.' };
      case 3: return { reason: p.route === 'Ready to plan' ? 'Open the lead to write and send the proposal.' : `The route is ${p.route ?? 'not set'}. Only Ready to plan goes to a proposal.` };
      case 4: return { reason: 'Open the lead to upload the signed agreement.' };
      case 5: return { reason: IS_OA ? 'Only the Supervisor approves onboarding and creates the landlord.' : 'Open the lead to approve onboarding and create the landlord.' };
      case 6: return { reason: 'Finish the handover checklist on the lead page.' };
      default: return { reason: 'Already a managed home.' };
    }
  };
  const tryMove = (l: Lead, p: SwProp, to: number) => {
    if (to === p.stage) return;
    if (to !== p.stage + 1) { s.toast(to < p.stage ? 'Open the lead to change an earlier step.' : 'One stage at a time, so no check is skipped.'); return; }
    const r = step(l, p); if ('reason' in r) s.toast(r.reason); else r.run();
  };
  const card = ({ l, p }: { l: Lead; p: SwProp }): PCard => {
    const od = overdueBy(l); const turn = swTurn(l, p); const go = () => s.go('switch', `${l.id}.${p.id}`);
    return {
      key: `${l.id}.${p.id}`, name: l.name, sub: `${p.address}${p.postcode ? ' · ' + p.postcode : ''} · ${p.area}`,
      amount: p.rent ? money(p.rent) : undefined, amountNote: p.rent ? ' pcm' : undefined, owner: IS_OA ? undefined : l.owner,
      badge: !l.owner ? 'Unassigned' : p.proposal ? `${p.proposal.plan}% plan` : undefined,
      status: <><span className="flex" style={{ gap: 6 }}><Building2 size={13} />{p.agent.name || 'Agent not named yet'}</span>{p.route && <Chip tone={ROUTE_TONE[p.route]}>{p.route}</Chip>}{p.proposal && <Chip tone="brand" dot={false}>Proposal · {p.proposal.response}</Chip>}</>,
      turn, next: p.stage < 7 ? swNext(l, p) : undefined, mine: p.stage < 7 && turn === (IS_OA ? 'Office Admin' : 'Supervisor') && !swStale(l, p) && (!IS_OA || !('reason' in step(l, p))),
      when: l.nextContact && p.stage < 7 && od <= 0 ? `Follow-up ${l.nextContact.replace(' 2026', '')}` : p.stage === 7 && p.activated ? `Live since ${p.activated.split(',')[0]}` : undefined,
      age: od > 0 && p.stage < 7 ? `Follow-up overdue by ${od} day${od > 1 ? 's' : ''}` : `${l.source}${l.props.length > 1 ? ` · ${l.props.length} properties` : ''}`, stale: swStale(l, p),
      action: { label: od > 0 && p.stage < 7 ? 'Log follow-up' : p.stage === 0 && !l.owner ? 'Assign' : p.stage === 3 && p.route === 'Ready to plan' ? 'Send proposal' : p.stage === 5 && IS_OA ? 'Remind' : ACT[p.stage], run: p.stage === 7 && p.propertyId ? () => s.go('properties', p.propertyId!) : go, kind: p.stage === 7 || turn === 'Landlord' ? 'outline' : 'primary' },
      onMove: p.stage < 7 ? () => setMv(`${l.id}.${p.id}`) : undefined, onOpen: go,
    };
  };
  const cols: PCol[] = SW_STAGES.map((st, i) => { const lane = cards.filter(c => c.p.stage === i); const rent = lane.reduce((x, c) => x + (c.p.rent || 0), 0); return { key: String(i), title: st, tone: LANE_TONE[i], hint: LANE_HINT[i], total: rent ? money(rent) : undefined, cards: lane.map(card) }; });
  const mm = mv ? find(mv) : undefined;
  const moveOpts = (l: Lead, p: SwProp): MoveOption[] => SW_STAGES.map((st, i) => {
    if (i < p.stage) return { key: String(i), label: st, state: 'done', note: 'Done.' };
    if (i === p.stage) return { key: String(i), label: st, state: 'current', note: LANE_HINT[i] };
    if (i === p.stage + 1) { const r = step(l, p); return 'reason' in r ? { key: String(i), label: st, state: 'blocked', note: r.reason } : { key: String(i), label: st, state: 'ok', note: r.note }; }
    return { key: String(i), label: st, state: 'blocked', note: 'Comes later. One stage at a time.' };
  });
  return <>
    <PageHeader crumbs={crumbsFor('switch', s.go)} title="Planned Switch" action={<Btn icon={<Plus size={18} />} onClick={() => setAdd(true)}>New lead</Btn>} />
    <div className="ptool">
      {!IS_OA ? <PersonChips value={owner} onChange={setOwner} people={people} /> : <Tabs value={view} onChange={setView} items={[{ id: 'board', label: 'Board' }, { id: 'calendar', label: 'Switching calendar', count: cal.filter(c => c.days <= 90).length }, { id: 'closed', label: 'Closed', count: s.leads.filter(l => l.closed).length }]} />}
      <div className="grow" />
      <PipeStats items={[['Open leads', open.length], ['Properties', open.reduce((a, l) => a + l.props.length, 0)], ['Rent to take on', money(open.flatMap(l => l.props).filter(p => p.stage < 7).reduce((a, p) => a + (p.rent || 0), 0)) + ' pcm'], ['Signed, not live yet', open.flatMap(l => l.props).filter(p => p.stage === 5 || p.stage === 6).length, 'ok']]} />
    </div>
    <div className="ptool">
      <MiniSearch value={q} onChange={setQ} placeholder="Search landlord, address or agent" />
      <div style={{ width: 170 }}><Select value={area} onChange={setArea} options={[{ value: 'all', label: 'All areas' }, ...AREAS.map(a => ({ value: a, label: a }))]} /></div>
      <div style={{ width: 190 }}><Select value={agent} onChange={setAgent} options={[{ value: 'all', label: 'All current agents' }, ...agents.map(a => ({ value: a, label: a }))]} /></div>
      <div className="grow" />
      {!IS_OA && <Tabs value={view} onChange={setView} items={[{ id: 'board', label: 'Board' }, { id: 'calendar', label: 'Switching calendar', count: cal.filter(c => c.days <= 90).length }, { id: 'closed', label: 'Closed', count: s.leads.filter(l => l.closed).length }, { id: 'report' as const, label: 'Report' }]} />}
    </div>
    {view === 'board' && <>
      <ChaseBar count={stale.length} what="lead" rule="The follow-up date has passed." onShow={() => setChase(c => !c)} showing={chase} />
      <PipeBoard cols={cols} onDrop={(key, col) => { const f = find(key); if (f) tryMove(f.l, f.p, +col); }}
        hint="For landlords who already pay another agent. Genesis records facts and staff decisions. It never serves notice, contacts the old agent or promises a fee-free exit. Estimated dates are never shown as confirmed." />
    </>}
    {view === 'calendar' && <SwitchCalendar />}
    {view === 'closed' && <Card title="Closed leads" sub="Not proceeding or unqualified. The reason is saved."><div className="tablewrap"><table className="t"><thead><tr><th>Landlord</th><th>Area</th><th>Outcome</th><th>Reason</th><th>When</th><th>By</th></tr></thead><tbody>
      {s.leads.filter(l => l.closed).map(l => <tr key={l.id} onClick={() => s.go('switch', l.id)}><td><span className="cell"><Avatar name={l.name} /><b className="strong">{l.name}</b></span></td><td>{l.props[0]?.area}</td><td><Chip tone="neutral">{l.closed!.outcome}</Chip></td><td>{l.closed!.reason}</td><td><When at={l.closed!.at} /></td><td>{l.closed!.by}</td></tr>)}
    </tbody></table>{!s.leads.some(l => l.closed) && <Empty>None.</Empty>}</div></Card>}
    {view === 'report' && <SwitchReport />}
    {mm && <MoveModal name={mm.l.name} options={moveOpts(mm.l, mm.p)} onClose={() => setMv(null)} onPick={() => { setMv(null); tryMove(mm.l, mm.p, mm.p.stage + 1); }} />}
    {add && <NewLead onClose={() => setAdd(false)} />}
  </>;
}

type CalItem = { date: string; days: number; kind: 'Follow-up' | 'Notice deadline' | 'Earliest transfer'; text: string; l: Lead; p?: SwProp };
function calendar(s: S): CalItem[] {
  const out: CalItem[] = [];
  s.leads.filter(l => !l.closed).forEach(l => {
    if (l.nextContact && isDate(l.nextContact)) out.push({ date: l.nextContact, days: daysFrom(l.nextContact), kind: 'Follow-up', text: l.nextNote ?? 'Follow up', l });
    l.props.filter(p => p.stage < 7).forEach(p => {
      if (p.dates.safeNotice.confirmed && isDate(p.dates.safeNotice.value)) out.push({ date: p.dates.safeNotice.value, days: daysFrom(p.dates.safeNotice.value), kind: 'Notice deadline', text: `Latest safe date for the landlord to give notice · ${p.address}`, l, p });
      if (p.dates.earliest.confirmed && isDate(p.dates.earliest.value)) out.push({ date: p.dates.earliest.value, days: daysFrom(p.dates.earliest.value), kind: 'Earliest transfer', text: `Earliest date LSP can take over · ${p.address}`, l, p });
    });
  });
  return out.sort((a, b) => a.days - b.days);
}
function SwitchCalendar() {
  const s = useStore(); const items = calendar(s);
  const groups: [string, CalItem[], 'err' | 'warn' | 'info' | 'neutral'][] = [['Overdue', items.filter(i => i.days < 0), 'err'], ['Next 30 days', items.filter(i => i.days >= 0 && i.days <= 30), 'warn'], ['31 to 60 days', items.filter(i => i.days > 30 && i.days <= 60), 'info'], ['61 to 90 days', items.filter(i => i.days > 60 && i.days <= 90), 'neutral']];
  const est = s.leads.filter(l => !l.closed).flatMap(l => l.props.filter(p => p.stage < 7 && p.dates.safeNotice.value && !p.dates.safeNotice.confirmed).map(p => ({ l, p })));
  return <div className="dgrid">
    <Card title="Switching calendar" sub="Agreed follow-ups and confirmed notice deadlines. Estimated dates are listed separately and never shown as verified.">
      {groups.map(([t, list, tone]) => <div key={t} className="stack" style={{ gap: 8 }}><div className="flex between"><b className="h2">{t}</b><Chip tone={tone}>{list.length}</Chip></div>
        {list.length ? <div className="divlist">{list.map((c, i) => { const [d, m] = c.date.split(' '); return <button key={i} className="item click" onClick={() => s.go('switch', c.p ? `${c.l.id}.${c.p.id}` : c.l.id)}>
          <span className={`datetile t-${c.days < 0 ? 'err' : c.kind === 'Follow-up' ? 'info' : 'warn'}`}><b>{d}</b><span>{m?.toUpperCase()}</span></span>
          <div className="stack grow"><b>{c.kind === 'Follow-up' ? `Follow up · ${c.l.name}` : `${c.kind} · ${c.l.name}`}</b><span className="caption">{c.text}</span></div>
          {c.kind !== 'Follow-up' && <Chip tone="ok" dot={false}><ShieldCheck size={11} /> Confirmed</Chip>}
          {!IS_OA && (c.l.owner ? <span className="flex caption" style={{ gap: 6, width: 140 }}><Avatar id={c.l.owner} />{adminName(c.l.owner)}</span> : <span style={{ width: 140 }}><Chip tone="warn">Not assigned</Chip></span>)}
        </button>; })}</div> : <span className="caption">Nothing.</span>}</div>)}
    </Card>
    <Card title="Estimated dates" sub="Not checked yet. Confirm them from the signed agreement before planning around them.">
      {est.length ? <div className="divlist">{est.map(({ l, p }) => <button key={l.id + p.id} className="item click" onClick={() => s.go('switch', `${l.id}.${p.id}`)}><span className="tile t-warn" style={{ width: 32, height: 32 }}><AlertTriangle size={15} /></span><div className="stack grow"><b>{l.name}</b><span className="caption">Notice by {p.dates.safeNotice.value} · {p.address}</span></div><Chip tone="warn">Estimated</Chip></button>)}</div> : <span className="caption">None.</span>}
    </Card>
  </div>;
}
function SwitchReport() {
  const s = useStore(); const L = s.leads;
  const sources = [...new Set(L.map(l => l.source))];
  const row = (ls: Lead[]) => { const ps = ls.flatMap(l => l.props); return [ls.length, ls.filter(l => l.closed?.outcome !== 'Unqualified' && l.props.some(p => p.stage >= 2)).length, ps.filter(p => p.route === 'Future switch').length, ps.filter(p => p.stage >= 4).length, ps.filter(p => p.stage >= 5).length, ps.filter(p => p.stage === 7).length]; };
  const tot = row(L);
  const pipeline = L.filter(l => !l.closed).flatMap(l => l.props).filter(p => p.proposal && p.stage < 7).reduce((a, p) => a + p.rent * (p.proposal!.plan / 100), 0);
  const live = L.flatMap(l => l.props).filter(p => p.stage === 7 && p.proposal).reduce((a, p) => a + p.rent * (p.proposal!.plan / 100), 0);
  return <div className="col">
    <div className="grid g4">
      <Kpi icon={<Users size={18} />} tone="brand" label="Enquiries" value={tot[0]} caption="all sources" />
      <Kpi icon={<CheckCircle2 size={18} />} tone="ok" label="Activated properties" value={tot[5]} caption={`conversion ${tot[0] ? Math.round(tot[5] / tot[0] * 100) : 0}%`} />
      <Kpi icon={<BarChart3 size={18} />} tone="info" label="Pipeline value (estimate)" value={money(Math.round(pipeline))} caption="monthly fees if proposals go ahead · not revenue" />
      <Kpi icon={<KeyRound size={18} />} tone="ok" label="Actual monthly fees" value={money(Math.round(live))} caption="from activated switches only" />
    </div>
    <Card title="Funnel by source" sub="Enquiries → qualified → future switch → proposals → signed → activated.">
      <div className="tablewrap"><table className="t"><thead><tr><th>Source</th><th>Enquiries</th><th>Qualified</th><th>Future switch</th><th>Proposals</th><th>Signed</th><th>Activated</th></tr></thead><tbody>
        {sources.map(src => { const r = row(L.filter(l => l.source === src)); return <tr key={src} className="static"><td><b className="strong">{src}</b></td>{r.map((v, i) => <td key={i}>{v}</td>)}</tr>; })}
        <tr className="static"><td><b className="strong">Total</b></td>{tot.map((v, i) => <td key={i}><b>{v}</b></td>)}</tr>
      </tbody></table></div></Card>
  </div>;
}

/* ---------------- lead page ---------------- */
function Fact({ f, empty = 'Not known' }: { f: SwFact; empty?: string }) {
  return <span className="flex wrap" style={{ gap: 6 }}><b>{f.value || empty}</b>{f.value && <Chip tone={f.confirmed ? 'ok' : 'warn'} dot={false}>{f.confirmed ? 'Confirmed' : 'Estimated'}</Chip>}</span>;
}
function Demo({ title, children }: { title: string; children: ReactNode }) {
  return <div className="demo"><span className="flex" style={{ gap: 6 }}><FlaskConical size={14} /><b>{title}</b></span><span className="caption">In the live product this answer comes from their own portal. Use these to show what happens next.</span><div className="flex wrap" style={{ gap: 8 }}>{children}</div></div>;
}

function LeadPage({ id, pid }: { id: string; pid?: string }) {
  const s = useStore(); const L = useLookups(); const l = s.leads.find(x => x.id === id)!;
  const [sel, setSel] = useState(pid && l.props.some(p => p.id === pid) ? pid : l.props[0].id);
  const p = l.props.find(x => x.id === sel)!;
  const [m, setM] = useState<'' | 'call' | 'email' | 'assign' | 'agent' | 'decide' | 'proposal' | 'follow' | 'close' | 'declined' | 'signed' | 'create' | 'unq'>('');
  const live = !l.closed && p.stage < 7;
  const contacted = l.comms.some(c => c.channel === 'Call' || c.channel === 'Email');
  const agentReady = !!(p.agent.name && p.agent.notice.value);
  const req = s.requests.find(r => r.kind === 'New landlord' && r.data?.lead === l.id);
  const waitingReq = req?.status === 'Waiting';
  const ll = l.landlordId ? L.landlord(l.landlordId) : undefined;
  const addComm = (c: Comm) => { updLead(s, l.id, { comms: [...l.comms, c] }); s.log(`${c.channel === 'Email' ? 'Emailed' : c.channel === 'Call' ? 'Called' : 'Note for'} ${l.name} (Planned Switch)`, 'Planned Switch'); s.toast(p.stage === 1 && (c.channel === 'Call' || c.channel === 'Email') ? 'Saved. Next: start the assessment.' : 'Saved'); };
  const ask = () => {
    const rid = 'Q' + Date.now();
    s.setRequests(rs => [{ id: rid, kind: 'New landlord', from: ME, title: `Create landlord account: ${l.name}`, about: `Planned Switch · signed ${p.signed} · ${p.address}, ${p.area} · ${p.proposal?.plan}% plan`, at: nowStamp(), status: 'Waiting', link: { route: 'switch', id: l.id }, data: { name: l.name, email: l.email, phone: l.phone, billing: '', plan: String(p.proposal?.plan ?? 16), lead: l.id } }, ...rs]);
    updLead(s, l.id, {}, `Sent to ${SUPERVISOR} to approve onboarding and create the landlord`, sys(`Sent to ${SUPERVISOR} to approve onboarding.`));
  };
  const demoApprove = () => {
    const lid = 'L' + (10 + s.landlords.length) + (Date.now() % 100);
    s.setLandlords(ls => [...ls, { id: lid, name: l.name, email: l.email, phone: l.phone, billing: p.address + ', ' + p.area, plan: (p.proposal?.plan ?? 16) as never, start: p.dates.earliest.value && isDate(p.dates.earliest.value) ? p.dates.earliest.value : '1 Dec 2026', admin: l.owner ?? ME, status: 'Invite sent', bank: '—', comms: [{ id: 'cm' + Date.now(), at: nowStamp(), by: SUPERVISOR, channel: 'Email', dir: 'out', subject: 'Your LSP account', text: 'Login email sent from Outlook.' }] }]);
    if (req) s.setRequests(rs => rs.map(r => r.id === req.id ? { ...r, status: 'Done', reply: 'Onboarding approved. Landlord account created.', answered: nowStamp(), link: { route: 'landlords', id: lid } } : r));
    linkLeadLandlord(s, l.id, lid); s.log(`${SUPERVISOR} approved onboarding for ${l.name}`, 'Planned Switch'); s.toast(`${SUPERVISOR} approved. Landlord created. Start the handover.`);
  };
  const activate = () => {
    const prid = 'P' + (Date.now() % 100000);
    s.setProperties(ps => [{ id: prid, address: p.address, area: `${p.area} ${p.postcode}`.trim(), type: p.type, beds: p.beds, baths: 1, managed: true, owner: l.landlordId!, rent: p.rent, status: 'Let', admin: l.owner ?? ME, photo: 'images/home2.jpg', budget: 1200, used: 0, gas: true, added: '15 Oct 2026' }, ...ps]);
    const review = addDays('15 Oct 2026', 30);
    s.setTasks(ts => [{ id: 'K' + Date.now(), title: `30-day review after the switch: ${p.address}`, admin: l.owner ?? ME, due: review, late: false, done: false, created: nowStamp(), area: 'Planned Switch', link: { route: 'switch', id: l.id } }, ...ts]);
    updProp(s, l, p.id, { stage: 7, activated: nowStamp(), propertyId: prid }, `${p.address} is now a managed LSP home. 30-day review set for ${review}.`, sys(`Takeover confirmed for ${p.takeover}. ${p.address} activated as a managed home. Source and history kept.`));
  };
  const allHandover = p.handover.every(h => h.done);

  const action: ReactNode = l.closed ? <ActionCard tone="neutral" title={l.closed.outcome} text={`${l.closed.reason} · ${l.closed.at} · ${l.closed.by}`}><Btn block kind="outline" onClick={() => updLead(s, l.id, { closed: undefined }, `Reopened ${l.name}`, sys('Lead reopened.'))}>Reopen lead</Btn></ActionCard> : (() => {
    switch (p.stage) {
      case 0: return !l.owner && !IS_OA ? <ActionCard text="New Planned Switch lead. Give it to an Office Admin. They contact the landlord within 24 hours."><Btn block icon={<UserCheck size={16} />} onClick={() => setM('assign')}>Assign Office Admin</Btn></ActionCard>
        : <ActionCard text={`Move ${l.name.split(' ')[0]} to Contact pending, then call or email them.`}><Btn block icon={<ArrowRight size={16} />} onClick={() => updProp(s, l, p.id, { stage: 1 }, `${l.name} moved to Contact pending`, sys('Moved to Contact pending.'))}>Start contact</Btn></ActionCard>;
      case 1: return <ActionCard text={contacted ? 'Contact is logged. Start the assessment: ask for their signed agreement and check the notice rules.' : `Call or email ${l.name.split(' ')[0]} (prefers ${l.contactPref.toLowerCase()}). Check they own the property and it is managed by an agent.`}>
        {contacted ? <Btn block icon={<ArrowRight size={16} />} onClick={() => updProp(s, l, p.id, { stage: 2 }, `Assessment started for ${p.address}`, sys('Assessment started.'))}>Start assessment</Btn> : <><Btn block icon={<Phone size={16} />} onClick={() => setM('call')}>Log a call</Btn><Btn block kind="outline" icon={<Mail size={16} />} onClick={() => setM('email')}>Send email</Btn></>}
        <Btn block kind="ghost" icon={<Ban size={16} />} onClick={() => setM('unq')}>Unqualified</Btn></ActionCard>;
      case 2: return <ActionCard text={agentReady ? 'Agent details are in. Make the decision: ready to plan, move later or needs clarification.' : 'Add the current agent, their fee, the agreement end date, notice period and any continuing charges. Mark each one confirmed or estimated.'}>
        {agentReady ? <Btn block icon={<CheckCircle2 size={16} />} onClick={() => setM('decide')}>Make the decision</Btn> : <Btn block icon={<FileText size={16} />} onClick={() => setM('agent')}>Add agent details</Btn>}
        {agentReady && <Btn block kind="outline" icon={<FileText size={16} />} onClick={() => setM('agent')}>Edit agent details</Btn>}</ActionCard>;
      case 3: return p.route === 'Ready to plan' ? <ActionCard tone="ok" title="Ready to plan" text="Send the proposal: the LSP plan, how the fee works and a fair comparison with staying."><Btn block icon={<Send size={16} />} onClick={() => setM('proposal')}>Create proposal</Btn></ActionCard>
        : p.route === 'Future switch' ? <ActionCard tone="neutral" title="Future switch" text={`Not the right time yet.${p.dates.safeNotice.confirmed ? ` Latest safe notice date: ${p.dates.safeNotice.value}.` : ''} Keep in touch with their permission and call again before the deadline.`}><Btn block icon={<CalendarClock size={16} />} onClick={() => setM('follow')}>{l.nextContact ? 'Change follow-up' : 'Set follow-up'}</Btn><Btn block kind="outline" icon={<CheckCircle2 size={16} />} onClick={() => updProp(s, l, p.id, { route: 'Ready to plan' }, `${p.address}: now ready to plan`, sys('Route changed to Ready to plan.'))}>Ready to plan now</Btn></ActionCard>
        : <ActionCard tone="warn" title="Needs clarification" text={p.clarify ?? 'Something is missing.'}><Btn block icon={<FileText size={16} />} onClick={() => setM('agent')}>Update agent details</Btn><Btn block kind="outline" icon={<CheckCircle2 size={16} />} onClick={() => setM('decide')}>Clarified · decide again</Btn></ActionCard>;
      case 4: { const pr = p.proposal!; return pr.response === 'Accepted' ? <ActionCard tone="ok" text={`${l.name.split(' ')[0]} accepted the ${pr.plan}% plan. Upload the signed LSP agreement.`}><Btn block icon={<Upload size={16} />} onClick={() => setM('signed')}>Agreement signed</Btn></ActionCard>
        : <ActionCard text={`Proposal for the ${pr.plan}% plan sent ${pr.sent}. Log the landlord's answer.`}><Btn block icon={<CheckCircle2 size={16} />} onClick={() => updProp(s, l, p.id, { proposal: { ...pr, response: 'Accepted' } }, `${l.name} accepted the proposal`, sys(`Proposal accepted (${pr.plan}% plan).`))}>Landlord accepted</Btn><Btn block kind="outline" icon={<CalendarClock size={16} />} onClick={() => { updProp(s, l, p.id, { proposal: { ...pr, response: 'Thinking it over' } }); setM('follow'); }}>Thinking it over</Btn><Btn block kind="ghost" icon={<XCircle size={16} />} onClick={() => setM('declined')}>Landlord said no</Btn></ActionCard>; }
      case 5: return IS_OA
        ? (waitingReq ? <><ActionCard tone="warn" title={`With ${SUPERVISOR}`} text={`Signed ${p.signed}. Only the Supervisor approves onboarding and creates the landlord account. This home is not counted as managed yet.`}><Btn block kind="outline" icon={<BellRing size={16} />} onClick={() => { s.log(`Reminded ${SUPERVISOR} about onboarding ${l.name}`, 'Planned Switch'); s.toast(`Reminder sent to ${SUPERVISOR}`); }}>Remind {SUPERVISOR}</Btn></ActionCard>
            <Demo title="Prototype: the Supervisor's answer"><Btn sm kind="success" icon={<CheckCircle2 size={14} />} onClick={demoApprove}>Supervisor approves onboarding</Btn></Demo></>
          : <ActionCard tone="ok" text={`Signed ${p.signed}. Ask ${SUPERVISOR} to approve onboarding and create the landlord account. Their details are sent with it.`}><Btn block icon={<Send size={16} />} onClick={ask}>Ask Supervisor to approve onboarding</Btn></ActionCard>)
        : <ActionCard tone="ok" title="Your approval" text={`Signed ${p.signed}${req ? ` · ${adminName(req.from)} asked you on ${req.at}` : ''}. Approve onboarding and create the landlord account. The property is added when the takeover is confirmed.`}><Btn block icon={<UserCheck size={16} />} onClick={() => setM('create')}>Approve onboarding · create landlord</Btn></ActionCard>;
      case 6: return <ActionCard text={allHandover && p.takeover ? `Everything is handed over. Confirm the takeover to make ${p.address} a managed home.` : 'Tick each handover item as it arrives, and set the takeover date agreed with the landlord.'}><Btn block icon={<KeyRound size={16} />} disabled={!allHandover || !p.takeover} onClick={activate}>Confirm takeover · activate</Btn></ActionCard>;
      default: return <ActionCard tone="ok" title="Activated" text={`${p.address} is a managed LSP home since ${p.activated}. The 30-day review is in the tasks.`}>{p.propertyId && <Btn block icon={<Home size={16} />} onClick={() => s.go('properties', p.propertyId)}>Open property</Btn>}{ll && <Btn block kind="outline" icon={<ArrowRight size={16} />} onClick={() => s.go('landlords', ll.id)}>Open landlord</Btn>}</ActionCard>;
    }
  })();

  return <>
    <PageHeader crumbs={crumbsFor('switch', s.go, l.name)} back={() => s.go('switch')} title={l.name}
      action={<div className="flex">{live && <Btn kind="outline" icon={<XCircle size={16} />} onClick={() => setM('close')}>Close lead</Btn>}{!l.closed && <Btn kind="outline" icon={<CalendarClock size={16} />} onClick={() => setM('follow')}>Follow-up</Btn>}<Btn kind="outline" icon={<Phone size={16} />} onClick={() => setM('call')}>Log a call</Btn></div>} />
    <DetailHead media={<Avatar name={l.name} size="xl" />} title={l.name}
      chips={<><Chip tone="brand" dot={false}>Planned Switch</Chip><Chip tone="neutral" dot={false}>{l.source}{l.campaign ? ` · ${l.campaign}` : ''}</Chip>{l.closed ? <Chip tone="neutral">{l.closed.outcome}</Chip> : <Chip tone={LANE_TONE[p.stage] === 'warn' ? 'warn' : 'info'}>{SW_STAGES[p.stage]}</Chip>}{ll && <Chip tone="ok">Landlord account</Chip>}</>}
      meta={[['Email', l.email], ['Phone', l.phone], ['Prefers', l.contactPref], ['Lead since', l.created]]} />
    {l.props.length > 1 && <PageTabs value={sel} onChange={setSel} items={l.props.map(x => ({ id: x.id, label: `${x.address} · ${SW_STAGES[x.stage]}` }))} />}
    <Card><HSteps items={SW_STAGES} at={p.stage} stopped={l.closed ? l.closed.outcome : undefined} /></Card>
    {p.stage >= 5 && p.stage < 7 && <Note tone="warn">Signed but not live. This property is not counted as a managed home until the takeover is confirmed.</Note>}
    <div className="dgrid">
      <div className="col">
        <Card title="The property" sub={l.props.length > 1 ? `One of ${l.props.length} properties. Each has its own stage and dates.` : undefined}>
          <KV rows={[['Address', `${p.address}${p.postcode ? ', ' + p.postcode : ''}`], ['Area', `${p.area}, North London`], ['Type', `${p.beds} bed ${p.type.toLowerCase()}`], ['Monthly rent', p.rent ? money(p.rent) : 'Not known'], ['Why they want to switch', l.reason], ['When', l.timeframe]]} /></Card>
        <Card title="Current agent" sub="From the signed agreement. Estimated facts are marked until checked." action={live && p.stage >= 1 && <Btn sm kind="ghost" icon={<FileText size={14} />} onClick={() => setM('agent')}>Edit</Btn>}>
          <KV rows={[['Agency', p.agent.name || 'Not named yet'], ['Their fee', p.agent.fee ? `${p.agent.fee} ${p.agent.vat === 'Not known' ? '(VAT not known)' : p.agent.vat}` : 'Not known'], ['Fixed extras', p.agent.extras || '—'], ['Their signed agreement', p.agent.contract ? <span className="flex" style={{ gap: 6 }}><FileText size={14} />{p.agent.contract} <Chip tone="neutral" dot={false}>Staff only</Chip></span> : <Chip tone="warn">Not received</Chip>], ['Agreement ends', <Fact f={p.agent.endDate} />], ['Notice period', <Fact f={p.agent.notice} />], ['How notice is given', p.agent.method], ['Continuing fees or commission', <Fact f={p.agent.continuing} />]]} />
          <Note>Ending management may not end tenant-linked commission. Never promise a fee-free exit. Legal questions go to a qualified professional.</Note></Card>
        <Card title="Switch dates"><KV rows={[['Latest safe date to give notice', <Fact f={p.dates.safeNotice} />], ['Earliest LSP takeover', <Fact f={p.dates.earliest} />], ['Landlord prefers', p.dates.preferred || '—'], ['Blockers', p.dates.blockers || '—'], ['Possible costs', p.agent.continuing.value || '—']]} /></Card>
        {p.proposal && <Card title={`Proposal · ${p.proposal.plan}% plan`} sub={`Sent ${p.proposal.sent}`} action={<Chip tone={p.proposal.response === 'Accepted' ? 'ok' : p.proposal.response === 'Declined' ? 'neutral' : 'warn'}>{p.proposal.response}</Chip>}>
          <KV rows={[['Package', PLANS.find(x => x.p === p.proposal!.plan)?.t ?? ''], ['Fee', p.proposal.basis], ['Comparison', p.proposal.comparison], ['Switching credit', p.proposal.credit ? `${money(p.proposal.credit.amount)} · ${p.proposal.credit.status}` : 'None asked']]} />
          {p.proposal.credit?.status === 'Waiting for Director' && <Demo title="Prototype: the Director's answer"><Btn sm kind="success" onClick={() => updProp(s, l, p.id, { proposal: { ...p.proposal!, credit: { ...p.proposal!.credit!, status: 'Approved' } } }, 'Director approved the switching credit', sys('Switching credit approved by the Director.', 'Director'))}>Director approves</Btn><Btn sm kind="outline" onClick={() => updProp(s, l, p.id, { proposal: { ...p.proposal!, credit: { ...p.proposal!.credit!, status: 'Declined' } } }, 'Director declined the switching credit', sys('Switching credit declined by the Director.', 'Director'))}>Director declines</Btn></Demo>}
        </Card>}
        {p.stage >= 6 && <Card title="Handover checklist" sub="Tick each item when it is done. Every tick is saved with the date and time.">
          <div className="divlist">{p.handover.map((h, i) => <label key={h.item} className="item click" style={{ cursor: p.stage === 6 ? 'pointer' : 'default' }}><input type="checkbox" disabled={p.stage !== 6} checked={!!h.done} onChange={ev => updProp(s, l, p.id, { handover: p.handover.map((x, k) => k === i ? { ...x, done: ev.target.checked ? nowStamp() : undefined } : x) }, undefined, ev.target.checked ? sys(`Handover: ${h.item}`) : undefined)} /><div className="stack grow"><b>{h.item}</b>{h.done && <span className="caption">Done {h.done}</span>}</div>{h.done ? <Chip tone="ok">Done</Chip> : <Chip tone="neutral">To do</Chip>}</label>)}</div>
          <Field label="Takeover date agreed with the landlord"><input className="input" type="date" disabled={p.stage !== 6} value={toInput(p.takeover)} onChange={ev => updProp(s, l, p.id, { takeover: dateLabel(ev.target.value) })} /></Field></Card>}
        <Card title="Communication" sub="Every call, email and note, with the date and time."><CommsLog items={l.comms.filter(c => c.channel !== 'System')} to={l.email} onAdd={!l.closed ? addComm : undefined} /></Card>
      </div>
      <div className="col">
        {action}
        <Card title="Follow-up">{l.nextContact ? <div className="flex"><span className={`datetile t-${daysFrom(l.nextContact) < 0 ? 'err' : 'info'}`}><b>{l.nextContact.split(' ')[0]}</b><span>{l.nextContact.split(' ')[1]?.toUpperCase()}</span></span><div className="stack grow"><b>{l.nextNote}</b><span className="caption">{daysFrom(l.nextContact) < 0 ? 'Overdue' : `In ${daysFrom(l.nextContact)} days`} · reminder in {l.owner ? adminName(l.owner) : 'your'} tasks</span></div></div> : <span className="caption">No follow-up set.</span>}
          {!l.closed && <Btn sm kind="outline" icon={<CalendarClock size={14} />} onClick={() => setM('follow')}>{l.nextContact ? 'Change date' : 'Set follow-up'}</Btn>}</Card>
        <Card title="Owner">{l.owner ? <div className="flex"><Avatar id={l.owner} size="md" /><div className="stack grow"><b>{adminName(l.owner)}</b><span className="caption">Works this lead</span></div>{!IS_OA && !l.closed && <Btn sm kind="ghost" onClick={() => setM('assign')}>Change</Btn>}</div> : <>{<Note tone="warn">Not assigned yet.</Note>}{!IS_OA && <Btn sm icon={<UserCheck size={14} />} onClick={() => setM('assign')}>Assign Office Admin</Btn>}</>}</Card>
        <Card title="Permission"><KV rows={[['Contact about this switch', l.permission ? <Chip tone="ok">Given</Chip> : <Chip tone="err">Not given</Chip>], ['Marketing updates', l.marketing ? <Chip tone="ok">Subscribed</Chip> : <Chip tone="neutral">Unsubscribed</Chip>]]} />
          {l.marketing && <Btn sm kind="ghost" icon={<Ban size={14} />} onClick={() => updLead(s, l.id, { marketing: false }, `${l.name} unsubscribed from marketing`, sys('Unsubscribed from marketing. Added to the suppression list.'))}>Unsubscribe</Btn>}</Card>
        {ll && <Card title="Landlord account"><button className="lrow click" onClick={() => s.go('landlords', ll.id)}><Avatar name={ll.name} /><div className="stack grow"><b>{ll.name}</b><span className="caption">{ll.plan}% plan · {ll.status}</span></div><ArrowRight size={16} color="#98A2B3" /></button></Card>}
        <Card title="History"><Timeline items={[{ at: l.created, text: `Lead created from ${l.source}` }, ...l.comms.filter(c => c.channel === 'System').map(c => ({ at: c.at, text: c.text, by: c.by }))].reverse()} /></Card>
      </div>
    </div>
    {(m === 'call' || m === 'email') && <CommModal mode={m === 'call' ? 'Call' : 'Email'} to={l.email} onClose={() => setM('')} onSave={c => { addComm(c); setM(''); }} />}
    {m === 'assign' && <AssignAdminModal current={l.owner} onClose={() => setM('')} onPick={a => { updLead(s, l.id, x => ({ owner: a, props: x.props.map(pp => pp.stage === 0 ? { ...pp, stage: 1 } : pp) }), `${l.name} given to ${adminName(a)}`, sys(`Given to ${adminName(a)}.`)); s.setTasks(ts => [{ id: 'K' + Date.now(), title: `Contact ${l.name} about a planned switch`, admin: a, due: '16 Oct 2026', late: false, done: false, created: nowStamp(), area: 'Planned Switch', link: { route: 'switch', id: l.id } }, ...ts]); setM(''); }} />}
    {m === 'agent' && <AgentModal l={l} p={p} onClose={() => setM('')} />}
    {m === 'decide' && <DecideModal l={l} p={p} onClose={() => setM('')} />}
    {m === 'proposal' && <ProposalModal l={l} p={p} onClose={() => setM('')} />}
    {m === 'follow' && <FollowModal l={l} p={p} onClose={() => setM('')} />}
    {m === 'signed' && <UploadModal title="Upload the signed LSP agreement" sub="Saved with the lead. Staff only." cta="Save · agreement signed" onClose={() => setM('')} onSave={v => { updProp(s, l, p.id, { stage: 5, signed: nowStamp() }, `${l.name} signed the LSP agreement`, sys(`Signed LSP agreement uploaded (${v.file}). Not managed until takeover.`)); setM(''); }} />}
    {(m === 'close' || m === 'declined' || m === 'unq') && <Reason danger title={m === 'unq' ? 'Unqualified' : 'Close lead · not proceeding'} sub="The lead moves to Closed. The reason is saved." cta="Close lead" options={m === 'unq' ? ['Does not own a rental property', 'Not in North London', 'Not managed by an agent (send to Enquiries)', 'Duplicate'] : ['Landlord said no', 'Staying with the current agent', 'Switching costs too high', 'Sold the property', 'No reply after 3 tries']} onClose={() => setM('')} onDone={r => { updLead(s, l.id, x => ({ closed: { outcome: m === 'unq' ? 'Unqualified' : 'Not proceeding', reason: r, at: nowStamp(), by: actor() }, props: m === 'declined' ? x.props.map(pp => pp.id === p.id && pp.proposal ? { ...pp, proposal: { ...pp.proposal, response: 'Declined' } } : pp) : x.props }), `Closed ${l.name}: ${r}`, sys(`Closed: ${r}`)); setM(''); }} />}
    {m === 'create' && <NewLandlordModal from={req ? adminName(req.from) : undefined} skipProperty checkFirst prefill={{ name: l.name, email: l.email, phone: l.phone, billing: `${p.address}${p.postcode ? ', ' + p.postcode : ''}`, plan: p.proposal?.plan ?? 16, admin: l.owner }} onClose={() => setM('')} onCreated={lid => {
      if (req) s.setRequests(rs => rs.map(r => r.id === req.id ? { ...r, status: 'Done', reply: 'Onboarding approved. Landlord account created.', answered: nowStamp(), link: { route: 'landlords', id: lid } } : r));
      linkLeadLandlord(s, l.id, lid, ME_NAME); s.go('switch', `${l.id}.${p.id}`); }} />}
  </>;
}

function FactInput({ label, f, onChange, placeholder, date }: { label: string; f: SwFact; onChange: (f: SwFact) => void; placeholder?: string; date?: boolean }) {
  return <Field label={label}><div className="flex" style={{ gap: 8 }}>
    {date ? <input className="input" type="date" value={toInput(f.value)} onChange={e => onChange({ ...f, value: dateLabel(e.target.value) })} /> : <Text value={f.value} onChange={v => onChange({ ...f, value: v })} placeholder={placeholder} />}
    <label className="check" style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={f.confirmed} onChange={e => onChange({ ...f, confirmed: e.target.checked })} /> Confirmed</label></div></Field>;
}
function AgentModal({ l, p, onClose }: { l: Lead; p: SwProp; onClose: () => void }) {
  const s = useStore();
  const [a, setA] = useState(p.agent); const [d, setD] = useState(p.dates); const [file, setFile] = useState(p.agent.contract ?? '');
  const [pr, setPr] = useState({ address: p.address, postcode: p.postcode, rent: p.rent ? String(p.rent) : '', type: p.type, beds: String(p.beds) });
  return <Modal wide title="Current agent and switch dates" sub="Tick Confirmed only when you have checked it in the signed agreement or in writing." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!a.name.trim()} onClick={() => { updProp(s, l, p.id, { agent: { ...a, contract: file || undefined }, dates: d, address: pr.address, postcode: pr.postcode, rent: +pr.rent || 0, type: pr.type, beds: +pr.beds || p.beds }, `Saved agent details for ${pr.address}`, sys(`Agent details updated: ${a.name}, notice ${a.notice.value || 'not known'}${a.notice.confirmed ? ' (confirmed)' : ' (estimated)'}.`)); onClose(); }}>Save</Btn></>}>
    <div className="sec-label">The property</div>
    <div className="grid g3"><Field label="Address"><Text value={pr.address} onChange={v => setPr({ ...pr, address: v })} /></Field><Field label="Postcode"><Text value={pr.postcode} onChange={v => setPr({ ...pr, postcode: v })} placeholder="N1 0RW" /></Field><Field label="Monthly rent (£)"><Text value={pr.rent} onChange={v => setPr({ ...pr, rent: v })} /></Field></div>
    <div className="sec-label">Current agent</div>
    <div className="grid g3"><Field label="Agency"><Text value={a.name} onChange={v => setA({ ...a, name: v })} placeholder="e.g. Foxtons" /></Field><Field label="Their management fee"><Text value={a.fee} onChange={v => setA({ ...a, fee: v })} placeholder="e.g. 15%" /></Field><Field label="VAT"><Select value={a.vat} onChange={v => setA({ ...a, vat: v })} options={['+ VAT', 'Including VAT', 'Not known'].map(x => ({ value: x, label: x }))} /></Field></div>
    <div className="grid g2"><Field label="Fixed extras"><Text value={a.extras} onChange={v => setA({ ...a, extras: v })} placeholder="e.g. £180 renewal fee" /></Field><Field label="How notice must be given"><Select value={a.method} onChange={v => setA({ ...a, method: v })} options={['Email', 'Letter by post', 'Agent portal', 'Not known'].map(x => ({ value: x, label: x }))} /></Field></div>
    <Field label="Signed agreement (staff only)"><label className="dropzone" style={{ padding: 14 }}><Upload size={18} /><b>{file || 'Choose the signed agreement'}</b><input type="file" hidden accept=".pdf,.jpg,.png" onChange={e => setFile(e.target.files?.[0]?.name ?? file)} /></label></Field>
    <div className="grid g2"><FactInput date label="Agreement end date" f={a.endDate} onChange={f => setA({ ...a, endDate: f })} /><FactInput label="Notice period" f={a.notice} onChange={f => setA({ ...a, notice: f })} placeholder="e.g. 2 months" /></div>
    <FactInput label="Continuing fees or commission after leaving" f={a.continuing} onChange={f => setA({ ...a, continuing: f })} placeholder="e.g. Tenant-find commission continues while the tenant stays" />
    <div className="sec-label">Switch dates</div>
    <div className="grid g2"><FactInput date label="Latest safe date to give notice" f={d.safeNotice} onChange={f => setD({ ...d, safeNotice: f })} /><FactInput date label="Earliest LSP takeover" f={d.earliest} onChange={f => setD({ ...d, earliest: f })} /></div>
    <div className="grid g2"><Field label="Landlord prefers"><Text value={d.preferred} onChange={v => setD({ ...d, preferred: v })} placeholder="e.g. After the tenant renews" /></Field><Field label="Blockers"><Text value={d.blockers} onChange={v => setD({ ...d, blockers: v })} placeholder="e.g. Waiting for the signed agreement" /></Field></div>
  </Modal>;
}
function DecideModal({ l, p, onClose }: { l: Lead; p: SwProp; onClose: () => void }) {
  const s = useStore();
  const [r, setR] = useState<SwRoute>(p.route && p.route !== 'Needs clarification' ? p.route : 'Ready to plan'); const [why, setWhy] = useState(''); const [ok, setOk] = useState(false);
  const suggest = p.dates.safeNotice.confirmed && isDate(p.dates.safeNotice.value) ? addDays(p.dates.safeNotice.value, -21) : addDays('15 Oct 2026', 30);
  const [fu, setFu] = useState(toInput(suggest));
  return <Modal title="Your decision" sub={`${p.address} · ${p.agent.name}`} onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!ok || (r === 'Needs clarification' && !why.trim())} onClick={() => {
      updProp(s, l, p.id, { stage: 3, route: r, clarify: r === 'Needs clarification' ? why.trim() : undefined }, `${l.name}: ${r}`, sys(`Decision: ${r}${why ? '. ' + why : ''}. Approved by ${actor()}.`));
      if (r === 'Future switch' && fu) setFollowUp(s, l, dateLabel(fu), 'Check in before the notice deadline');
      onClose(); }}>Save decision</Btn></>}>
    <div className="grid g3">{(['Ready to plan', 'Future switch', 'Needs clarification'] as SwRoute[]).map(x => <button key={x} className={`choice${r === x ? ' on' : ''}`} onClick={() => setR(x)}><b>{x}</b><span className="caption">{x === 'Ready to plan' ? 'The switch can be planned now.' : x === 'Future switch' ? 'Not yet. Follow up before the deadline.' : 'Something is missing or unclear.'}</span></button>)}</div>
    {r === 'Needs clarification' && <Field label="What is missing?"><Area value={why} onChange={setWhy} placeholder="e.g. Signed agreement missing, notice period unknown" /></Field>}
    {r === 'Future switch' && <Field label="Follow-up date (suggested 3 weeks before the confirmed notice date, change it if needed)"><input className="input" type="date" value={fu} onChange={e => setFu(e.target.value)} /></Field>}
    {r === 'Ready to plan' && !p.dates.safeNotice.confirmed && <Note tone="warn">The notice date is still an estimate. Check it before planning dates with the landlord.</Note>}
    <label className="check"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> I have checked the agreement. This is a staff decision, not legal advice.</label>
  </Modal>;
}
function ProposalModal({ l, p, onClose }: { l: Lead; p: SwProp; onClose: () => void }) {
  const s = useStore();
  const [plan, setPlan] = useState<10 | 12 | 16 | 20>(16); const [basis, setBasis] = useState('16% of monthly rent, plus VAT'); const [cmp, setCmp] = useState(`Stay with ${p.agent.name || 'the current agent'}: ${p.agent.fee || '?'}${p.agent.vat !== 'Not known' ? ' ' + p.agent.vat : ''}, repairs charged on top.`); const [credit, setCredit] = useState('');
  const fee = p.rent ? Math.round(p.rent * plan / 100) : 0;
  return <Modal wide title="Create proposal" sub={`${l.name} · ${p.address}`} onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Send size={16} />} disabled={!basis.trim() || +credit > 150} onClick={() => { const at = nowStamp(); updProp(s, l, p.id, { stage: 4, proposal: { plan, basis, comparison: cmp, sent: at, response: 'Waiting', credit: +credit ? { amount: +credit, status: 'Waiting for Director' } : undefined } }, `Proposal sent to ${l.name} (${plan}% plan)`, { id: 'cm' + Date.now(), at, by: actor(), channel: 'Email', dir: 'out', subject: 'Your LSP Planned Switch proposal', text: `${PLANS.find(x => x.p === plan)?.t} · ${basis}.${+credit ? ` Switching credit of ${money(+credit)} subject to approval.` : ''}` }); onClose(); }}>Send proposal</Btn></>}>
    <div className="grid g4">{PLANS.map(x => <button key={x.p} className={`choice${plan === x.p ? ' on' : ''}`} onClick={() => { setPlan(x.p); setBasis(`${x.p}% of monthly rent, plus VAT`); }}><b style={{ fontSize: 20 }}>{x.p}%</b><span className="small" style={{ fontWeight: 700 }}>{x.t}</span><span className="caption">{x.d}</span></button>)}</div>
    <div className="grid g2"><Field label="How the fee works"><Text value={basis} onChange={setBasis} /></Field><Field label="LSP fee on this rent"><div className="ro">{p.rent ? `${money(fee)} a month on ${money(p.rent)} rent` : 'Rent not known'}</div></Field></div>
    <Field label="Comparison: stay, move now, move later"><Area value={cmp} onChange={setCmp} /></Field>
    <Field label="Switching credit (optional, up to £150 · needs Director approval)"><Text value={credit} onChange={setCredit} placeholder="0" /></Field>
    {+credit > 150 && <Note tone="err">The credit can't be more than £150.</Note>}
    <Note>Don't promise savings, a fee-free exit or a fixed transfer date. Maintenance covers defined routine work only.</Note>
  </Modal>;
}
function FollowModal({ l, p, onClose }: { l: Lead; p: SwProp; onClose: () => void }) {
  const s = useStore();
  const suggest = p.dates.safeNotice.confirmed && isDate(p.dates.safeNotice.value) ? addDays(p.dates.safeNotice.value, -21) : addDays('15 Oct 2026', 14);
  const [d, setD] = useState(toInput(l.nextContact) || toInput(suggest)); const [n, setN] = useState(l.nextNote ?? 'Check in');
  return <Modal title="Follow-up" sub="The reminder goes into the owner's tasks. Changing the date moves the reminder." onClose={onClose} footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!d} onClick={() => { setFollowUp(s, l, dateLabel(d), n.trim() || 'Check in'); onClose(); }}>Save follow-up</Btn></>}>
    <div className="grid g2"><Field label="Date"><input className="input" type="date" value={d} onChange={e => setD(e.target.value)} /></Field><Field label="What to do"><Text value={n} onChange={setN} /></Field></div>
    {p.dates.safeNotice.confirmed ? <Note>Confirmed notice deadline: {p.dates.safeNotice.value}. Suggested follow-up: {suggest}.</Note> : <Note tone="warn">The notice date isn't confirmed yet, so the suggestion is just two weeks from today.</Note>}
    {!l.permission && <Note tone="err">The landlord hasn't given permission to be contacted.</Note>}
  </Modal>;
}
function NewLead({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState({ name: '', email: '', phone: '', contactPref: 'Phone' as Lead['contactPref'], source: 'Phone' as Lead['source'], campaign: '', area: 'Islington', postcode: '', address: '', agent: '', timeframe: 'Not sure', reason: '', permission: false, marketing: false, owner: IS_OA ? ME : '' });
  const dup = s.leads.find(l => (f.email && l.email.toLowerCase() === f.email.toLowerCase()) || (f.phone && l.phone.replace(/\s/g, '') === f.phone.replace(/\s/g, ''))) ?? s.landlords.find(l => f.email && l.email.toLowerCase() === f.email.toLowerCase());
  const ok = f.name.trim() && f.email.includes('@') && f.permission && !dup;
  return <Modal wide title="New Planned Switch lead" sub="For a landlord whose home is managed by another agent. Phone, referral or walk-in." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!ok} onClick={() => { const id = 'SW' + (100 + s.leads.length); s.setLeads(ls => [{ id, created: nowStamp(), name: f.name.trim(), email: f.email.trim(), phone: f.phone, contactPref: f.contactPref, permission: f.permission, marketing: f.marketing, source: f.source, campaign: f.campaign || undefined, owner: f.owner || undefined, reason: f.reason || '—', timeframe: f.timeframe, comms: [sys(`Lead added by ${actor()}.`)], props: [blankProp('a', f.address || 'Address to confirm', f.postcode, f.area, f.owner ? 1 : 0, f.agent)] }, ...ls]); s.log(`New Planned Switch lead: ${f.name.trim()}`, 'Planned Switch'); s.toast('Lead added'); onClose(); s.go('switch', id); }}>Add lead</Btn></>}>
    <div className="grid g3"><Field label="Full name"><Text value={f.name} onChange={v => setF({ ...f, name: v })} /></Field><Field label="Email"><Text value={f.email} onChange={v => setF({ ...f, email: v })} /></Field><Field label="Phone"><Text value={f.phone} onChange={v => setF({ ...f, phone: v })} /></Field></div>
    <div className="grid g3"><Field label="Prefers"><Select value={f.contactPref} onChange={v => setF({ ...f, contactPref: v as Lead['contactPref'] })} options={['Phone', 'Email', 'WhatsApp'].map(x => ({ value: x, label: x }))} /></Field><Field label="Source"><Select value={f.source} onChange={v => setF({ ...f, source: v as Lead['source'] })} options={['Phone', 'Referral', 'Website', 'Google Ads', 'Facebook', 'Instagram'].map(x => ({ value: x, label: x }))} /></Field><Field label="Campaign or referrer (optional)"><Text value={f.campaign} onChange={v => setF({ ...f, campaign: v })} placeholder="e.g. accountant-referral" /></Field></div>
    <div className="grid g3"><Field label="Area"><Select value={f.area} onChange={v => setF({ ...f, area: v })} options={AREAS.map(a => ({ value: a, label: a }))} /></Field><Field label="Postcode"><Text value={f.postcode} onChange={v => setF({ ...f, postcode: v })} placeholder="N1 0RW" /></Field><Field label="Address (if given)"><Text value={f.address} onChange={v => setF({ ...f, address: v })} /></Field></div>
    <div className="grid g3"><Field label="Current agent"><Text value={f.agent} onChange={v => setF({ ...f, agent: v })} placeholder="e.g. Foxtons" /></Field><Field label="When they want to switch"><Select value={f.timeframe} onChange={v => setF({ ...f, timeframe: v })} options={['Now', 'In the next 6 months', 'Early 2027', 'Not sure'].map(x => ({ value: x, label: x }))} /></Field>{!IS_OA ? <Field label="Owner"><Select value={f.owner} onChange={v => setF({ ...f, owner: v })} options={[{ value: '', label: 'Assign later' }, ...s.staff.filter(x => x.role === 'Office Admin' && x.active).map(a => ({ value: a.id, label: a.name }))]} /></Field> : <Field label="Owner"><div className="ro">You · {ME_NAME}</div></Field>}</div>
    <Field label="Why they want to switch"><Text value={f.reason} onChange={v => setF({ ...f, reason: v })} /></Field>
    <label className="check"><input type="checkbox" checked={f.permission} onChange={e => setF({ ...f, permission: e.target.checked })} /> They agreed to be contacted about this switch</label>
    <label className="check"><input type="checkbox" checked={f.marketing} onChange={e => setF({ ...f, marketing: e.target.checked })} /> They want marketing updates</label>
    {dup && <Note tone="err">{dup.name} ({dup.email}) is already {'props' in dup ? 'a Planned Switch lead' : 'a landlord'}. No new lead is needed.</Note>}
  </Modal>;
}

