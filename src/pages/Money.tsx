import { useState } from 'react';
import { Landmark, FileText, Download, Upload, CalendarClock, Pencil, Percent, Lock, History as HistoryIcon, Check, Building2, Wallet } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { PLAN, ME_NAME, daysFrom, nowStamp, parseDate, type Landlord, type LeasePay, type Property, type Plan } from '../data';
import { feeOf, pctText, vatActive, isLeased, LSP_NAME, MAINT_SHARE, type VatSetting } from '../pricing';
import { Bar, Btn, Card, Chip, Empty, Field, KV, Modal, Note, Stat, Text, Timeline, FilterBar, applyFlt, useFlt, dateLabel } from '../ui';
import { PageHeader } from '../Shell';
import { PaymentModal } from './shared';

/* Fees, VAT, maintenance budgets and homes leased by LSP. Same file in both portals. */

type S = ReturnType<typeof useStore>;
const toInput = (v: string) => { const d = parseDate(v); return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------------- price display ---------------- */
/** "16% · 19.2% incl. VAT" when VAT is on, "16%" when it is off. */
export function planPriceText(plan: Plan, v: VatSetting) { const f = feeOf(1000, plan, v); return f.on ? `${plan}% + VAT · ${pctText(f.incl)} incl. VAT` : `${plan}% of rent`; }
export function PlanPrice({ plan, rent }: { plan: Plan; rent?: number }) {
  const s = useStore(); const f = feeOf(rent ?? 0, plan, s.vat);
  return <span className="stack" style={{ gap: 2 }}>
    <b>{f.on ? `${pctText(f.incl)} of rent, including VAT` : `${plan}% of rent`}</b>
    <span className="caption">{f.on ? `Fee ${plan}%${rent ? ` (${money(f.net)})` : ''} + VAT ${f.rate}%${rent ? ` (${money(f.vat)})` : ''}` : 'No VAT charged · LSP is not VAT registered'}</span>
  </span>;
}
export const vatBadge = (v: VatSetting) => vatActive(v) ? <Chip tone="info" dot={false}>VAT {v.rate}% on</Chip> : <Chip tone="neutral" dot={false}>VAT off</Chip>;

/* ---------------- property: fee and budget ---------------- */
export function FeeCard({ p }: { p: Property }) {
  const s = useStore(); const L = useLookups();
  if (isLeased(p)) return <LeaseMoneyCard p={p} />;
  const ll = L.landlord(p.owner); if (!ll) return null;
  const f = feeOf(p.rent, ll.plan, s.vat);
  return <Card title="Fee and budget" sub="LSP's monthly fee for this home. The maintenance budget comes out of the fee before VAT." action={vatBadge(s.vat)}>
    <div className="feebox">
      <div><span>Monthly rent</span><b>{money(p.rent)}</b></div>
      <div><span>LSP fee · {ll.plan}%</span><b>{money(f.net)}</b></div>
      <div className={f.on ? 'vat' : 'muted2'}><span>VAT · {f.on ? `${f.rate}%` : 'not charged'}</span><b>{f.on ? money(f.vat) : money(0)}</b></div>
      <div className="tot"><span>Landlord pays LSP</span><b>{money(f.total)}<em>{f.on ? ` · ${pctText(f.incl)} incl. VAT` : ''}</em></b></div>
    </div>
    <div className="feesplit"><div style={{ flex: MAINT_SHARE }} className="fs-a">{f.maintMonth ? `Maintenance ${money(f.maintMonth)}` : 'No repairs on Management Only'}</div><div style={{ flex: 100 - MAINT_SHARE }} className="fs-b">LSP keeps {money(f.remaining)}</div></div>
    <span className="caption">Maintenance budget: {MAINT_SHARE}% of the fee before VAT = {money(f.maintMonth)} a month, {money(f.maintYear)} a year. Staff only. Never charged to the landlord.</span>
  </Card>;
}

/** Where the yearly maintenance budget number comes from. */
export function budgetSource(s: S, p: Property, ll?: Landlord) {
  if (isLeased(p)) return `Set by staff for this lease · ${p.lease?.budgetFrom} to ${p.lease?.budgetTo}`;
  if (!ll) return '';
  const f = feeOf(p.rent, ll.plan, s.vat);
  return ll.plan === 10 ? 'Management Only plan · no repairs included' : `${MAINT_SHARE}% of the LSP fee (${money(f.net)} before VAT) = ${money(f.maintMonth)} a month × 12`;
}

export function EditBudget({ p, onClose }: { p: Property; onClose: () => void }) {
  const s = useStore(); const ls = p.lease!;
  const [f, setF] = useState({ budget: String(p.budget), from: toInput(ls.budgetFrom), to: toInput(ls.budgetTo), why: 'Agreed with the owner for the lease year' });
  return <Modal title="Maintenance budget for this lease" sub="Leased homes have no LSP fee, so staff set the budget. The change is saved with who, when and why." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Check size={16} />} disabled={!(+f.budget >= 0) || !f.from || !f.to} onClick={() => {
      s.setProperties(ps => ps.map(x => x.id === p.id ? { ...x, budget: +f.budget, lease: { ...x.lease!, budget: +f.budget, budgetFrom: dateLabel(f.from), budgetTo: dateLabel(f.to) } } : x));
      s.log(`Set maintenance budget for ${p.address} to ${money(+f.budget)} (${dateLabel(f.from)} to ${dateLabel(f.to)}): ${f.why}`, 'Properties'); s.toast('Maintenance budget saved'); onClose();
    }}>Save budget</Btn></>}>
    <div className="grid g3"><Field label="Budget (£)"><Text value={f.budget} onChange={v => setF({ ...f, budget: v })} /></Field><Field label="From"><input className="input" type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></Field><Field label="To"><input className="input" type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></Field></div>
    <Field label="Reason"><Text value={f.why} onChange={v => setF({ ...f, why: v })} /></Field>
    <Note>Already spent: {money(p.used)}. When the budget runs out, repairs go to the Supervisor to review. They are never charged to the owner automatically.</Note>
  </Modal>;
}

