import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  LayoutDashboard, ArrowRightLeft, ListChecks, Send, Mail, User, KeyRound, UserCheck, Home, UserPlus, Briefcase, Wrench, ClipboardCheck, HardHat, ArrowLeft,
  CircleCheck, ShieldCheck, PoundSterling, History, Lock, FileBarChart, PanelLeft, LogOut, Search, Bell, CalendarDays, ChevronRight, ArrowRight, Eye, EyeOff, ShieldAlert,
} from 'lucide-react';
import { useStore, useLookups, type Route } from './store';
import { LET_STAGES, daysFrom, ME_NAME, SUPERVISOR } from './data';
import { Btn, IBtn, Note } from './ui';

export const NAV: { group: string; items: { id: Route; label: string; icon: typeof Home }[] }[] = [
  { group: 'My Work', items: [{ id: 'today', label: 'My Day', icon: LayoutDashboard }, { id: 'tasks', label: 'My Tasks', icon: ListChecks }, { id: 'enquiries', label: 'Enquiries', icon: Mail }, { id: 'switch', label: 'Planned Switch', icon: ArrowRightLeft }] },
  { group: 'Homes & People', items: [{ id: 'landlords', label: 'Landlords', icon: User }, { id: 'lettings', label: 'Lettings', icon: KeyRound }, { id: 'tenants', label: 'Tenants', icon: UserCheck }, { id: 'properties', label: 'Properties', icon: Home }] },
  { group: 'Work', items: [{ id: 'clients', label: 'Clients', icon: Briefcase }, { id: 'contractors', label: 'Contractors', icon: HardHat }, { id: 'jobs', label: 'Jobs', icon: Wrench }, { id: 'inspections', label: 'Inspections', icon: ClipboardCheck }] },
  { group: 'Checks & Money', items: [{ id: 'safety', label: 'Safety & Compliance', icon: ShieldCheck }, { id: 'rent', label: 'Rent & Invoices', icon: PoundSterling }] },
  { group: 'Supervisor & Records', items: [{ id: 'requests', label: 'Sent to Supervisor', icon: Send }, { id: 'records', label: 'My History', icon: History }] },
];
export const LABEL: Record<Route, string> = Object.fromEntries(NAV.flatMap(g => g.items.map(i => [i.id, i.label]))) as Record<Route, string>;
const GROUP: Record<Route, string> = Object.fromEntries(NAV.flatMap(g => g.items.map(i => [i.id, g.group]))) as Record<Route, string>;

export function useCounts() {
  const s = useStore();
  return {
    tasks: s.tasks.filter(t => !t.done && (t.late || t.due === '15 Oct 2026')).length,
    enquiries: s.enquiries.filter(e => e.stage === 'Assigned').length,
    lettings: s.applicants.filter(a => !a.rejected && (a.stage <= 3 || a.stage === 5)).length,
    tenants: s.tenants.filter(t => t.status === 'Moving out').length,
    jobs: s.jobs.filter(j => (j.urgent && !['Approved', 'Invoiced', 'Declined'].includes(j.status)) || j.status === 'Proof uploaded').length,
    safety: s.safety.filter(c => c.status === 'Overdue' || c.status === 'Missing').length,
    requests: s.jobs.filter(j => j.status === 'Waiting approval').length + s.applicants.filter(a => a.stage === 4 && !a.rejected).length + s.requests.filter(r => r.status === 'Waiting').length,
    switch: s.leads.filter(l => !l.closed && ((l.nextContact && daysFrom(l.nextContact) <= 0) || l.props.some(p => p.stage === 0 || (p.stage === 5 && !l.landlordId)))).length,
  } as Partial<Record<Route, number>>;
}

export function Sidebar({ onLogout }: { onLogout: () => void }) {
  const { route, go } = useStore();
  const counts = useCounts();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className="sidebar" style={collapsed ? { width: 76 } : undefined} aria-label="Main menu">
      <div className="sb-logo">{!collapsed && <img src="images/logo.svg" alt="Landlord Service Plans" />}<button onClick={() => setCollapsed(c => !c)} aria-label="Collapse menu"><PanelLeft size={18} strokeWidth={1.8} /></button></div>
      <nav className="sb-nav">
        {NAV.map((g, gi) => <div key={g.group} className={gi > 0 ? 'sb-group' : undefined}>
          {g.items.map(it => { const Ic = it.icon; const n = counts[it.id]; return (
            <button key={it.id} className={`nav${route === it.id ? ' on' : ''}`} onClick={() => go(it.id)} title={it.label} aria-current={route === it.id ? 'page' : undefined}>
              <Ic size={20} strokeWidth={1.8} />{!collapsed && <span>{it.label}</span>}{!collapsed && !!n && <span className="count">{n}</span>}
            </button>); })}
        </div>)}
      </nav>
      <div className="sb-user"><img className="avatar md" src="images/av3.jpg" alt="" />{!collapsed && <div className="stack"><b style={{ fontSize: 13 }}>{ME_NAME}</b><span className="caption">Office Admin · LSP</span></div>}<button onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={18} strokeWidth={1.8} /></button></div>
    </aside>
  );
}

