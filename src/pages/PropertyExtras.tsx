import { useState, type ReactNode } from 'react';
import { Wrench, ShieldCheck, ClipboardCheck, PoundSterling, Users, Home, Receipt, History as HistoryIcon, Download, Landmark, Send, Eye, ArrowRight } from 'lucide-react';
import { useStore, useLookups, money, rentStatus } from '../store';
import { parseDate, PLAN, type Property, type Tone } from '../data';
import { ME_NAME } from '../data';
import { Btn, Card, Chip, Empty, Stat, Tabs, Note } from '../ui';
import { InvoiceTable } from './tables';
import { downloadPdf } from './docs';

type S = ReturnType<typeof useStore>;
type Kind = 'Jobs' | 'Compliance' | 'Inspections' | 'Rent & invoices' | 'Tenancy' | 'Property';
export interface HItem { at: string; kind: Kind; text: ReactNode; by?: string; tag?: { label: string; tone: Tone }; go?: () => void }
const ICON: Record<Kind, [ReactNode, string]> = {
  Jobs: [<Wrench size={15} />, 't-info'], Compliance: [<ShieldCheck size={15} />, 't-ok'], Inspections: [<ClipboardCheck size={15} />, 't-brand'],
  'Rent & invoices': [<PoundSterling size={15} />, 't-warn'], Tenancy: [<Users size={15} />, 't-brand'], Property: [<Home size={15} />, 't-info'],
};
const key = (at: string) => parseDate(at).getTime();

/** Everything that ever happened at one property, newest first. Nothing is removed: replaced certificates stay as earlier versions. */
export function propertyHistory(s: S, L: ReturnType<typeof useLookups>, p: Property): HItem[] {
  const out: HItem[] = [{ at: p.added, kind: 'Property', text: `${p.address} added to Genesis · ${p.managed ? 'managed for ' : 'client home for '}${L.ownerName(p)}`, by: ME_NAME }];
  s.tenants.filter(t => t.property === p.id).forEach(t => {
    out.push({ at: t.start, kind: 'Tenancy', text: `Tenancy started: ${t.name}${t.room ? ' · ' + t.room : ''} · ${money(t.rent)} pcm, deposit ${money(t.deposit)} (${t.depositScheme})`, go: () => s.go('tenants', t.id) });
    if (t.status !== 'Live') out.push({ at: t.end, kind: 'Tenancy', text: `${t.status === 'Moved out' ? 'Moved out' : 'Moving out'}: ${t.name}`, go: () => s.go('tenants', t.id) });
  });
  s.jobs.filter(j => j.property === p.id).forEach(j => j.events.forEach(e => out.push({ at: e.at, kind: 'Jobs', text: <><b>{j.title}</b> · {e.text}</>, by: e.by, go: () => s.go(j.managed ? 'jobs' : 'clients', j.id) })));
  s.inspections.filter(i => i.property === p.id).forEach(i => {
    if (i.doneAt) out.push({ at: i.doneAt, kind: 'Inspections', text: <><b>{i.kind}</b> done{i.room ? ' · ' + i.room : ''}{i.summary ? ' · ' + i.summary : ''}</>, by: L.contractor(i.inspector)?.name, tag: i.status === 'Locked' ? { label: 'Report locked', tone: 'neutral' } : undefined, go: () => s.go('inspections', i.id) });
    else out.push({ at: `${i.date}, ${i.time}`, kind: 'Inspections', text: <><b>{i.kind}</b> booked for {i.date}, {i.time}</>, by: L.contractor(i.inspector)?.name, tag: { label: 'Upcoming', tone: 'info' }, go: () => s.go('inspections', i.id) });
  });
  s.safety.filter(c => c.property === p.id).forEach(c => {
    c.history.forEach((h, i) => out.push({ at: h.issued, kind: 'Compliance', text: <><b>{c.kind}</b> certificate added · {h.file} · valid until {h.expires}</>, by: h.by, tag: { label: i === 0 && c.issued ? 'Replaced · earlier version kept' : 'Earlier version kept', tone: 'neutral' }, go: () => s.go('safety', c.id) }));
    if (c.issued) out.push({ at: c.issued, kind: 'Compliance', text: <><b>{c.kind}</b> certificate {c.history.length ? 'replaced with a new one' : 'added'} · {c.file} · valid until {c.expires}</>, by: L.contractor(c.contractor)?.name ?? 'LSP team', tag: { label: 'Current version', tone: 'ok' }, go: () => s.go('safety', c.id) });
    else out.push({ at: p.added, kind: 'Compliance', text: <><b>{c.kind}</b> needed · no certificate on file yet</>, tag: { label: 'Missing', tone: 'err' }, go: () => s.go('safety', c.id) });
  });
  const tids = s.tenants.filter(t => t.property === p.id).map(t => t.id);
  s.rent.filter(r => tids.includes(r.tenant)).forEach(r => r.history.forEach(h => out.push({ at: h.date, kind: 'Rent & invoices', text: `Rent received from ${L.tenant(r.tenant)?.name}: ${money(h.amount)} for ${r.month} · ${h.note}`, go: () => s.go('rent', r.id) })));
  const jids = s.jobs.filter(j => j.property === p.id).map(j => j.id);
  s.invoices.filter(i => (i.job && jids.includes(i.job)) || i.site === p.address || i.items.some(x => x.desc.includes(p.address))).forEach(i => {
    out.push({ at: i.issued, kind: 'Rent & invoices', text: `Invoice ${i.id} sent to ${i.toKind === 'Client' ? L.client(i.to)?.name : L.landlord(i.to)?.name}: ${money(i.amount)}` });
    if (i.paid >= i.amount) out.push({ at: i.paidAt ?? i.issued, kind: 'Rent & invoices', text: `Invoice ${i.id} paid in full`, tag: { label: 'Paid', tone: 'ok' } });
  });
  s.plans.filter(v => v.property === p.id).forEach(v => out.push({ at: v.at, kind: 'Property', text: <><b>Property Management Plan v{v.version}</b> saved · {v.data.ref}</>, by: v.by, tag: { label: 'Saved version', tone: 'brand' } }));
  s.activity.filter(a => a.what.includes(p.address) && ['Properties', 'Lettings'].includes(a.area) && !a.what.startsWith('Property Management Plan v')).forEach(a => out.push({ at: a.at, kind: 'Property', text: a.what, by: a.who }));
  return out.sort((a, b) => key(b.at) - key(a.at));
}

