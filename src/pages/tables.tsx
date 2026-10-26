import { useState } from 'react';
import { Upload, Bell, Wrench, ClipboardCheck, ShieldCheck, Receipt, ArrowRight, Download } from 'lucide-react';
import { useStore, useLookups, money, type Lookups, type Route } from '../store';
import { daysFrom, nowStamp, type CertStatus, type Inspection, type Invoice, type Job, type SafetyCert } from '../data';
import { ME, ME_NAME } from '../data';
import { Avatar, Btn, Chip, Drawer, Card, KV, Note, UploadModal, When, Empty } from '../ui';
import { InvoiceModal } from './docs';
import { adminName, jobTone, nextJobAction } from './shared';

type S = ReturnType<typeof useStore>;

/* ---------- safety certificates ---------- */
export const certTone = (st: CertStatus) => ({ Valid: 'ok', 'Due soon': 'warn', Overdue: 'err', Booked: 'info', 'Proof to check': 'brand', Missing: 'err' } as const)[st];
export const daysText = (c: SafetyCert) => c.status === 'Missing' ? 'No certificate' : c.days < 0 ? `${-c.days} days over` : c.days === 0 ? 'Ends today' : c.days > 365 ? `${Math.round(c.days / 365)} years` : `${c.days} days`;
const statusFor = (days: number): CertStatus => days < 0 ? 'Overdue' : days <= 30 ? 'Due soon' : 'Valid';

export function saveCert(s: S, L: Lookups, c: SafetyCert, v: { file: string; issued: string; expires: string }) {
  const days = daysFrom(v.expires);
  s.setSafety(cs => cs.map(x => x.id === c.id ? { ...x, history: x.file && x.issued ? [{ issued: x.issued, expires: x.expires, file: x.file, by: L.contractor(x.contractor)?.name ?? 'LSP staff' }, ...x.history] : x.history, issued: v.issued, expires: v.expires, days, status: statusFor(days), file: v.file } : x));
  const p = L.prop(c.property);
  s.log(`${c.file ? 'Replaced' : 'Uploaded'} ${c.kind} certificate for ${p?.address} (done ${v.issued}, ends ${v.expires})`, 'Safety');
  s.toast(`${c.kind} certificate saved. Ends ${v.expires}.`);
}
/** Office Admin: email the landlord that a certificate is due, and put "book it" on your own task list. */
export function remindCert(s: S, L: Lookups, c: SafetyCert) {
  const p = L.prop(c.property); const ll = L.landlord(p?.owner);
  s.setSafety(cs => cs.map(x => x.id === c.id ? { ...x, reminders: [{ at: nowStamp(), to: ll?.name ?? 'Landlord' }, ...x.reminders] } : x));
  if (ll) s.setLandlords(ls => ls.map(l => l.id === ll.id ? { ...l, comms: [...l.comms, { id: 'cm' + Date.now(), at: nowStamp(), by: ME_NAME, channel: 'Email', dir: 'out', subject: `${c.kind} ${c.status === 'Missing' ? 'needed' : 'due'} · ${p?.address}`, text: `The ${c.kind} certificate for ${p?.address} ${c.status === 'Missing' ? 'is missing' : 'ends ' + c.expires}. We will book a qualified contractor and send you the new certificate.` }] } : l));
  s.setTasks(ts => [{ id: 'K' + Date.now(), title: `${c.status === 'Missing' ? 'Get' : 'Renew'} ${c.kind} certificate for ${p?.address}`, admin: ME, due: '22 Oct 2026', late: false, done: false, created: nowStamp(), area: 'Safety', from: 'You', link: { route: 'safety', id: c.id } }, ...ts]);
  s.log(`Reminded ${ll?.name ?? 'the landlord'} about the ${c.kind} certificate for ${p?.address}`, 'Safety');
  s.toast(`Email sent to ${ll?.name ?? 'the landlord'}. "Book it" added to your tasks.`);
}

