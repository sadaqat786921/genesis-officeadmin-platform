import { useState, type ReactNode } from 'react';
import { Plus, Trash2, Send, Download, Eye, Pencil, PoundSterling, Bell, Mail, Image as ImageIcon } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { nowStamp, fmtDate, parseDate, type Invoice, type Job, type Line } from '../data';
import { ME_NAME } from '../data';
import { Btn, Chip, Field, Modal, Note, Select, Text, Area } from '../ui';
import { jobEvent, jobLines, lineSum, nextInvoiceNo, sendJobInvoice, adminName } from './shared';
import { invoiceState } from './tables';

/* ================= Company details printed on every quote, invoice and report ================= */
export const COMPANY = {
  name: 'Landlord Service Plans Limited',
  address: ['40 Park Square', 'Leeds LS1 2NP'],
  email: 'accounts@lsp.co.uk',
  reg: 'Company Registration No. 13940065',
  bank: ['Sort Code: 04-03-70', 'Account No.: 45338201'],
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const addDays = (d: string, n: number) => { const x = parseDate(d); x.setDate(x.getDate() + n); return fmtDate(x); };

/** Opens the browser's print dialog for the document only (Save as PDF). */
export function downloadPdf(s: ReturnType<typeof useStore>, name: string) {
  s.toast(`${name} ready. Choose "Save as PDF" to download.`);
  document.body.classList.add('printdoc');
  setTimeout(() => { try { window.print(); } catch { /* preview frames may block printing */ } document.body.classList.remove('printdoc'); }, 60);
}

/* ================= The paper template (same look as LSP's own invoice) ================= */
export function DocSheet({ kind, to, meta, site, lines, foot, stamp, children }: {
  kind: string; to: { label: string; rows: string[] }; meta: [string, string][]; site?: string; lines?: Line[];
  foot?: [string, string][]; stamp?: { text: string; tone: 'ok' | 'info' | 'warn' }; children?: ReactNode;
}) {
  return <div className="docwrap"><div className="paper">
    <div className="doc-h">
      <div className="stack" style={{ gap: 2 }}><b className="doc-co">{COMPANY.name}</b>{COMPANY.address.map(a => <span key={a}>{a}</span>)}<span>{COMPANY.email}</span><span className="doc-reg">{COMPANY.reg}</span></div>
      <img src="images/logo.svg" alt="Landlord Service Plans" className="doc-logo" />
    </div>
    <div className="doc-title">{kind}{stamp && <span className={`doc-stamp s-${stamp.tone}`}>{stamp.text}</span>}</div>
    <div className="doc-top">
      <div className="stack" style={{ gap: 2 }}><span className="doc-lab">{to.label}</span>{to.rows.filter(Boolean).map((r, i) => <span key={i} className={i === 0 ? 'strong' : ''}>{r}</span>)}
        {site && <><span className="doc-lab" style={{ marginTop: 14 }}>Site address</span><span>{site}</span></>}</div>
      <div className="doc-meta">{meta.map(([k, v]) => <div key={k}><span className="doc-lab">{k}</span><span>{v}</span></div>)}</div>
    </div>
    {lines && <>
      <table className="doc-t"><thead><tr><th>Activity</th><th>Description</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={i}><td>{l.activity}</td><td>{l.desc}</td><td className="r">{l.qty}</td><td className="r">{num(l.rate)}</td><td className="r">{num(r2(l.qty * l.rate))}</td></tr>)}</tbody></table>
      <div className="doc-tot">{(foot ?? [['Balance due', '£' + num(lineSum(lines))]]).map(([k, v], i, a) => <div key={k} className={i === a.length - 1 ? 'big' : ''}><span>{k}</span><b>{v}</b></div>)}</div>
    </>}
    {children}
    <div className="doc-f"><div className="stack" style={{ gap: 2 }}><span>{COMPANY.name}</span>{COMPANY.bank.map(b => <span key={b}>{b}</span>)}</div><span>Page 1 of 1</span></div>
  </div></div>;
}

/* ================= Quote builder: fill in the rows, preview the template, then mark it sent ================= */
const PRESETS: Line[] = [
  { activity: 'Call-out', desc: 'Attend site and assess the problem', qty: 1, rate: 60 },
  { activity: 'Labour', desc: 'Labour (hourly)', qty: 1, rate: 45 },
  { activity: 'Labour D/R', desc: 'Labour charge day rate', qty: 1, rate: 350 },
  { activity: 'Materials', desc: 'Parts and materials', qty: 1, rate: 0 },
];