/* ---------------- landlord: agreed maintenance allowance ---------------- */
export function AllowanceCard({ l }: { l: Landlord }) {
  const s = useStore(); const [edit, setEdit] = useState(false); const [v, setV] = useState(String(l.allowance ?? ''));
  const homes = s.properties.filter(p => p.managed && p.owner === l.id && !isLeased(p)).map(p => p.id);
  const used = s.jobs.filter(j => homes.includes(j.property) && ['Approved', 'Invoiced'].includes(j.status)).reduce((a, j) => a + j.price, 0);
  const a = l.allowance ?? 0; const pct = a ? Math.min(100, Math.round(used / a * 100)) : 0;
  return <Card title="Maintenance allowance" sub="The yearly amount of eligible work promised in the agreement. The landlord can see this. It is separate from LSP's internal budget." action={<Btn sm kind="ghost" icon={<Pencil size={14} />} onClick={() => setEdit(true)}>{a ? 'Edit' : 'Add'}</Btn>}>
    {a ? <><div className="flex between"><span className="metric">{money(a - used > 0 ? a - used : 0)}</span><span className="small">left of {money(a)} a year</span></div><Bar value={pct} tone={pct >= 90 ? 'err' : pct >= 70 ? 'warn' : 'brand'} /><KV rows={[['Agreed in the agreement', money(a) + ' a year'], ['Used on eligible work', money(used)], ['Remaining', money(Math.max(0, a - used))]]} /></>
      : <Note>No allowance recorded yet. Add the yearly amount from the signed agreement.</Note>}
    {edit && <Modal title="Agreed maintenance allowance" sub={`From ${l.name}'s signed agreement. Changing VAT or LSP's budget never changes it.`} onClose={() => setEdit(false)} footer={<><Btn kind="outline" onClick={() => setEdit(false)}>Cancel</Btn><Btn disabled={!(+v > 0)} onClick={() => { s.setLandlords(ls => ls.map(x => x.id === l.id ? { ...x, allowance: +v } : x)); s.log(`Set maintenance allowance for ${l.name} to ${money(+v)} a year`, 'Landlords'); s.toast('Allowance saved'); setEdit(false); }}>Save</Btn></>}>
      <Field label="Yearly allowance (£)"><Text value={v} onChange={setV} placeholder="600" /></Field>
    </Modal>}
  </Card>;
}