export function PageHeader({ title, action, crumbs, back }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; crumbs?: { label: string; onClick?: () => void }[]; back?: () => void }) {
  const s = useStore();
  const L = useLookups();
  const [q, setQ] = useState('');
  const [pop, setPop] = useState<'' | 'bell' | 'cal'>('');
  const ref = useRef<HTMLDivElement>(null);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const r: { label: string; sub: string; go: () => void }[] = [];
    s.landlords.filter(x => x.name.toLowerCase().includes(t)).forEach(x => r.push({ label: x.name, sub: 'Landlord · ' + x.plan + '% plan', go: () => s.go('landlords', x.id) }));
    s.tenants.filter(x => x.name.toLowerCase().includes(t)).forEach(x => r.push({ label: x.name, sub: 'Tenant · ' + x.status + ' · ' + (L.prop(x.property)?.address ?? ''), go: () => s.go('tenants', x.id) }));
    s.applicants.filter(x => !x.tenant && x.name.toLowerCase().includes(t)).forEach(x => r.push({ label: x.name, sub: 'Applicant · ' + LET_STAGES[x.stage], go: () => s.go('lettings', x.id) }));
    s.properties.filter(x => (x.address + ' ' + x.area).toLowerCase().includes(t)).forEach(x => r.push({ label: x.address, sub: (x.managed ? 'Managed' : 'Unmanaged') + ' · ' + x.area, go: () => s.go('properties', x.id) }));
    s.jobs.filter(x => x.title.toLowerCase().includes(t)).forEach(x => r.push({ label: x.title, sub: 'Job · ' + (L.prop(x.property)?.address ?? ''), go: () => s.go('jobs', x.id) }));
    s.contractors.filter(x => x.name.toLowerCase().includes(t)).forEach(x => r.push({ label: x.name, sub: 'Contractor · ' + x.trade, go: () => s.go('contractors', x.id) }));
    s.clients.filter(x => x.name.toLowerCase().includes(t)).forEach(x => r.push({ label: x.name, sub: 'Client', go: () => s.go('clients', x.id) }));
    s.enquiries.filter(x => x.name.toLowerCase().includes(t)).forEach(x => r.push({ label: x.name, sub: 'Enquiry · ' + x.stage, go: () => s.go('enquiries', x.id) }));
    return r.slice(0, 8);
  }, [q, s, L]);
  const notes = [
    ...s.leads.filter(l => !l.closed && l.nextContact && daysFrom(l.nextContact) <= 0).map(l => ({ t: 'Planned Switch follow-up due: ' + l.name, d: l.nextNote ?? '', r: 'switch' as Route, id: l.id, tone: 'warn' })),
    ...s.jobs.filter(j => j.urgent && j.status === 'New').map(j => ({ t: 'Emergency: ' + j.title, d: L.prop(j.property)?.address ?? '', r: 'jobs' as Route, id: j.id, tone: 'err' })),
    ...s.jobs.filter(j => j.status === 'Proof uploaded').map(j => ({ t: 'Photos to check: ' + j.title, d: L.prop(j.property)?.address ?? '', r: 'jobs' as Route, id: j.id, tone: 'warn' })),
    ...s.enquiries.filter(e => e.stage === 'Assigned').map(e => ({ t: `${SUPERVISOR} gave you: ${e.name}`, d: e.about, r: 'enquiries' as Route, id: e.id, tone: 'info' })),
    ...s.applicants.filter(a => a.stage === 0 && !a.rejected).map(a => ({ t: 'New applicant for you: ' + a.name, d: L.prop(a.property)?.address ?? '', r: 'lettings' as Route, id: a.id, tone: 'brand' })),
    ...s.requests.filter(x => x.status !== 'Waiting' && x.answered === '15 Oct 2026').map(x => ({ t: `${SUPERVISOR} answered: ${x.title}`, d: x.reply ?? '', r: 'requests' as Route, id: x.id, tone: 'ok' })),
    ...s.tasks.filter(t => t.late && !t.done).map(t => ({ t: 'Late task: ' + t.title, d: 'Was due ' + t.due, r: 'tasks' as Route, id: t.id, tone: 'warn' })),
  ];
  const cal = [
    ...s.inspections.filter(i => i.status !== 'Locked' && daysFrom(i.date) >= 0).map(i => ({ d: i.date, t: `${i.kind} inspection · ${i.time}`, p: L.prop(i.property)?.address ?? '', r: 'inspections' as Route, id: i.id })),
    ...s.applicants.filter(a => a.moveInAt && a.stage === 5).map(a => ({ d: a.moveInAt!.split(',')[0], t: 'Move-in · ' + a.name, p: L.prop(a.property)?.address ?? '', r: 'lettings' as Route, id: a.id })),
    ...s.safety.filter(c => c.days >= 0 && c.days < 31).map(c => ({ d: c.expires, t: c.kind + ' ends', p: L.prop(c.property)?.address ?? '', r: 'safety' as Route, id: c.id })),
  ].sort((a, b) => daysFrom(a.d) - daysFrom(b.d)).slice(0, 7);
  return (
    <header className="header">
      {back && <IBtn icon={<ArrowLeft size={18} />} onClick={back} label="Back" />}
      <div className="grow">
        {crumbs && <div className="crumbs">{crumbs.map((c, i) => <span key={i} className="flex" style={{ gap: 6 }}>{i > 0 && <ChevronRight size={12} />}{c.onClick ? <button onClick={c.onClick}>{c.label}</button> : <span>{c.label}</span>}</span>)}</div>}
        <h1 className="h1">{title}</h1>
      </div>
      <div className="searchwrap">
        <label className="search"><Search size={18} strokeWidth={1.8} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people, homes, jobs" aria-label="Search everything" /><span className="kbd">⌘K</span></label>
        {results.length > 0 && <div className="pop" style={{ left: 0, right: 'auto', width: 300 }}>{results.map((r, i) => <button key={i} className="item click" style={{ padding: '8px 10px' }} onClick={() => { setQ(''); r.go(); }}><div className="stack"><b style={{ fontSize: 12.5 }}>{r.label}</b><span className="caption">{r.sub}</span></div></button>)}</div>}
      </div>
      <div style={{ position: 'relative' }} ref={ref}>
        <div className="flex" style={{ gap: 12 }}>
          <button className="ibtn" onClick={() => setPop(p => p === 'bell' ? '' : 'bell')} aria-label="Alerts"><Bell size={20} strokeWidth={1.8} />{notes.length > 0 && <span className="dot" />}</button>
          <button className="ibtn" onClick={() => setPop(p => p === 'cal' ? '' : 'cal')} aria-label="Calendar"><CalendarDays size={20} strokeWidth={1.8} /></button>
        </div>
        {pop === 'bell' && <div className="pop"><div className="flex between" style={{ padding: '2px 4px 6px' }}><b className="h2">Alerts</b><span className="caption">{notes.length} new</span></div>
          {notes.map((n, i) => <button key={i} className="item click" style={{ padding: '8px 10px' }} onClick={() => { setPop(''); s.go(n.r, n.id); }}><span className={`tile t-${n.tone}`} style={{ width: 30, height: 30 }}><Bell size={15} /></span><div className="stack grow"><b style={{ fontSize: 12.5 }}>{n.t}</b><span className="caption">{n.d}</span></div><ArrowRight size={14} color="#98A2B3" /></button>)}
          {!notes.length && <div className="empty">You are all caught up.</div>}</div>}
        {pop === 'cal' && <div className="pop"><b className="h2" style={{ padding: '2px 4px 6px' }}>Coming up</b>
          {cal.map((c, i) => { const [dd, mm] = c.d.split(' '); return <button key={i} className="item click" style={{ padding: '8px 10px' }} onClick={() => { setPop(''); s.go(c.r, c.id); }}><span className="datetile t-info" style={{ width: 40, height: 42 }}><b style={{ fontSize: 14 }}>{dd}</b><span>{(mm || '').toUpperCase()}</span></span><div className="stack"><b style={{ fontSize: 12.5 }}>{c.t}</b><span className="caption">{c.p}</span></div></button>; })}</div>}
      </div>
      {action}
    </header>
  );
}