export function CertTable({ list, hideHome }: { list: SafetyCert[]; hideHome?: boolean }) {
  const s = useStore(); const L = useLookups();
  const [up, setUp] = useState<string | null>(null);
  const c = up ? s.safety.find(x => x.id === up) : undefined;
  return <div className="tablewrap"><table className="t"><thead><tr><th>Certificate</th>{!hideHome && <th>Home</th>}<th>Done on</th><th>Expires</th><th>Time left</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead><tbody>
    {list.map(x => <tr key={x.id} onClick={() => s.go('safety', x.id)}>
      <td><span className="cell"><span className={`tile t-${certTone(x.status)}`} style={{ width: 32, height: 32 }}><ShieldCheck size={15} /></span><span className="stack"><b className="strong">{x.kind}</b><span className="caption">{x.file ?? 'No file yet'}</span></span></span></td>
      {!hideHome && <td>{L.prop(x.property)?.address}</td>}
      <td>{x.issued ? <When at={x.issued} /> : <span className="muted">—</span>}</td><td>{x.issued ? x.expires : '—'}</td>
      <td><b style={{ color: x.days < 0 ? 'var(--err)' : x.days <= 30 ? 'var(--warn)' : undefined }}>{daysText(x)}</b></td>
      <td><Chip tone={certTone(x.status)}>{x.status}</Chip></td>
      <td onClick={e => e.stopPropagation()}><div className="flex" style={{ justifyContent: 'flex-end' }}>
        <Btn sm kind="ghost" icon={<Upload size={14} />} onClick={() => setUp(x.id)}>{x.file ? 'Replace' : 'Upload'}</Btn>
        {x.status !== 'Valid' && <Btn sm kind="ghost" icon={<Bell size={14} />} onClick={() => remindCert(s, L, x)}>Remind</Btn>}</div></td></tr>)}
  </tbody></table>{!list.length && <Empty icon={<ShieldCheck size={22} />}>No certificates here.</Empty>}
    {c && <UploadModal title={`${c.file ? 'Replace' : 'Upload'} ${c.kind} certificate`} sub={`${L.prop(c.property)?.address}. The old certificate is kept in the history.`} withIssued withExpiry cta="Save certificate" onClose={() => setUp(null)} onSave={v => { saveCert(s, L, c, v); setUp(null); }} />}
  </div>;
}

/* ---------- inspections ---------- */
export const inspTone = { 'Not assigned': 'warn', Booked: 'info', 'Report uploaded': 'brand', 'Sent back': 'err', Locked: 'ok' } as const;
export const inspStatusLabel = (st: Inspection['status']) => st === 'Locked' ? 'Checked · locked' : st;
export function InspTable({ list, hideHome }: { list: Inspection[]; hideHome?: boolean }) {
  const s = useStore(); const L = useLookups();
  return <div className="tablewrap"><table className="t"><thead><tr><th>Inspection</th>{!hideHome && <th>Home</th>}<th>Booked for</th><th>Inspector</th><th>Done on</th><th>Status</th><th>Report</th></tr></thead><tbody>
    {list.map(i => { const c = L.contractor(i.inspector); return <tr key={i.id} onClick={() => s.go('inspections', i.id)}>
      <td><span className="cell"><span className="tile t-brand" style={{ width: 32, height: 32 }}><ClipboardCheck size={15} /></span><span className="stack"><b className="strong">{i.kind}</b><span className="caption">{i.scope}{i.room ? ' · ' + i.room : ''}</span></span></span></td>
      {!hideHome && <td>{L.prop(i.property)?.address}</td>}
      <td><When at={`${i.date}, ${i.time}`} /></td>
      <td>{c ? <span className="cell"><Avatar name={c.name} />{c.name}</span> : <Chip tone="warn">Not assigned</Chip>}</td>
      <td>{i.doneAt ? <When at={i.doneAt} /> : <span className="muted">Not yet</span>}</td>
      <td><Chip tone={inspTone[i.status]}>{inspStatusLabel(i.status)}</Chip></td>
      <td onClick={e => e.stopPropagation()}>{i.rooms.length ? <Btn sm kind="ghost" icon={<Download size={14} />} onClick={() => s.toast(`${i.kind} report downloaded`)}>PDF</Btn> : <span className="muted">—</span>}</td></tr>; })}
  </tbody></table>{!list.length && <Empty icon={<ClipboardCheck size={22} />}>No inspections here.</Empty>}</div>;
}