export function QuoteBuilder({ job, client, onClose, onSent }: { job?: Job; client?: string; onClose: () => void; onSent?: (jobId: string) => void }) {
  const s = useStore(); const L = useLookups();
  const startProp = job ? L.prop(job.property) : undefined;
  const [cl, setCl] = useState(startProp?.owner ?? client ?? s.clients[0].id);
  const homes = s.properties.filter(p => !p.managed && p.owner === cl);
  const [home, setHome] = useState(job?.property ?? homes[0]?.id ?? '');
  const [title, setTitle] = useState(job?.title ?? '');
  const [lines, setLines] = useState<Line[]>(job?.lines?.length ? job.lines.map(l => ({ ...l })) : job?.price ? jobLines(job) : [{ ...PRESETS[0] }, { ...PRESETS[1] }]);
  const [con, setCon] = useState(job?.contractor ?? 'C4'); const [cost, setCost] = useState(job?.cost ? String(job.cost) : '');
  const [valid, setValid] = useState('30'); const [note, setNote] = useState(job?.quoteNote ?? 'Price includes parts and labour. Work starts once the quote is accepted.');
  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  const c = L.client(cl); const p = L.prop(home);
  const total = lineSum(lines); const costN = +cost || Math.round(total * .7); const margin = total - costN;
  const qno = job?.quoteNo ?? 'Q-' + (2402 + s.jobs.filter(j => j.quoteNo).length);
  const setLine = (i: number, patch: Partial<Line>) => setLines(ls => ls.map((l, k) => k === i ? { ...l, ...patch } : l));
  const ok = !!title.trim() && !!home && lines.length > 0 && lines.every(l => l.desc.trim() && l.qty > 0) && total > 0;

  const send = () => {
    const until = addDays('15 Oct 2026', +valid); const at = nowStamp();
    const mail = { id: 'cm' + Date.now(), at, by: ME_NAME, channel: 'Email' as const, dir: 'out' as const, subject: `Quote ${qno} · ${p?.address}`, text: `Quote ${qno} for ${title.toLowerCase()}: ${money(total)}. Valid until ${until}. PDF attached.` };
    const patch: Partial<Job> = { title, contractor: con, cost: costN, price: total, lines, quoteNo: qno, quoted: at, validUntil: until, quoteNote: note, status: 'Quote sent' };
    let id = job?.id;
    if (job) { jobEvent(s, job.id, `Quote ${qno} sent: ${money(total)}`, { ...patch, comms: [...job.comms, mail] }); }
    else {
      id = 'J' + (100 + s.jobs.length);
      const nj: Job = { id, property: home, managed: false, reported: at, by: `Client · ${c?.name}`, admin: p?.admin ?? 'et', category: 'General', comms: [mail], events: [{ at, by: ME_NAME, text: `Quote ${qno} created for ${c?.name}` }, { at, by: ME_NAME, text: `Quote ${qno} sent: ${money(total)}` }], ...patch } as Job;
      s.setJobs(js => [nj, ...js]);
    }
    s.log(`Sent quote ${qno} (${money(total)}) to ${c?.name} for ${title} at ${p?.address}`, 'Clients');
    s.toast(`Quote ${qno} sent to ${c?.email}`); onSent?.(id!); onClose();
  };

  if (step === 'preview') return <Modal wide title={`Quote ${qno}`} sub="This is what the client receives. Check it, then mark it as sent." onClose={onClose}
    footer={<><Btn kind="ghost" icon={<Pencil size={16} />} onClick={() => setStep('edit')}>Back to edit</Btn><Btn kind="outline" icon={<Download size={16} />} onClick={() => downloadPdf(s, `Quote ${qno}`)}>Download PDF</Btn><Btn icon={<Send size={16} />} onClick={send}>Mark quote as sent</Btn></>}>
    <DocSheet kind="QUOTE" to={{ label: 'Quote for', rows: [c?.contact ?? '', c?.name ?? '', ...(c?.address ?? '').split(', ')] }}
      meta={[['Quote', qno], ['Date', '15/10/2026'], ['Valid until', addDays('15 Oct 2026', +valid)], ['For', title]]} site={p ? `${p.address}, ${p.area}` : ''} lines={lines}
      foot={[['Subtotal', '£' + num(total)], ['Quote total', '£' + num(total)]]}>
      {note && <p className="doc-note">{note}</p>}
    </DocSheet>
    <Note tone="ok">Sent from Outlook to {c?.email} with the PDF attached. The contractor's cost is not on the quote.</Note>
  </Modal>;

  return <Modal wide title={job ? 'Create quote' : 'Create a new quote'} sub="Add each part of the work as its own row. The total adds up for you." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Eye size={16} />} disabled={!ok} onClick={() => setStep('preview')}>Preview quote</Btn></>}>
    <div className="grid g2">
      <Field label="Client">{job ? <div className="ro">{c?.name}</div> : <Select value={cl} onChange={v => { setCl(v); setHome(s.properties.find(x => !x.managed && x.owner === v)?.id ?? ''); }} options={s.clients.map(x => ({ value: x.id, label: x.name }))} />}</Field>
      <Field label="Home (site address)">{job ? <div className="ro">{p?.address}</div> : <Select value={home} onChange={setHome} options={homes.length ? homes.map(x => ({ value: x.id, label: x.address })) : [{ value: '', label: 'This client has no homes yet' }]} />}</Field>
    </div>
    <Field label="What the quote is for"><Text value={title} onChange={setTitle} placeholder="e.g. Fire alarm cable trunking" /></Field>
    <div className="qlines">
      <div className="qhead"><span>Activity</span><span>Description</span><span>Qty</span><span>Rate (£)</span><span className="r">Amount</span><span /></div>
      {lines.map((l, i) => <div key={i} className="qrow">
        <input aria-label="Activity" value={l.activity} onChange={e => setLine(i, { activity: e.target.value })} placeholder="Service" />
        <input aria-label="Description" value={l.desc} onChange={e => setLine(i, { desc: e.target.value })} placeholder="What is being done" />
        <input aria-label="Quantity" type="number" min={0} value={l.qty} onChange={e => setLine(i, { qty: +e.target.value })} />
        <input aria-label="Rate" type="number" min={0} step="0.01" value={l.rate} onChange={e => setLine(i, { rate: +e.target.value })} />
        <b className="r">{money(r2(l.qty * l.rate))}</b>
        <button className="qdel" aria-label="Remove row" disabled={lines.length < 2} onClick={() => setLines(ls => ls.filter((_, k) => k !== i))}><Trash2 size={15} /></button>
      </div>)}
      <div className="qfoot">
        <div className="flex wrap" style={{ gap: 6 }}><Btn sm kind="outline" icon={<Plus size={14} />} onClick={() => setLines(ls => [...ls, { activity: '', desc: '', qty: 1, rate: 0 }])}>Add row</Btn>{PRESETS.map(x => <button key={x.activity} className="qchip" onClick={() => setLines(ls => [...ls, { ...x }])}>+ {x.activity}</button>)}</div>
        <div className="qtotal"><span>Quote total</span><b>{money(total)}</b></div>
      </div>
    </div>
    <div className="grid g3">
      <Field label="Contractor"><Select value={con} onChange={setCon} options={s.contractors.filter(x => x.type === 'Trade').map(x => ({ value: x.id, label: `${x.name} · ${x.trade}${x.status !== 'Active' ? ' (paused)' : ''}`, disabled: x.status !== 'Active' }))} /></Field>
      <Field label="Contractor cost (£) · staff only"><Text value={cost} onChange={setCost} placeholder={String(Math.round(total * .7))} /></Field>
      <Field label="Quote valid for"><Select value={valid} onChange={setValid} options={[{ value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: '60', label: '60 days' }]} /></Field>
    </div>
    <Field label="Note on the quote"><Area value={note} onChange={setNote} /></Field>
    {margin >= 0 ? <Note tone="ok">LSP margin {money(margin)}. The client only sees the rows and the total.</Note> : <Note tone="err">The quote total is lower than the contractor's cost.</Note>}
  </Modal>;
}