export const crumbsFor = (r: Route, go: (r: Route) => void, extra?: string) => {
  const c: { label: string; onClick?: () => void }[] = [{ label: GROUP[r] }, { label: LABEL[r], onClick: extra ? () => go(r) : undefined }];
  if (extra) c.push({ label: extra });
  return c;
};

export function Login({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'in' | 'code' | 'locked'>('in');
  const [email, setEmail] = useState('e.thompson@lsp.co.uk');
  const [pw, setPw] = useState('••••••••••');
  const [show, setShow] = useState(false);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [wrong, setWrong] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const verify = () => {
    if (code.join('') === '123456') return onDone();
    const w = wrong + 1; setWrong(w); setCode(['', '', '', '', '', '']); refs.current[0]?.focus();
    if (w >= 5) setStep('locked');
  };
  return (
    <div className="login">
      <aside className="login-art">
        <img src="images/logo-white.svg" alt="Landlord Service Plans" style={{ width: 250 }} />
        <h2 style={{ fontSize: 38, lineHeight: 1.18, fontWeight: 800, letterSpacing: '-.02em', marginTop: 64, maxWidth: 460 }}>Your homes and your day, <span style={{ color: '#8FD64A' }}>in one place.</span></h2>
        <p style={{ color: '#C3CDE4', fontSize: 15, lineHeight: 1.6, maxWidth: 440 }}>Enquiries, lettings, repairs, safety checks and rent for the homes the Supervisor gives you.</p>
        <div className="photo" style={{ height: 236, marginTop: 36, backgroundImage: 'url(images/home3.jpg)', boxShadow: '0 24px 48px rgba(0,0,0,.35)' }} />
        <div className="flex" style={{ gap: 24, marginTop: 'auto', color: '#DCE3F2', fontWeight: 600 }}><span className="flex"><PoundSterling size={16} color="#8FD64A" />Rent tracked</span><span className="flex"><Wrench size={16} color="#8FD64A" />Repairs approved</span><span className="flex"><ShieldCheck size={16} color="#8FD64A" />Checks on time</span></div>
      </aside>
      <main className="login-form"><div>
        {step === 'in' && <form onSubmit={e => { e.preventDefault(); setStep('code'); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0 }}>Welcome back</h1>
          <p className="small" style={{ margin: 0, fontSize: 14 }}>Office Admin portal. Sign in with your own email and password.</p>
          <label className="field"><span>Email</span><input className="input" value={email} onChange={e => setEmail(e.target.value)} type="email" /></label>
          <label className="field"><span>Password</span><div style={{ position: 'relative' }}><input className="input" value={pw} onChange={e => setPw(e.target.value)} type={show ? 'text' : 'password'} /><button type="button" onClick={() => setShow(v => !v)} aria-label="Show password" style={{ position: 'absolute', right: 10, top: 11, border: 0, background: 'none', color: '#667085' }}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          <Btn type="submit">Sign in <ArrowRight size={18} /></Btn>
          <Note>Your account is created by the Supervisor. You only see the work given to you.</Note>
          <a href="#/home" className="small" style={{ textAlign: 'center', fontWeight: 600 }}>Visit the LSP website</a>
        </form>}
        {step === 'code' && <form onSubmit={e => { e.preventDefault(); verify(); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span className="tile lg t-brand"><ShieldCheck size={22} /></span>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Enter your security code</h1>
          <p className="small" style={{ margin: 0, fontSize: 14 }}>We sent a 6-digit code to your phone ending in <b style={{ color: '#0F1828' }}>0011</b>. For this demo, use <b style={{ color: '#0F1828' }}>123456</b>.</p>
          <div className="otp">{code.map((c, i) => <input key={i} ref={el => { refs.current[i] = el; }} inputMode="numeric" maxLength={1} value={c} aria-label={`Digit ${i + 1}`} autoFocus={i === 0}
            onChange={e => { const v = e.target.value.replace(/\D/g, ''); const n = [...code]; n[i] = v; setCode(n); if (v && i < 5) refs.current[i + 1]?.focus(); }}
            onKeyDown={e => { if (e.key === 'Backspace' && !code[i] && i > 0) refs.current[i - 1]?.focus(); }} />)}</div>
          {wrong > 0 && <Note tone="err">That code is not right. {5 - wrong} {5 - wrong === 1 ? 'try' : 'tries'} left before the account locks.</Note>}
          <Btn type="submit" disabled={code.join('').length < 6}>Verify and continue</Btn>
          <button type="button" className="btn ghost" onClick={() => setStep('in')}>Back to sign in</button>
        </form>}
        {step === 'locked' && <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span className="tile lg t-err"><ShieldAlert size={22} /></span>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Your account is locked</h1>
          <p className="small" style={{ margin: 0, fontSize: 14 }}>There were too many wrong security codes, so the account is locked to keep it safe. The Supervisor can unlock it.</p>
          <Btn onClick={() => { setStep('in'); setWrong(0); }}>Back to sign in</Btn>
        </div>}
      </div></main>
    </div>
  );
}