/* ---------- jobs ---------- */
export function JobTable({ list, hideHome, route = 'jobs' }: { list: Job[]; hideHome?: boolean; route?: Route }) {
  const s = useStore(); const L = useLookups();
  return <div className="tablewrap"><table className="t"><thead><tr><th>Job</th>{!hideHome && <th>Home</th>}<th>Contractor</th><th>Price</th><th>Reported</th><th>Status</th><th>Next</th></tr></thead><tbody>
    {list.map(j => { const c = L.contractor(j.contractor); return <tr key={j.id} onClick={() => s.go(route, j.id)}>
      <td><span className="cell"><span className={`tile ${j.urgent && !['Approved', 'Invoiced'].includes(j.status) ? 't-err' : 't-info'}`} style={{ width: 32, height: 32 }}><Wrench size={15} /></span><span className="stack"><b className="strong">{j.title}</b><span className="caption">{j.by}</span></span></span></td>
      {!hideHome && <td>{L.prop(j.property)?.address}<div className="caption">{j.managed ? 'Managed' : 'Client home'}</div></td>}
      <td>{c ? <span className="cell"><Avatar name={c.name} />{c.name}</span> : <span className="muted">Not yet</span>}</td>
      <td>{j.price ? <b>{money(j.price)}</b> : '—'}</td><td><When at={j.reported} /></td>
      <td><Chip tone={jobTone(j.status)}>{j.status}</Chip></td><td><span className="caption" style={{ fontWeight: 600 }}>{nextJobAction(j)}</span></td></tr>; })}
  </tbody></table>{!list.length && <Empty icon={<Wrench size={22} />}>No jobs here.</Empty>}</div>;
}

/* ---------- invoices ---------- */
export function invoiceState(i: Invoice) { const left = i.amount - i.paid; return left <= 0 ? { label: 'Paid', tone: 'ok' as const } : i.overdue ? { label: `Overdue · ${money(left)}`, tone: 'err' as const } : i.paid ? { label: 'Part-paid', tone: 'warn' as const } : { label: 'Sent', tone: 'info' as const }; }
export function InvoiceTable({ list }: { list: Invoice[] }) {
  const s = useStore(); const L = useLookups(); const [open, setOpen] = useState<string | null>(null);
  const name = (i: Invoice) => i.toKind === 'Client' ? L.client(i.to)?.name : L.landlord(i.to)?.name;
  const remind = (i: Invoice) => { s.toast(`Reminder sent to ${name(i)}`); s.log(`Sent invoice reminder ${i.id} to ${name(i)}`, 'Rent & Invoices'); };
  const paid = (i: Invoice) => { s.setInvoices(is => is.map(x => x.id === i.id ? { ...x, paid: x.amount, overdue: false } : x)); s.log(`Recorded payment for ${i.id} (${money(i.amount - i.paid)})`, 'Rent & Invoices'); s.toast(`${i.id} marked paid`); };
  const inv = open ? s.invoices.find(x => x.id === open) : undefined;
  return <div className="tablewrap"><table className="t"><thead><tr><th>Invoice</th><th>To</th><th>Amount</th><th>Paid</th><th>Issued</th><th>Due</th><th>Status</th><th /></tr></thead><tbody>
    {list.map(i => { const left = i.amount - i.paid; const st = invoiceState(i); return <tr key={i.id} onClick={() => setOpen(i.id)}><td><span className="cell"><span className="tile t-brand" style={{ width: 32, height: 32 }}><Receipt size={15} /></span><b className="strong">{i.id}</b></span></td><td>{name(i)}<div className="caption">{i.toKind} · {i.terms}</div></td><td>{money(i.amount)}</td><td>{money(i.paid)}</td><td>{i.issued}</td><td>{i.due}</td>
      <td><Chip tone={st.tone}>{st.label}</Chip></td>
      <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>{left > 0 && <div className="flex" style={{ justifyContent: 'flex-end' }}><Btn sm kind="ghost" icon={<Bell size={14} />} onClick={() => remind(i)}>Remind</Btn><Btn sm kind="outline" onClick={() => paid(i)}>Mark paid</Btn></div>}</td></tr>; })}
  </tbody></table>{!list.length && <Empty icon={<Receipt size={22} />}>No invoices.</Empty>}
    {inv && <InvoiceModal invoice={inv.id} onClose={() => setOpen(null)} />}
  </div>;
}