export function PropertyHistory({ p }: { p: Property }) {
  const s = useStore(); const L = useLookups();
  const all = propertyHistory(s, L, p);
  const kinds: Kind[] = p.managed ? ['Jobs', 'Compliance', 'Inspections', 'Rent & invoices', 'Tenancy', 'Property'] : ['Jobs', 'Rent & invoices', 'Property'];
  const [f, setF] = useState<'all' | Kind>('all');
  const list = all.filter(x => f === 'all' || x.kind === f);
  const first = all[all.length - 1];
  return <Card title="Full history" sub={`Everything at ${p.address} from ${first?.at.split(',')[0] ?? p.added} to today, with the date and time. Nothing is deleted. When a document is replaced, the earlier version stays here.`}
    action={<Btn sm kind="outline" icon={<Download size={14} />} onClick={() => { s.log(`Downloaded full history for ${p.address}`, 'Properties'); downloadPdf(s, `History · ${p.address}`); }}>Download history</Btn>}>
    <Tabs value={f} onChange={setF} items={[{ id: 'all' as const, label: 'All', count: all.length }, ...kinds.map(k => ({ id: k, label: k, count: all.filter(x => x.kind === k).length }))]} />
    {list.length ? <div className="hlist">{list.map((x, i) => { const [ic, tone] = ICON[x.kind]; return <div key={i} className={`hrow${x.go ? ' click' : ''}`} onClick={x.go} role={x.go ? 'button' : undefined}>
      <span className={`tile ${tone}`} style={{ width: 32, height: 32 }}>{ic}</span>
      <div className="stack grow" style={{ gap: 3 }}><span className="htext">{x.text}</span><span className="caption">{x.at}{x.by ? ' · ' + x.by : ''} · {x.kind}</span></div>
      {x.tag && <Chip tone={x.tag.tone} dot={false}>{x.tag.label}</Chip>}{x.go && <ArrowRight size={15} color="#98A2B3" />}
    </div>; })}</div> : <Empty icon={<HistoryIcon size={22} />}>Nothing here yet.</Empty>}
  </Card>;
}