/* ---------------- leased by LSP ---------------- */
export function leaseState(x: LeasePay) {
  const left = x.amount - x.paid; const d = daysFrom(x.due);
  if (left <= 0) return { label: 'Paid', tone: 'ok' as const };
  if (x.paid > 0) return d < 0 ? { label: `Part-paid · ${money(left)} late`, tone: 'err' as const } : { label: 'Part-paid', tone: 'warn' as const };
  if (d < 0) return { label: `Late · ${-d} days`, tone: 'err' as const };
  return { label: d === 0 ? 'Due today' : 'Due ' + x.due.replace(' 2026', ''), tone: d <= 7 ? 'warn' as const : 'neutral' as const };
}
export function payOwner(s: S, x: LeasePay, a: number, date: string, ref: string, address: string) {
  s.setLeasePays(ls => ls.map(y => y.id === x.id ? { ...y, paid: Math.min(y.amount, y.paid + a), history: [...y.history, { date, amount: a, ref }] } : y));
  const left = x.amount - x.paid - a;
  s.log(`Recorded lease payment of ${money(a)} to the owner of ${address} for ${x.month}${left > 0 ? `. ${money(left)} still owed` : ''}`, 'Rent & Invoices');
  s.toast(left > 0 ? `${money(a)} saved. ${money(left)} still owed to the owner.` : `${money(a)} saved. ${x.month} paid in full.`);
}

function LeaseMoneyCard({ p }: { p: Property }) {
  const s = useStore(); const ls = p.lease!;
  const occ = s.tenants.filter(t => t.property === p.id && t.status !== 'Moved out').reduce((a, t) => a + t.rent, 0) || p.rent;
  const maint = Math.round(ls.budget / 12);
  return <Card title="Rent and lease" sub="Leased by LSP. No management fee applies. LSP collects the occupiers' rent and pays the owner the lease rent.">
    <div className="feebox">
      <div><span>Occupier rent to LSP</span><b>{money(occ)}</b></div>
      <div><span>Lease rent to the owner</span><b>− {money(ls.rent)}</b></div>
      <div className="muted2"><span>Management fee</span><b>Not applicable · leased by LSP</b></div>
      <div className="tot"><span>Left before maintenance and other costs</span><b>{money(occ - ls.rent)}</b></div>
    </div>
    <span className="caption">Maintenance budget set for this lease: {money(ls.budget)} a year (about {money(maint)} a month). Figures use amounts due, not payments.</span>
  </Card>;
}

export function LeaseFromCard({ p }: { p: Property }) {
  const s = useStore(); const L = useLookups(); const o = L.landlord(p.owner); const ls = p.lease!;
  return <Card title="Lease From · Property owner" sub={`${LSP_NAME} is the landlord to the occupiers. The owner keeps the property and is paid the lease rent.`}>
    <div className="flex"><span className="tile t-brand"><Building2 size={18} /></span><div className="stack grow"><b>{o?.name}</b><span className="caption">{o?.email} · {o?.phone}</span></div><Btn sm kind="ghost" onClick={() => s.go('landlords', p.owner)}>Open owner</Btn></div>
    <KV rows={[['Lease rent', `${money(ls.rent)} ${ls.frequency.toLowerCase()}, due on day ${ls.dueDay}`], ['Paid to', ls.payTo], ['Lease', `${ls.start} to ${ls.end}`]]} />
  </Card>;
}

