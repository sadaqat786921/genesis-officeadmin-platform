import { useState } from 'react';
import { PoundSterling, AlertTriangle, Bell, Receipt, Landmark, ArrowRight, FileText, CheckCircle2, PauseCircle, Send, Wallet, Mail } from 'lucide-react';
import { useStore, useLookups, money, rentStatus, type Lookups } from '../store';
import { daysFrom, nowStamp, SUPERVISOR, type Landlord } from '../data';
import { ME_NAME } from '../data';
import { ActionCard, Avatar, Btn, Card, Chip, DetailHead, Drawer, KV, Kpi, Modal, Note, Stat, Tabs, Timeline, Empty, MiniSearch } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { PaymentModal, adminName, HomeCard } from './shared';
import { InvoiceTable } from './tables';
import { rentLedger } from './Tenants';

type S = ReturnType<typeof useStore>;
const PAY_DATE = '20 Oct 2026';

export function payoutFor(s: S, l: Landlord) {
  const props = s.properties.filter(p => p.managed && p.owner === l.id);
  const tenants = s.tenants.filter(t => props.some(p => p.id === t.property));
  const rows = s.rent.filter(r => tenants.some(t => t.id === r.tenant));
  const due = rows.reduce((a, r) => a + r.amount, 0), collected = rows.reduce((a, r) => a + r.paid, 0);
  const fee = Math.round(collected * l.plan / 100);
  const bills = s.invoices.filter(i => i.toKind === 'Landlord' && i.to === l.id && i.paid < i.amount);
  const repairs = bills.reduce((a, i) => a + i.amount - i.paid, 0);
  return { props, tenants, rows, due, collected, fee, repairs, bills, pay: Math.max(0, collected - fee - repairs), status: s.payouts[l.id] ?? 'Scheduled' };
}

export function sendRentReminder(s: S, L: Lookups, rowId: string) {
  const r = s.rent.find(x => x.id === rowId)!; const t = L.tenant(r.tenant); const owed = r.amount - r.paid;
  s.setRent(rs => rs.map(x => x.id === rowId ? { ...x, reminders: [{ at: nowStamp(), by: ME_NAME }, ...x.reminders] } : x));
  s.setTenants(ts => ts.map(x => x.id === r.tenant ? { ...x, comms: [...x.comms, { id: 'cm' + Date.now(), at: nowStamp(), by: ME_NAME, channel: 'Email', dir: 'out', subject: 'Rent reminder', text: `${money(owed)} rent is ${daysFrom(r.due) < 0 ? 'late' : 'due'}. Please pay as soon as you can.` }] } : x));
  s.log(`Sent rent reminder to ${t?.name} (${money(owed)})`, 'Rent & Invoices'); s.toast(`Reminder sent to ${t?.name} from Outlook`);
}

export function Rent() {
  const s = useStore();
  if (s.detail && s.rent.some(r => r.id === s.detail)) return <RentAccount id={s.detail} />;
  return <RentHome />;
}