/* ================= Invoice: preview in the template, send, then mark paid ================= */
export function InvoiceModal({ job, invoice, onClose }: { job?: Job; invoice?: string; onClose: () => void }) {
  const s = useStore(); const L = useLookups();
  const inv: Invoice | undefined = s.invoices.find(i => i.id === (invoice ?? job?.invoice));
  const j = job ?? (inv?.job ? s.jobs.find(x => x.id === inv.job) : undefined);
  const p = j ? L.prop(j.property) : undefined;
  const toKind = inv?.toKind ?? (p?.managed ? 'Landlord' : 'Client');
  const toId = inv?.to ?? p?.owner;
  const ll = toKind === 'Landlord' ? L.landlord(toId) : undefined; const cl = toKind === 'Client' ? L.client(toId) : undefined;
  const lines: Line[] = inv ? inv.items.map(x => ({ activity: x.activity ?? 'Services', desc: x.desc, qty: x.qty ?? 1, rate: x.rate ?? x.amount })) : j ? jobLines(j) : [];
  const total = inv ? inv.amount : lineSum(lines);
  const no = inv?.id ?? nextInvoiceNo(s);
  const issued = inv?.issued ?? '15 Oct 2026'; const terms = inv?.terms ?? (toKind === 'Landlord' ? 'Straight away' : cl?.terms ?? '30 days');
  const due = inv?.due ?? (toKind === 'Landlord' ? '15 Oct 2026' : '14 Nov 2026');
  const d = (x: string) => { const t = parseDate(x); return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`; };
  const st = inv ? invoiceState(inv) : undefined; const left = inv ? inv.amount - inv.paid : total;
  const name = ll?.name ?? cl?.name ?? ''; const email = ll?.email ?? cl?.email;
  const toRows = ll ? [ll.name, ...ll.billing.split(', ')] : cl ? [cl.contact, cl.name, ...cl.address.split(', ')] : [];
  const paid = () => { s.setInvoices(is => is.map(x => x.id === no ? { ...x, paid: x.amount, overdue: false, paidAt: nowStamp() } : x)); if (j) jobEvent(s, j.id, `Invoice ${no} paid`); s.log(`Recorded payment for ${no} (${money(left)}) from ${name}`, 'Rent & Invoices'); s.toast(`${no} marked paid`); };
  return <Modal wide title={inv ? `Invoice ${no}` : 'Send invoice'} sub={inv ? `${name} · ${st?.label}` : `Check the invoice before it goes to ${name}.`} onClose={onClose}
    footer={<>
      <Btn kind="outline" icon={<Download size={16} />} onClick={() => downloadPdf(s, `Invoice ${no}`)}>Download PDF</Btn>
      {!inv && j && <Btn icon={<Send size={16} />} onClick={() => sendJobInvoice(s, j, L)}>Send invoice</Btn>}
      {inv && left > 0 && <><Btn kind="ghost" icon={<Bell size={16} />} onClick={() => { s.toast(`Reminder sent to ${email}`); s.log(`Sent invoice reminder ${no} to ${name}`, 'Rent & Invoices'); }}>Send reminder</Btn><Btn kind="success" icon={<PoundSterling size={16} />} onClick={paid}>Mark as paid</Btn></>}
      {inv && left <= 0 && <Btn kind="outline" onClick={onClose}>Close</Btn>}
    </>}>
    {inv && <div className="flex" style={{ gap: 8 }}><Chip tone={st!.tone}>{st!.label}</Chip>{inv.paidAt && <span className="caption">Paid {inv.paidAt}</span>}<span className="caption">Sent from Outlook to {email}</span></div>}
    <DocSheet kind="INVOICE" to={{ label: 'Invoice to', rows: toRows }} meta={[['Invoice', no.replace('INV-', '')], ['Date', d(issued)], ['Terms', terms === 'Straight away' ? 'Due on receipt' : 'Net ' + terms.replace(' days', '')], ['Due date', d(due)]]}
      site={inv?.site ?? (p ? p.address : undefined)} lines={lines}
      foot={inv && inv.paid > 0 ? [['Total', '£' + num(total)], ['Paid', '−£' + num(inv.paid)], ['Balance due', '£' + num(left)]] : [['Balance due', '£' + num(total)]]}
      stamp={inv ? (left <= 0 ? { text: 'PAID', tone: 'ok' } : inv.overdue ? { text: 'OVERDUE', tone: 'warn' } : { text: 'SENT', tone: 'info' }) : undefined} />
    {!inv && <Note tone="ok">It goes from Outlook to {email} with the PDF attached{toKind === 'Landlord' ? ', and shows in the landlord portal' : ''}.</Note>}
  </Modal>;
}

/* ================= Job reports for the landlord: details, history and photo proof ================= */
export function JobReportModal({ jobs, title = 'Job reports', onClose }: { jobs: Job[]; title?: string; onClose: () => void }) {
  const s = useStore(); const L = useLookups();
  const [pick, setPick] = useState<string[]>(jobs.map(j => j.id));
  const chosen = jobs.filter(j => pick.includes(j.id));
  const p = jobs[0] ? L.prop(jobs[0].property) : undefined; const owner = p ? (p.managed ? L.landlord(p.owner) : undefined) : undefined; const cl = p && !p.managed ? L.client(p.owner) : undefined;
  const to = owner?.email ?? cl?.email;
  const toggle = (id: string) => setPick(x => x.includes(id) ? x.filter(y => y !== id) : [...x, id]);
  return <Modal wide title={title} sub={`${p?.address} · for ${L.ownerName(p)}. Each report has the job details, every step with date and time, and the photo proof.`} onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Close</Btn><Btn kind="outline" icon={<Mail size={16} />} disabled={!chosen.length} onClick={() => { s.log(`Emailed ${chosen.length} job report${chosen.length > 1 ? 's' : ''} for ${p?.address} to ${L.ownerName(p)}`, 'Jobs'); s.toast(`Sent to ${to}`); }}>Email to {owner ? 'landlord' : 'client'}</Btn><Btn icon={<Download size={16} />} disabled={!chosen.length} onClick={() => { s.log(`Downloaded ${chosen.length} job report${chosen.length > 1 ? 's' : ''} for ${p?.address}`, 'Jobs'); downloadPdf(s, `${chosen.length} job report${chosen.length > 1 ? 's' : ''}`); }}>Download PDF ({chosen.length})</Btn></>}>
    {jobs.length > 1 && <div className="rpick">{jobs.map(j => <label key={j.id} className={pick.includes(j.id) ? 'on' : ''}><input type="checkbox" checked={pick.includes(j.id)} onChange={() => toggle(j.id)} /><span className="stack grow"><b>{j.title}</b><span className="caption">{j.reported.split(',')[0]} · {j.status}{j.proof?.length ? ` · ${j.proof.length} photos` : ''}</span></span></label>)}</div>}
    {chosen.map(j => { const c = L.contractor(j.contractor); const inv = j.invoice ? s.invoices.find(i => i.id === j.invoice) : undefined; return <DocSheet key={j.id} kind="JOB REPORT"
      to={{ label: 'Prepared for', rows: [L.ownerName(p), owner ? `${owner.plan}% plan` : 'Client'] }} site={p ? `${p.address}, ${p.area}` : ''}
      meta={[['Job', j.id], ['Status', j.status], ['Reported', j.reported], ['Office Admin', adminName(j.admin)]]}>
      <div className="doc-sec"><span className="doc-lab">The job</span><b>{j.title}</b><span>{j.note ?? 'No details given.'}</span>
        <div className="doc-kv"><span>Reported by</span><b>{j.by}</b><span>Contractor</span><b>{c?.name ?? 'Not assigned'}</b><span>Price</span><b>{j.price ? money(j.price) : '—'}</b><span>Invoice</span><b>{inv ? `${inv.id} · ${invoiceState(inv).label}` : 'Not invoiced'}</b></div></div>
      <div className="doc-sec"><span className="doc-lab">What happened</span>{j.events.map((e, i) => <div key={i} className="doc-ev"><span>{e.at}</span><span>{e.text}<em> · {e.by}</em></span></div>)}</div>
      <div className="doc-sec"><span className="doc-lab">Photo proof</span>{j.proof?.length ? <div className="doc-ph">{j.proof.map((x, i) => <div key={i} style={{ backgroundImage: `url(images/home${(i % 3) + 1}.jpg)` }}><span>{x}</span></div>)}</div> : <span className="caption"><ImageIcon size={12} style={{ verticalAlign: -2 }} /> No photos uploaded yet.</span>}</div>
    </DocSheet>; })}
    {!chosen.length && <Note>Tick at least one job.</Note>}
  </Modal>;
}