export function LeaseTab({ p }: { p: Property }) {
  const s = useStore(); const ls = p.lease!; const [pay, setPay] = useState<string | null>(null); const [up, setUp] = useState(false);
  const rows = s.leasePays.filter(x => x.property === p.id);
  const owed = rows.reduce((a, x) => a + x.amount - x.paid, 0);
  const x = pay ? rows.find(r => r.id === pay) : undefined;
  return <>
    <div className="grid g4">
      <Stat label="Lease rent" value={money(ls.rent)} sub={`${ls.frequency} · day ${ls.dueDay}`} />
      <Stat label="Owed to the owner" value={money(owed)} tone={owed ? 'warn' : 'ok'} sub={owed ? 'paid by LSP, not by the tenant' : 'all paid'} />
      <Stat label="Lease ends" value={ls.end} sub={`Break ${ls.breakDate}`} />
      <Stat label="Maintenance budget" value={money(ls.budget)} sub={`${ls.budgetFrom} to ${ls.budgetTo}`} />
    </div>
    <div className="dgrid">
      <div className="col">
        <Card title="Payments to the owner" sub="LSP pays this whether the home is let or empty, and whether the tenant has paid. Recording a payment here does not move money.">
          <OwnerPayTable list={rows} onPay={setPay} hideHome />
        </Card>
        <Card title="Lease terms"><KV rows={[['Lease reference', ls.ref], ['Start and end', `${ls.start} to ${ls.end}`], ['Rent review', ls.review], ['Break date', ls.breakDate], ['Notice', ls.notice], ['Permitted use', ls.use], ['Subletting', ls.sublet], ['First payment', ls.firstDue]]} /></Card>
      </div>
      <div className="col">
        <LeaseFromCard p={p} />
        <Card title="Who is responsible"><KV rows={[['Owner', ls.ownerDoes], [LSP_NAME, ls.lspDoes]]} /><span className="caption">Repairs LSP covers use the normal approval flow and this lease's budget. Owner repairs go to the owner to approve.</span></Card>
        <Card title="Lease documents" action={<Btn sm kind="ghost" icon={<Upload size={14} />} onClick={() => setUp(true)}>Replace</Btn>}>
          {ls.doc ? <div className="item"><span className="tile t-brand"><FileText size={16} /></span><div className="stack grow"><b>{ls.doc}</b><span className="caption">Signed lease · added {ls.activated}</span></div><Btn sm kind="ghost" icon={<Download size={14} />} onClick={() => s.toast('Lease downloaded')}>PDF</Btn></div> : <Note tone="warn">No signed lease uploaded yet.</Note>}
        </Card>
        <Card title="History"><Timeline items={[{ at: ls.activated, text: `Leased by LSP from ${ls.start}`, by: ls.by }, ...rows.flatMap(r => r.history.map(h => ({ at: h.date, text: `Paid ${money(h.amount)} to the owner for ${r.month} · ${h.ref}` })))].sort((a, b) => parseDate(b.at).getTime() - parseDate(a.at).getTime())} /></Card>
      </div>
    </div>
    {x && <PaymentModal title={`Record payment to the owner · ${x.month}`} owed={x.amount - x.paid} onClose={() => setPay(null)} onSave={(a, d, n) => { payOwner(s, x, a, d, n, p.address); setPay(null); }} />}
    {up && <Modal title="Replace the signed lease" sub="The earlier file is kept in the history." onClose={() => setUp(false)} footer={<><Btn kind="outline" onClick={() => setUp(false)}>Cancel</Btn><Btn icon={<Upload size={16} />} onClick={() => { s.setProperties(ps => ps.map(y => y.id === p.id ? { ...y, lease: { ...y.lease!, doc: 'lease-' + p.address.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-v2.pdf' } } : y)); s.log(`Replaced the signed lease for ${p.address}`, 'Properties'); s.toast('Lease replaced. The earlier file is kept.'); setUp(false); }}>Upload</Btn></>}><button type="button" className="dropzone"><Upload size={20} /><b>Choose the signed lease (PDF)</b></button></Modal>}
  </>;
}

export function OwnerPayTable({ list: all, onPay, hideHome }: { list: LeasePay[]; onPay: (id: string) => void; hideHome?: boolean }) {
  const s = useStore(); const L = useLookups(); const [f, setF] = useFlt();
  const list = applyFlt(all, f, { text: x => `${x.month} ${L.prop(x.property)?.address ?? ''} ${L.landlord(L.prop(x.property)?.owner)?.name ?? ''}`, type: x => leaseState(x).label.split(' ·')[0].replace(/ \d.*$/, ''), date: x => x.due });
  return <>{all.length > 2 && <FilterBar f={f} set={setF} placeholder="Search month, home or owner" types={[...new Set(all.map(x => leaseState(x).label.split(' ·')[0].replace(/ \d.*$/, '')))]} typeLabel="Any status" shown={list.length} total={all.length} />}
    <div className="tablewrap"><table className="t"><thead><tr><th>Month</th>{!hideHome && <th>Home · owner</th>}<th>Due</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Paid on · ref</th><th>Status</th><th /></tr></thead><tbody>
      {list.map(x => { const st = leaseState(x); const p = L.prop(x.property); const left = x.amount - x.paid; const last = x.history[x.history.length - 1]; return <tr key={x.id} onClick={() => hideHome ? undefined : s.go('properties', x.property)} className={hideHome ? 'static' : ''}>
        <td><span className="cell"><span className="tile t-brand" style={{ width: 32, height: 32 }}><Landmark size={15} /></span><b className="strong">{x.month}</b></span></td>
        {!hideHome && <td>{p?.address}<div className="caption">{L.landlord(p?.owner)?.name}</div></td>}
        <td>{x.due}</td><td>{money(x.amount)}</td><td>{money(x.paid)}</td><td>{left > 0 ? <b>{money(left)}</b> : '—'}</td>
        <td>{last ? <span className="stack"><b className="small" style={{ color: 'var(--text-primary)' }}>{last.date}</b><span className="caption">{last.ref}</span></span> : <span className="muted">—</span>}</td>
        <td><Chip tone={st.tone}>{st.label}</Chip></td>
        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>{left > 0 && <Btn sm onClick={() => onPay(x.id)}>Record</Btn>}</td></tr>; })}
    </tbody></table>{!list.length && <Empty icon={<Landmark size={22} />}>No lease payments here.</Empty>}</div></>;
}

/** Rent & Invoices tab: everything LSP pays to owners of leased homes. */
export function OwnerPayments() {
  const s = useStore(); const L = useLookups(); const [pay, setPay] = useState<string | null>(null);
  const x = pay ? s.leasePays.find(r => r.id === pay) : undefined;
  return <Card title="Owner lease payments" sub="Lease rent LSP pays to owners of homes leased by LSP. Separate from tenant rent: an empty home or late tenant rent does not change it.">
    <OwnerPayTable list={s.leasePays} onPay={setPay} />
    {x && <PaymentModal title={`Record payment to the owner · ${x.month}`} owed={x.amount - x.paid} onClose={() => setPay(null)} onSave={(a, d, n) => { payOwner(s, x, a, d, n, L.prop(x.property)?.address ?? ''); setPay(null); }} />}
  </Card>;
}

/* ---------------- Admin settings: VAT on LSP fees ---------------- */
export function VatSettings() {
  const s = useStore(); const v = s.vat;
  const [f, setF] = useState({ status: v.status === 'On' ? 'On' : 'Off', number: v.number || '', rate: String(v.rate), from: toInput(v.from === '1 Jan 2026' ? '1 Jan 2027' : v.from), reason: v.status === 'On' ? 'Rate or number update' : 'LSP registered for VAT' });
  const [ok, setOk] = useState(false);
  const next: VatSetting = { ...v, status: f.status as 'On' | 'Off', number: f.number.trim(), rate: +f.rate || 20, from: dateLabel(f.from) };
  const ex = { rent: 2000, plan: 16 as Plan }; const now = feeOf(ex.rent, ex.plan, { ...next, from: '1 Jan 2000' });
  const valid = f.from && (f.status === 'Off' || (/^GB ?\d{3} ?\d{4} ?\d{2}$/.test(f.number.trim()) && +f.rate > 0 && +f.rate <= 30));
  const changed = next.status !== v.status || next.number !== v.number || next.rate !== v.rate || next.from !== v.from;
  return <>
    <PageHeader crumbs={[{ label: 'Admin' }, { label: 'Settings' }]} title="Settings" />
    <Note>Admin only. Shown in the Supervisor prototype so the flow can be reviewed. Supervisors and Office Admins can see the result but cannot change it.</Note>
    <div className="dgrid">
      <div className="col">
        <Card title="Charge VAT on LSP fees" sub="One setting for the whole company. VAT is added on top of LSP's management fee only. Rent and contractor bills never change." action={vatBadge(v)}>
          <div className="seg2">{(['Off', 'On'] as const).map(x => <button key={x} className={f.status === x ? 'on' : ''} onClick={() => { setF({ ...f, status: x }); setOk(false); }}>{x === 'Off' ? 'Off · not VAT registered' : 'On · VAT registered'}</button>)}</div>
          {f.status === 'On' && <div className="grid g2"><Field label="VAT registration number"><Text value={f.number} onChange={x => { setF({ ...f, number: x }); setOk(false); }} placeholder="GB 123 4567 89" /></Field><Field label="VAT rate (%)"><Text value={f.rate} onChange={x => { setF({ ...f, rate: x }); setOk(false); }} /></Field></div>}
          <div className="grid g2"><Field label="Starts from"><input className="input" type="date" value={f.from} onChange={e => { setF({ ...f, from: e.target.value }); setOk(false); }} /></Field><Field label="Reason"><Text value={f.reason} onChange={x => setF({ ...f, reason: x })} /></Field></div>
          <div className="feebox">
            <div><span>Preview · £2,000 rent on the 16% plan</span><b>{money(now.net)} fee</b></div>
            <div className={now.on ? 'vat' : 'muted2'}><span>VAT</span><b>{now.on ? money(now.vat) : 'Not charged'}</b></div>
            <div className="tot"><span>Landlord pays</span><b>{money(now.total)}<em>{now.on ? ` · ${pctText(now.incl)} incl. VAT` : ''}</em></b></div>
          </div>
          {f.status === 'On' && !/^GB ?\d{3} ?\d{4} ?\d{2}$/.test(f.number.trim()) && <Note tone="warn">Add LSP's VAT registration number (GB followed by 9 numbers).</Note>}
          <label className="check"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> I have checked the new price above</label>
          <div className="flex" style={{ justifyContent: 'flex-end' }}><Btn disabled={!valid || !ok || !changed} icon={<Check size={16} />} onClick={() => {
            s.setVat({ ...next, history: [{ at: nowStamp(), by: ME_NAME, status: next.status as 'On' | 'Off', rate: next.rate, number: next.number, from: next.from, reason: f.reason || '—' }, ...v.history] });
            s.log(`VAT on LSP fees set to ${next.status}${next.status === 'On' ? ` at ${next.rate}% (${next.number})` : ''} from ${next.from}: ${f.reason}`, 'Settings');
            s.toast(`VAT ${next.status === 'On' ? 'switched On' : 'switched Off'} from ${next.from}`); setOk(false);
          }}>Confirm and save</Btn></div>
        </Card>
      </div>
      <div className="col">
        <Card title="How it works">
          <div className="divlist">
            <div className="item"><span className="tile t-brand"><Percent size={16} /></span><div className="stack grow"><b>Fees are stored before VAT</b><span className="caption">16% stays 16%. With VAT at 20% landlords see 19.2% including VAT.</span></div></div>
            <div className="item"><span className="tile t-ok"><Wallet size={16} /></span><div className="stack grow"><b>Maintenance budget never changes</b><span className="caption">{MAINT_SHARE}% of the fee before VAT, whether VAT is On or Off.</span></div></div>
            <div className="item"><span className="tile t-info"><CalendarClock size={16} /></span><div className="stack grow"><b>Works from the start date</b><span className="caption">A future date never charges VAT early. Sent invoices and statements never change.</span></div></div>
            <div className="item"><span className="tile t-warn"><Lock size={16} /></span><div className="stack grow"><b>Admin only</b><span className="caption">Every change is saved with who, when and why.</span></div></div>
          </div>
        </Card>
        <Card title="Change history" action={<HistoryIcon size={18} color="var(--text-brand)" />}>
          <Timeline items={v.history.map(h => ({ at: h.at, by: h.by, text: `${h.status === 'On' ? `On · ${h.rate}% · ${h.number}` : 'Off · not VAT registered'} · from ${h.from} · ${h.reason}`, tone: h.status === 'On' ? 'info' as const : undefined }))} />
        </Card>
        <Card title="Plans with VAT" sub={vatActive(v) ? 'VAT is on now.' : 'What landlords would see when VAT is on at 20%.'}>
          <div className="tablewrap"><table className="t"><thead><tr><th>Plan</th><th>Before VAT</th><th>Including VAT</th></tr></thead><tbody>
            {([10, 12, 16, 20] as Plan[]).map(pl => <tr key={pl} className="static"><td><b className="strong">{PLAN[pl].label}</b></td><td>{pl}%</td><td><b>{pctText(pl * 1.2)}</b></td></tr>)}
          </tbody></table></div>
        </Card>
      </div>
    </div>
  </>;
}