/** Rent the tenant paid and what went on to the landlord, month by month. */
export function PropertyMoney({ p }: { p: Property }) {
  const s = useStore(); const L = useLookups();
  const ll = L.landlord(p.owner); const plan = ll?.plan ?? 16;
  const tenants = s.tenants.filter(t => t.property === p.id && t.status !== 'Moved out');
  const rows = s.rent.filter(r => tenants.some(t => t.id === r.tenant));
  const jids = s.jobs.filter(j => j.property === p.id).map(j => j.id);
  const invs = s.invoices.filter(i => (i.job && jids.includes(i.job)) || i.site === p.address || i.items.some(x => x.desc.includes(p.address)));
  const rentPcm = tenants.reduce((a, t) => a + t.rent, 0) || p.rent;
  const repairsIn = (m: string) => invs.filter(i => i.toKind === 'Landlord' && i.paid < i.amount && i.issued.endsWith(m)).reduce((a, i) => a + i.amount, 0);
  const started = (m: string) => tenants.filter(t => parseDate(t.start).getTime() <= parseDate('28 ' + m).getTime());
  const months = ['Aug 2026', 'Sep 2026', 'Oct 2026'].map(m => {
    if (m === 'Oct 2026') { const due = rows.reduce((a, r) => a + r.amount, 0), paid = rows.reduce((a, r) => a + r.paid, 0); return { m, due, paid, done: s.payouts[p.owner] === 'Paid', hold: s.payouts[p.owner] === 'On hold' }; }
    const t = started(m); const due = t.reduce((a, x) => a + x.rent, 0); return { m, due, paid: due, done: true, hold: false };
  }).filter(x => x.due > 0).map(x => { const fee = Math.round(x.paid * plan / 100); const rep = repairsIn(x.m); return { ...x, fee, rep, out: Math.max(0, x.paid - fee - rep) }; });
  const now = months[months.length - 1];
  const payments = [
    ...rows.flatMap(r => r.history.map(h => ({ date: h.date, who: L.tenant(r.tenant)?.name ?? '', month: r.month, amount: h.amount, note: h.note }))),
    ...tenants.flatMap(t => ['Aug 2026', 'Sep 2026'].filter(m => started(m).includes(t)).map(m => ({ date: `${t.rentDay} ${m}`, who: t.name, month: m, amount: t.rent, note: 'Bank transfer' }))),
  ].sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime());
  const owing = rows.filter(r => r.paid < r.amount);
  return <>
    <div className="grid g4">
      <Stat label="Rent per month" value={money(rentPcm)} sub={`${tenants.length} tenant${tenants.length === 1 ? '' : 's'}`} />
      <Stat label="Tenant paid · Oct" value={money(now?.paid ?? 0)} sub={now && now.paid < now.due ? `${money(now.due - now.paid)} still owed` : 'Paid in full'} tone={now && now.paid < now.due ? 'warn' : 'ok'} />
      <Stat label={`LSP fee · ${plan}%`} value={money(now?.fee ?? 0)} sub={`Job limit ${money(PLAN[plan].limit)}`} />
      <Stat label="To landlord · Oct" value={money(now?.out ?? 0)} sub={now?.done ? 'Paid' : now?.hold ? 'On hold' : 'Paid on 20 Oct'} tone={now?.done ? 'ok' : now?.hold ? 'warn' : 'info'} />
    </div>
    {owing.length > 0 && <Note tone="warn">{owing.map(r => `${L.tenant(r.tenant)?.name} owes ${money(r.amount - r.paid)} for ${r.month}`).join(' · ')}. The landlord is paid what arrived; the rest carries forward.</Note>}
    <Card title="Month by month" sub={`What the tenant paid, the LSP fee, unpaid repair invoices taken off, and what was paid to ${ll?.name}.`}
      action={<Btn sm kind="outline" icon={<Send size={14} />} onClick={() => { s.log(`Sent October statement for ${p.address} to ${ll?.name}`, 'Rent & Invoices'); s.toast(`Statement sent to ${ll?.email}`); }}>Send statement</Btn>}>
      <div className="tablewrap"><table className="t"><thead><tr><th>Month</th><th>Rent due</th><th>Tenant paid</th><th>LSP fee ({plan}%)</th><th>Repairs taken off</th><th>Paid to landlord</th><th>Status</th></tr></thead><tbody>
        {[...months].reverse().map(x => <tr key={x.m} className="static"><td><b className="strong">{x.m}</b></td><td>{money(x.due)}</td><td>{money(x.paid)}{x.paid < x.due && <div className="caption" style={{ color: 'var(--warn)' }}>{money(x.due - x.paid)} owed</div>}</td><td>−{money(x.fee)}</td><td>{x.rep ? '−' + money(x.rep) : '—'}</td><td><b>{money(x.out)}</b></td>
          <td><Chip tone={x.done ? 'ok' : x.hold ? 'warn' : 'info'}>{x.done ? 'Paid to landlord' : x.hold ? 'On hold' : 'Due 20 Oct'}</Chip></td></tr>)}
      </tbody></table></div>
    </Card>
    <div className="grid g2">
      <Card title="What the tenant paid" sub="Every payment that arrived in the bank, with the date." action={rows[0] && <Btn sm kind="ghost" icon={<Eye size={14} />} onClick={() => s.go('rent', rows[0].id)}>Rent account</Btn>}>
        {payments.length ? <div className="divlist">{payments.map((x, i) => <div key={i} className="item"><span className="tile t-ok" style={{ width: 32, height: 32 }}><PoundSterling size={15} /></span><div className="stack grow"><b>{money(x.amount)} · {x.who}</b><span className="caption">{x.date} · for {x.month} · {x.note}</span></div></div>)}</div> : <Empty icon={<PoundSterling size={22} />}>No payments yet.</Empty>}
        {rows.map(r => <div key={r.id} className="flex between" style={{ marginTop: 4 }}><span className="small">{L.tenant(r.tenant)?.name} · {r.month}</span><Chip tone={rentStatus(r).tone}>{rentStatus(r).label}</Chip></div>)}
      </Card>
      <Card title="Paid to the landlord" sub={`${ll?.name} · ${ll?.bank}`}>
        <div className="divlist">{[...months].reverse().map(x => <div key={x.m} className="item"><span className={`tile ${x.done ? 't-ok' : 't-info'}`} style={{ width: 32, height: 32 }}><Landmark size={15} /></span><div className="stack grow"><b>{money(x.out)} · {x.m}</b><span className="caption">{money(x.paid)} rent − {money(x.fee)} fee{x.rep ? ` − ${money(x.rep)} repairs` : ''}</span></div><Chip tone={x.done ? 'ok' : x.hold ? 'warn' : 'info'}>{x.done ? 'Paid' : x.hold ? 'On hold' : 'Scheduled'}</Chip></div>)}</div>
      </Card>
    </div>
    <Card title="Invoices for this home" sub="Repair invoices to the landlord. Click one to see it in the LSP template."><InvoiceTable list={invs} /></Card>
  </>;
}

export function ClientHomeInvoices({ p }: { p: Property }) {
  const s = useStore();
  const jids = s.jobs.filter(j => j.property === p.id).map(j => j.id);
  const invs = s.invoices.filter(i => (i.job && jids.includes(i.job)) || i.site === p.address || i.items.some(x => x.desc.includes(p.address)));
  return <Card title="Invoices for this home" sub="Sent to the client. Click one to see it in the LSP template." action={<Receipt size={18} color="var(--text-brand)" />}><InvoiceTable list={invs} /></Card>;
}