function RentHome() {
  const s = useStore(); const L = useLookups();
  const [tab, setTab] = useState<'rent' | 'payouts' | 'invoices'>('rent'); const [f, setF] = useState<'all' | 'late' | 'part' | 'due' | 'paid'>('all'); const [q, setQ] = useState('');
  const [pay, setPay] = useState<string | null>(null); const [stmt, setStmt] = useState<string | null>(null); const [bulk, setBulk] = useState(false);
  const R = s.rent;
  const rows = R.filter(r => { const st = rentStatus(r); const t = L.tenant(r.tenant); return (f === 'all' || (f === 'late' ? st.tone === 'err' : f === 'part' ? st.label.startsWith('Part') : f === 'paid' ? st.label === 'Paid' : ['info', 'neutral'].includes(st.tone))) && (t?.name ?? '').toLowerCase().includes(q.toLowerCase()); });
  const late = R.filter(r => rentStatus(r).tone === 'err');
  const lls = s.landlords.map(l => ({ l, p: payoutFor(s, l) })).filter(x => x.p.rows.length);
  const toPay = lls.filter(x => x.p.status !== 'Paid').reduce((a, x) => a + x.p.pay, 0);
  const invs = s.invoices;
  return <>
    <PageHeader crumbs={crumbsFor('rent', s.go)} title="Rent & Invoices" />
    <div className="grid g4">
      <Kpi icon={<PoundSterling size={18} />} tone="ok" label="Collected in October" value={money(R.reduce((a, r) => a + r.paid, 0))} caption={`of ${money(R.reduce((a, r) => a + r.amount, 0))} due · ${Math.round(R.reduce((a, r) => a + r.paid, 0) / R.reduce((a, r) => a + r.amount, 0) * 100)}%`} onClick={() => { setTab('rent'); setF('paid'); }} />
      <Kpi icon={<AlertTriangle size={18} />} tone="err" label="Late rent" value={late.length} caption={money(late.reduce((a, r) => a + r.amount - r.paid, 0)) + ' owed'} active={tab === 'rent' && f === 'late'} onClick={() => { setTab('rent'); setF('late'); }} />
      <Kpi icon={<Landmark size={18} />} tone="brand" label="To pay landlords" value={money(toPay)} caption={`on ${PAY_DATE}`} active={tab === 'payouts'} onClick={() => setTab('payouts')} />
      <Kpi icon={<Receipt size={18} />} tone="info" label="Unpaid invoices" value={invs.filter(i => i.paid < i.amount).length} caption={`${invs.filter(i => i.overdue).length} overdue`} active={tab === 'invoices'} onClick={() => setTab('invoices')} />
    </div>
    <Tabs value={tab} onChange={setTab} items={[{ id: 'rent', label: 'Tenant rent', count: R.length }, { id: 'payouts', label: 'Landlord payouts', count: lls.length }, { id: 'invoices', label: 'Invoices', count: invs.length }]} />
    {tab === 'rent' && <Card title="Rent this month" sub="Staff check the bank and record what arrived. Click a tenant for their full rent account. Part payments carry forward."
      action={<div className="toolbar"><MiniSearch value={q} onChange={setQ} placeholder="Search tenant" />{late.length > 0 && <Btn sm kind="outline" icon={<Bell size={14} />} onClick={() => setBulk(true)}>Remind all late ({late.length})</Btn>}</div>}>
      <Tabs value={f} onChange={setF} items={[{ id: 'all', label: 'All' }, { id: 'late', label: 'Late', count: late.length }, { id: 'part', label: 'Part-paid' }, { id: 'due', label: 'Due soon' }, { id: 'paid', label: 'Paid' }]} />
      <div className="tablewrap"><table className="t"><thead><tr><th>Tenant</th><th>Home</th><th>Due</th><th>Rent</th><th>Paid</th><th>Owed</th><th>Status</th><th>Reminders</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead><tbody>
        {rows.map(r => { const t = L.tenant(r.tenant); const st = rentStatus(r); const left = r.amount - r.paid; return <tr key={r.id} onClick={() => s.go('rent', r.id)}>
          <td><span className="cell"><Avatar name={t?.name} /><b className="strong">{t?.name}</b></span></td><td>{L.prop(t?.property)?.address}{t?.room && <div className="caption">{t.room}</div>}</td><td>{r.due.replace(' 2026', '')}</td><td>{money(r.amount)}</td><td>{money(r.paid)}</td>
          <td>{left > 0 ? <b style={{ color: st.tone === 'err' ? 'var(--err)' : undefined }}>{money(left)}</b> : '—'}</td><td><Chip tone={st.tone}>{st.label}</Chip></td>
          <td>{r.reminders.length ? <span className="stack"><b className="small" style={{ color: 'var(--text-primary)' }}>{r.reminders.length} sent</b><span className="caption">last {r.reminders[0].at.replace(' 2026', '')}</span></span> : <span className="muted">None</span>}</td>
          <td onClick={e => e.stopPropagation()}>{left > 0 && <div className="flex" style={{ justifyContent: 'flex-end' }}><Btn sm kind="ghost" icon={<Bell size={14} />} onClick={() => sendRentReminder(s, L, r.id)}>Remind</Btn><Btn sm onClick={() => setPay(r.id)}>Record</Btn></div>}</td></tr>; })}
      </tbody></table>{!rows.length && <Empty>Nothing here.</Empty>}</div></Card>}
    {tab === 'payouts' && <Card title="Landlord payouts" sub={`Rent collected, minus the LSP fee and unpaid repair invoices. ${SUPERVISOR} pays landlords on ${PAY_DATE}. You can send the statement.`}>
      <div className="tablewrap"><table className="t"><thead><tr><th>Landlord</th><th>Homes</th><th>Rent collected</th><th>LSP fee</th><th>Repairs taken off</th><th>To pay</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead><tbody>
        {lls.map(({ l, p }) => <tr key={l.id} onClick={() => setStmt(l.id)}>
          <td><span className="cell"><Avatar name={l.name} /><span className="stack"><b className="strong">{l.name}</b><span className="caption">{l.bank}</span></span></span></td><td>{p.props.length}</td>
          <td>{money(p.collected)}<div className="caption">of {money(p.due)} due</div></td><td>{money(p.fee)}<div className="caption">{l.plan}%</div></td><td>{p.repairs ? money(p.repairs) : '—'}</td><td><b style={{ fontSize: 14 }}>{money(p.pay)}</b></td>
          <td><Chip tone={p.status === 'Paid' ? 'ok' : p.status === 'On hold' ? 'warn' : 'info'}>{p.status === 'Scheduled' ? 'Due ' + PAY_DATE.replace(' 2026', '') : p.status}</Chip></td>
          <td onClick={e => e.stopPropagation()}><div className="flex" style={{ justifyContent: 'flex-end' }}><Btn sm kind="ghost" icon={<Send size={14} />} onClick={() => { s.log(`Sent October statement to ${l.name}`, 'Rent & Invoices'); s.toast(`Statement sent to ${l.email}`); }}>Statement</Btn></div></td></tr>)}
      </tbody></table></div></Card>}
    {tab === 'invoices' && <Card title="Invoices" sub="Landlord invoices are due straight away. Client invoices use the client's own terms. Click one to see what it's for."><InvoiceTable list={invs} /></Card>}
    {pay && <RecordPay rowId={pay} onClose={() => setPay(null)} />}
    {stmt && <Statement id={stmt} onClose={() => setStmt(null)} />}
    {bulk && <Modal title={`Send reminders to ${late.length} tenants?`} sub="Each tenant gets an email from Outlook. It is saved in their communication." onClose={() => setBulk(false)} footer={<><Btn kind="outline" onClick={() => setBulk(false)}>Cancel</Btn><Btn icon={<Bell size={16} />} onClick={() => { late.forEach(r => sendRentReminder(s, L, r.id)); setBulk(false); }}>Send reminders</Btn></>}>
      <div className="divlist">{late.map(r => <div key={r.id} className="item"><Avatar name={L.tenant(r.tenant)?.name} /><b className="grow">{L.tenant(r.tenant)?.name}</b><b>{money(r.amount - r.paid)}</b></div>)}</div></Modal>}
  </>;
}

function RecordPay({ rowId, onClose }: { rowId: string; onClose: () => void }) {
  const s = useStore(); const L = useLookups(); const r = s.rent.find(x => x.id === rowId)!; const t = L.tenant(r.tenant);
  return <PaymentModal title={`Record rent from ${t?.name}`} owed={r.amount - r.paid} onClose={onClose} onSave={(a, d, n) => {
    s.setRent(rs => rs.map(x => x.id === rowId ? { ...x, paid: Math.min(x.amount, x.paid + a), history: [...x.history, { date: d, amount: a, note: n }] } : x));
    const left = r.amount - r.paid - a; s.log(`Recorded ${money(a)} rent from ${t?.name}${left > 0 ? `. ${money(left)} still owed` : ''}`, 'Rent & Invoices');
    s.toast(left > 0 ? `${money(a)} saved. ${money(left)} carries forward, reminder sent.` : `${money(a)} saved. Paid in full.`); onClose();
  }} />;
}

function Statement({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useStore(); const L = useLookups(); const l = s.landlords.find(x => x.id === id)!; const p = payoutFor(s, l);
  return <Drawer title={`October statement · ${l.name}`} sub={`${l.plan}% plan · paid to ${l.bank}`} onClose={onClose} footer={<><Btn kind="outline" icon={<Send size={16} />} onClick={() => { s.toast(`Statement sent to ${l.email}`); s.log(`Sent October statement to ${l.name}`, 'Rent & Invoices'); }}>Email statement</Btn></>}>
    <Card className="flat" title="Rent in"><div className="divlist">{p.rows.map(r => { const t = L.tenant(r.tenant); return <div key={r.id} className="item"><div className="stack grow"><b>{t?.name}</b><span className="caption">{L.prop(t?.property)?.address}{t?.room ? ' · ' + t.room : ''}</span></div><span className="caption">{money(r.paid)} of {money(r.amount)}</span><Chip tone={rentStatus(r).tone}>{rentStatus(r).label}</Chip></div>; })}</div></Card>
    <Card className="flat"><KV rows={[['Rent collected', money(p.collected)], [`LSP fee (${l.plan}%)`, '− ' + money(p.fee)], ['Unpaid repair invoices', p.repairs ? '− ' + money(p.repairs) : '—'], ['To pay landlord', <b style={{ fontSize: 16 }}>{money(p.pay)}</b>], ['Pay date', PAY_DATE]]} /></Card>
    {p.bills.length > 0 && <Note>Taken off: {p.bills.map(b => `${b.id} (${money(b.amount - b.paid)})`).join(', ')}.</Note>}
    {p.status === 'On hold' && <Note tone="warn">On hold. Rent from a tenant is still late, so the payout waits.</Note>}
  </Drawer>;
}

/* ================= RENT ACCOUNT (one tenant) ================= */
function RentAccount({ id }: { id: string }) {
  const s = useStore(); const L = useLookups(); const r = s.rent.find(x => x.id === id)!; const t = L.tenant(r.tenant)!; const p = L.prop(t.property); const ll = L.landlord(p?.owner);
  const [pay, setPay] = useState(false);
  const st = rentStatus(r); const owed = r.amount - r.paid;
  return <>
    <PageHeader crumbs={crumbsFor('rent', s.go, t.name)} back={() => s.go('rent')} title={`Rent · ${t.name}`}
      action={owed > 0 && <div className="flex"><Btn kind="outline" icon={<Bell size={16} />} onClick={() => sendRentReminder(s, L, id)}>Send reminder</Btn><Btn icon={<PoundSterling size={16} />} onClick={() => setPay(true)}>Record payment</Btn></div>} />
    <DetailHead media={<Avatar name={t.name} size="xl" />} title={t.name} chips={<><Chip tone={st.tone}>{st.label}</Chip><Chip tone="neutral" dot={false}>{t.status} tenant</Chip></>}
      meta={[['Home', `${p?.address}${t.room ? ' · ' + t.room : ''}`], ['Rent', `${money(t.rent)} on day ${t.rentDay}`], ['Landlord', ll?.name ?? '—'], ['Office Admin', adminName(p?.admin)]]} />
    <div className="grid g4"><Stat label="Due this month" value={money(r.amount)} sub={'on ' + r.due} /><Stat label="Paid" value={money(r.paid)} tone={r.paid >= r.amount ? 'ok' : undefined} /><Stat label="Owed" value={money(owed)} tone={owed ? 'err' : 'ok'} sub={owed ? 'carries forward' : 'nothing owed'} /><Stat label="Reminders" value={r.reminders.length} sub={r.reminders[0] ? 'last ' + r.reminders[0].at : 'none sent'} /></div>
    <div className="dgrid">
      <div className="col">
        <Card title="Rent history"><div className="tablewrap"><table className="t"><thead><tr><th>Month</th><th>Due</th><th>Rent</th><th>Paid</th><th>Paid on</th><th>Status</th></tr></thead><tbody>
          {rentLedger(t, r).map(x => <tr key={x.month} style={{ cursor: 'default' }}><td className="strong">{x.month}</td><td>{x.due}</td><td>{money(x.amount)}</td><td>{money(x.paid)}</td><td>{x.on}</td><td><Chip tone={x.tone}>{x.label}</Chip></td></tr>)}
        </tbody></table></div></Card>
        <Card title="Payments this month">{r.history.length ? <div className="divlist">{r.history.map((h, i) => <div key={i} className="item"><CheckCircle2 size={16} color="var(--ok)" /><b className="grow">{money(h.amount)}</b><span className="caption">{h.date} · {h.note}</span></div>)}</div> : <Empty icon={<Wallet size={22} />}>Nothing paid yet.</Empty>}</Card>
        <Card title="Reminders sent">{r.reminders.length ? <Timeline items={r.reminders.map(x => ({ at: x.at, text: x.by === 'System' ? 'Automatic reminder email' : 'Reminder sent by ' + x.by }))} /> : <span className="caption">No reminders this month.</span>}</Card>
      </div>
      <div className="col">
        {owed > 0 ? <ActionCard tone="warn" text={`${money(owed)} is ${st.tone === 'err' ? 'late' : 'due'}. Send a reminder, or record what arrived in the bank.`}><Btn block icon={<PoundSterling size={16} />} onClick={() => setPay(true)}>Record payment</Btn><Btn block kind="outline" icon={<Bell size={16} />} onClick={() => sendRentReminder(s, L, id)}>Send reminder</Btn><Btn block kind="ghost" icon={<Mail size={16} />} onClick={() => s.go('tenants', t.id)}>Message tenant</Btn></ActionCard>
          : <ActionCard tone="ok" title="Paid" text="This month is paid in full." />}
        <Card title="Tenant"><div className="flex"><Avatar name={t.name} size="md" /><div className="stack grow"><b>{t.name}</b><span className="caption">{t.phone}</span></div></div><Btn kind="outline" icon={<ArrowRight size={16} />} onClick={() => s.go('tenants', t.id)}>Open tenant profile</Btn></Card>
        <HomeCard id={t.property} />
        <Card title="Paid out to"><KV rows={[['Landlord', ll?.name ?? '—'], ['Bank', ll?.bank ?? '—'], ['Payout', PAY_DATE]]} /><Btn kind="ghost" icon={<FileText size={16} />} onClick={() => s.go('rent')}>Landlord payouts</Btn></Card>
      </div>
    </div>
    {pay && <RecordPay rowId={id} onClose={() => setPay(false)} />}
  </>;
}
