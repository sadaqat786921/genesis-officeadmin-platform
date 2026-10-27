import { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, Eye, Send, Save, X, Paperclip, Upload, Mail, FileText, Search, Package } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { ME, ME_NAME, PORTAL, nowStamp, parseDate, fmtDate, type Job, type Line, type Product, type Invoice } from '../data';
import { Btn, Card, Chip, Field, Modal, Note, Select, Text, Area } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { COMPANY, DocSheet } from './docs';
import { jobEvent, jobLines, nextInvoiceNo } from './shared';

/* Full-page quote and invoice editor (like the client's accounting tool, in the LSP design).
   Rows pick a product or service by its code from the saved list; a new code can be saved for next time.
   The customer only sees the product's real name and description, never the internal code. */

type Kind = 'quote' | 'invoice';
type Row = Line & { key: string };
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toInput = (v: string) => { const d = parseDate(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fromInput = (v: string) => v ? fmtDate(new Date(v + 'T00:00')) : '';
const plus = (v: string, n: number) => { const d = parseDate(v); d.setDate(d.getDate() + n); return fmtDate(d); };
const blank = (): Row => ({ key: Math.random().toString(36).slice(2), code: '', activity: '', desc: '', qty: 1, rate: 0 });
const ddmm = (v: string) => { const d = parseDate(v); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

export function DocEditor({ kind, target, client, back }: { kind: Kind; target: string; client?: string; back: () => void }) {
  const s = useStore(); const L = useLookups();
  const job: Job | undefined = target !== 'new' ? s.jobs.find(j => j.id === target) : undefined;
  const jp = job ? L.prop(job.property) : undefined;
  const isQuote = kind === 'quote';
  // customers: quotes go to letting agents (clients); invoices to landlords or clients
  const customers = useMemo(() => [
    ...s.clients.map(c => ({ id: c.id, kind: 'Client' as const, name: c.name, contact: c.contact, email: c.email, address: c.address, terms: c.terms })),
    ...(!isQuote ? s.landlords.map(l => ({ id: l.id, kind: 'Landlord' as const, name: l.name, contact: l.name, email: l.email, address: l.billing, terms: 'Straight away' })) : []),
  ], [s.clients, s.landlords, isQuote]);
  const [cust, setCust] = useState(jp?.owner ?? client ?? customers[0]?.id ?? '');
  const c = customers.find(x => x.id === cust);
  const homes = s.properties.filter(p => p.owner === cust);
  const [site, setSite] = useState(job?.property ?? homes[0]?.id ?? 'other');
  const [siteText, setSiteText] = useState('Same as client address');
  const [email, setEmail] = useState(job?.quoteEmail ?? c?.email ?? ''); const [cc, setCc] = useState(''); const [showCc, setShowCc] = useState(false);
  const [billTo, setBillTo] = useState(job?.billTo ?? (c ? [c.contact !== c.name ? c.contact : '', c.name, ...c.address.split(', ')].filter(Boolean).join('\n') : ''));
  const no = isQuote ? (job?.quoteNo ?? 'Q-' + (2402 + s.jobs.filter(j => j.quoteNo).length)) : nextInvoiceNo(s);
  const [date, setDate] = useState(toInput('15 Oct 2026'));
  const [expiry, setExpiry] = useState(toInput(job?.validUntil ?? plus('15 Oct 2026', 30)));
  const [acceptedBy, setAcceptedBy] = useState(job?.acceptedBy ?? ''); const [acceptedAt, setAcceptedAt] = useState(job?.acceptedAt ? toInput(job.acceptedAt) : '');
  const [terms, setTerms] = useState(c?.kind === 'Landlord' ? 'Due on receipt' : c?.terms === '14 days' ? 'Net 14' : 'Net 30');
  const due = terms === 'Due on receipt' ? fromInput(date) : plus(fromInput(date), terms === 'Net 14' ? 14 : 30);
  const startRows = (): Row[] => { const src = job ? (job.lines?.length ? job.lines : job.price ? jobLines(job) : []) : []; const rows = src.filter(l => l.code !== 'DISCOUNT').map(l => ({ ...l, code: l.code ?? '', key: Math.random().toString(36).slice(2) })); return rows.length ? [...rows, blank()] : [blank(), blank()]; };
  const [rows, setRows] = useState<Row[]>(startRows);
  const [disc, setDisc] = useState(''); const [discMode, setDiscMode] = useState<'%' | '£'>('%');
  const [note, setNote] = useState(job?.quoteNote ?? (isQuote ? 'Price includes parts and labour. Work starts once the quote is accepted. This quote is valid until the expiry date.' : 'Thank you for your business. Please contact us with any questions about this invoice.'));
  const [pay, setPay] = useState(`Please make payment to:\n${COMPANY.name}\n${COMPANY.bank.join('\n')}\nReference: ${no}`);
  const [memo, setMemo] = useState(job?.memo ?? '');
  const [files, setFiles] = useState<{ name: string; size: string; send: boolean }[]>((job?.attachments ?? []).map(n => ({ name: n, size: '460 kB', send: true })));
  const [con, setCon] = useState(job?.contractor ?? 'C4'); const [cost, setCost] = useState(job?.cost ? String(job.cost) : '');
  const [m, setM] = useState<'' | 'preview' | 'send' | { add: string; row: string }>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState<string | null>(null);

  const used = rows.filter(r => r.desc.trim() || r.code?.trim() || r.rate);
  const sub = r2(used.reduce((a, r) => a + r.qty * r.rate, 0));
  const discAmt = r2(+disc > 0 ? (discMode === '%' ? sub * +disc / 100 : +disc) : 0);
  const total = r2(sub - discAmt);
  const lines: Line[] = [...used.map(({ key: _k, ...l }) => ({ ...l, activity: l.activity || l.desc })), ...(discAmt ? [{ code: 'DISCOUNT', activity: 'Discount', desc: discMode === '%' ? `${disc}% discount` : 'Discount', qty: 1, rate: -discAmt }] : [])];
  const costN = +cost || Math.round(total * .7);
  const siteLabel = site === 'other' ? siteText : (() => { const p = L.prop(site); return p ? `${p.address}, ${p.area}` : ''; })();
  const ok = !!c && used.length > 0 && used.every(r => r.desc.trim() && r.qty > 0) && total > 0 && /@/.test(email);
  const title = job ? (isQuote ? job.title : `${job.title} · invoice`) : (isQuote ? 'New quote' : 'New invoice');

  const setRow = (key: string, patch: Partial<Row>) => setRows(rs => { const next = rs.map(r => r.key === key ? { ...r, ...patch } : r); return next[next.length - 1].desc || next[next.length - 1].code ? [...next, blank()] : next; });
  const pick = (key: string, p: Product) => setRow(key, { code: p.code, activity: p.name, desc: p.desc, rate: p.rate });
  const move = (from: string, to: string) => setRows(rs => { const a = [...rs]; const i = a.findIndex(r => r.key === from), k = a.findIndex(r => r.key === to); const [x] = a.splice(i, 1); a.splice(k, 0, x); return a; });

  const saveQuote = (send: boolean, mail?: { to: string; subject: string; body: string }) => {
    const at = nowStamp(); const p = L.prop(site);
    const comm = mail ? [{ id: 'cm' + Date.now(), at, by: ME_NAME, channel: 'Email' as const, dir: 'out' as const, subject: mail.subject, text: `${mail.body.split('\n')[0]} Attached: Quote-${no}.pdf${files.filter(f => f.send).length ? ' and ' + files.filter(f => f.send).map(f => f.name).join(', ') : ''}.` }] : [];
    const patch: Partial<Job> = { lines, price: total, cost: costN, contractor: con, quoteNo: no, quoteNote: note, memo, attachments: files.map(f => f.name), billTo, quoteEmail: email, validUntil: fromInput(expiry), acceptedBy: acceptedBy || undefined, acceptedAt: acceptedAt ? fromInput(acceptedAt) : undefined, ...(send ? { status: 'Quote sent' as const, quoted: at } : {}) };
    let id = job?.id;
    if (job) jobEvent(s, job.id, send ? `Quote ${no} sent: ${money(total)}` : `Quote ${no} saved as a draft`, { ...patch, comms: [...job.comms, ...comm] }, ME_NAME);
    else {
      id = 'J' + (100 + s.jobs.length);
      const title2 = used[0]?.activity || used[0]?.desc || 'Quoted work';
      s.setJobs(js => [{ id: id!, title: title2, property: p?.id ?? homes[0]?.id ?? '', managed: false, reported: at, by: `Client · ${c?.name}`, admin: p?.admin ?? ME, category: 'General', comms: comm, events: [{ at, by: ME_NAME, text: `Quote ${no} created for ${c?.name}` }, ...(send ? [{ at, by: ME_NAME, text: `Quote ${no} sent: ${money(total)}` }] : [])], status: 'New', ...patch } as Job, ...js]);
    }
    s.log(send ? `Sent quote ${no} (${money(total)}) to ${c?.name}` : `Saved quote ${no} as a draft for ${c?.name}`, 'Clients');
    s.toast(send ? `Quote ${no} sent to ${mail?.to}` : `Quote ${no} saved as a draft`);
    s.go('clients', id);
  };
  const saveInvoice = (send: boolean, mail?: { to: string; subject: string; body: string }) => {
    if (!send) { if (job) { jobEvent(s, job.id, 'Invoice draft saved', { lines }, ME_NAME); s.toast('Invoice draft saved'); back(); } return; }
    const inv: Invoice = { id: no, to: cust, toKind: c!.kind, job: job?.id, amount: total, paid: 0, terms: terms === 'Due on receipt' ? 'Straight away' : terms.replace('Net ', '') + ' days', issued: fromInput(date), due, overdue: false, site: siteLabel, note, memo, attachments: files.map(f => f.name), billTo, items: lines.map(l => ({ code: l.code, activity: l.activity, desc: l.desc, qty: l.qty, rate: l.rate, amount: r2(l.qty * l.rate) })) };
    s.setInvoices(is => [inv, ...is]);
    if (job) jobEvent(s, job.id, `Invoice ${no} sent to ${c?.name}`, { status: 'Invoiced', invoice: no, lines, comms: [...job.comms, { id: 'cm' + Date.now(), at: nowStamp(), by: ME_NAME, channel: 'Email', dir: 'out', subject: mail?.subject, text: `Invoice ${no} for ${money(total)} sent with the PDF attached.` }] }, ME_NAME);
    s.log(`Sent invoice ${no} (${money(total)}) to ${c?.name}`, 'Rent & Invoices'); s.toast(`Invoice ${no} sent to ${mail?.to}`);
    back();
  };

  const paper = <DocSheet kind={isQuote ? 'QUOTE' : 'INVOICE'} to={{ label: isQuote ? 'Quote for' : 'Invoice to', rows: billTo.split('\n') }}
    meta={isQuote ? [['Quote', no], ['Date', ddmm(fromInput(date))], ['Valid until', ddmm(fromInput(expiry))]] : [['Invoice', no.replace('INV-', '')], ['Date', ddmm(fromInput(date))], ['Terms', terms], ['Due date', ddmm(due)]]}
    site={siteLabel} lines={lines} foot={discAmt ? [['Subtotal', '£' + num(sub)], ['Discount', '−£' + num(discAmt)], [isQuote ? 'Quote total' : 'Balance due', '£' + num(total)]] : [[isQuote ? 'Quote total' : 'Balance due', '£' + num(total)]]}>
    {note && <p className="doc-note">{note}</p>}{!isQuote && pay && <p className="doc-note" style={{ whiteSpace: 'pre-line' }}>{pay}</p>}
  </DocSheet>;

  return <>
    <PageHeader crumbs={isQuote ? crumbsFor('clients', s.go, title) : crumbsFor(job ? (job.managed ? 'jobs' : 'clients') : 'rent', s.go, title)} back={back} title={isQuote ? (job?.quoteNo ? `Quote ${no}` : 'Create quote') : 'Create invoice'}
      action={<Chip tone={isQuote ? 'brand' : 'info'}>{isQuote ? 'Quote' : 'Invoice'} {no}</Chip>} />
    <section className="card edoc">
      <div className="edoc-top">
        <div className="col" style={{ gap: 12 }}>
          <Field label="Customer">{job ? <div className="ro">{c?.name}</div> : <Select value={cust} onChange={v => { setCust(v); const x = customers.find(y => y.id === v); setEmail(x?.email ?? ''); setBillTo(x ? [x.contact !== x.name ? x.contact : '', x.name, ...x.address.split(', ')].filter(Boolean).join('\n') : ''); setSite(s.properties.find(p => p.owner === v)?.id ?? 'other'); }} options={customers.map(x => ({ value: x.id, label: `${x.name}${!isQuote ? ` · ${x.kind}` : ''}` }))} />}</Field>
          <Field label="Customer email"><Text value={email} onChange={setEmail} /></Field>
          {showCc ? <Field label="Cc"><Text value={cc} onChange={setCc} placeholder="name@company.co.uk" /></Field> : <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setShowCc(true)}>Add Cc</button>}
          <Field label="Bill to"><Area value={billTo} onChange={setBillTo} /></Field>
        </div>
        <div className="col" style={{ gap: 12 }}>
          <Field label={isQuote ? 'Quote no.' : 'Invoice no.'}><div className="ro">{no}</div></Field>
          <Field label={isQuote ? 'Quote date' : 'Invoice date'}><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
          {isQuote ? <Field label="Expiry date"><input className="input" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></Field>
            : <><Field label="Terms"><Select value={terms} onChange={setTerms} options={['Due on receipt', 'Net 14', 'Net 30'].map(x => ({ value: x, label: x }))} /></Field><Field label="Due date"><div className="ro">{due}</div></Field></>}
        </div>
        <div className="col" style={{ gap: 12 }}>
          {isQuote ? <><Field label="Accepted by"><Text value={acceptedBy} onChange={setAcceptedBy} placeholder="Filled in when the client accepts" /></Field><Field label="Accepted date"><input className="input" type="date" value={acceptedAt} onChange={e => setAcceptedAt(e.target.value)} /></Field></>
            : <Field label="Job"><div className="ro">{job ? `${job.title} · ${jp?.address}` : 'Not linked to a job'}</div></Field>}
          <Field label="Site address">{job ? <div className="ro">{siteLabel}</div> : <Select value={site} onChange={setSite} options={[...homes.map(h => ({ value: h.id, label: `${h.address}, ${h.area}` })), { value: 'other', label: 'Other address' }]} />}</Field>
          {site === 'other' && !job && <Text value={siteText} onChange={setSiteText} />}
        </div>
      </div>

      <div className="edoc-sec">
        <div className="flex between"><b className="h2">Product or service</b><span className="caption">Type a code or a name. Codes are for staff. The customer sees the name and description.</span></div>
        <div className="etable">
          <div className="ehead"><span /><span>#</span><span>Product / service</span><span>Description</span><span className="r">Qty</span><span className="r">Rate</span><span className="r">Amount</span><span /></div>
          {rows.map((r, i) => <div key={r.key} className={`erow${drag === r.key ? ' dragging' : ''}`} draggable onDragStart={() => setDrag(r.key)} onDragEnd={() => setDrag(null)} onDragOver={e => { e.preventDefault(); if (drag && drag !== r.key) move(drag, r.key); }}>
            <span className="egrip" title="Drag to reorder"><GripVertical size={15} /></span>
            <span className="caption">{i + 1}</span>
            <ProductBox value={r.code ?? ''} name={r.activity} onType={v => setRow(r.key, { code: v })} onPick={p => pick(r.key, p)} onAdd={v => setM({ add: v, row: r.key })} />
            <textarea aria-label="Description" rows={1} value={r.desc} onChange={e => setRow(r.key, { desc: e.target.value })} placeholder="Description the customer sees" />
            <input aria-label="Quantity" type="number" min={0} value={r.qty} onChange={e => setRow(r.key, { qty: +e.target.value })} className="r" />
            <input aria-label="Rate" type="number" step="0.01" value={r.rate} onChange={e => setRow(r.key, { rate: +e.target.value })} className="r" />
            <b className="r">{money(r2(r.qty * r.rate))}</b>
            <button className="qdel" aria-label="Remove line" disabled={rows.length < 2} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><Trash2 size={15} /></button>
          </div>)}
        </div>
        <div className="flex wrap" style={{ gap: 8 }}><Btn sm kind="outline" icon={<Plus size={14} />} onClick={() => setRows(rs => [...rs, blank()])}>Add product or service</Btn><Btn sm kind="ghost" onClick={() => setRows([blank(), blank()])}>Clear all lines</Btn><Btn sm kind="ghost" icon={<Package size={14} />} onClick={() => setM({ add: '', row: '' })}>New product or service</Btn></div>
      </div>

      <div className="edoc-bottom">
        <div className="col" style={{ gap: 14 }}>
          <Field label="Note to customer (shown on the document)"><Area value={note} onChange={setNote} /></Field>
          {!isQuote && <Field label="Payment instructions"><Area value={pay} onChange={setPay} /></Field>}
          <Field label="Memo (hidden · staff only)"><Area value={memo} onChange={setMemo} placeholder="Not shown on the document. Appears on the statement and in history." /></Field>
          <div className="stack" style={{ gap: 8 }}>
            <div className="flex between"><b className="small" style={{ color: 'var(--text-primary)' }}>Attachments</b>{files.length > 0 && <label className="check"><input type="checkbox" checked={files.every(f => f.send)} onChange={e => setFiles(fs => fs.map(f => ({ ...f, send: e.target.checked })))} /> Select all</label>}</div>
            {files.map((f, i) => <div key={f.name + i} className="eatt"><label className="check"><input type="checkbox" checked={f.send} onChange={e => setFiles(fs => fs.map((x, k) => k === i ? { ...x, send: e.target.checked } : x))} /> Attach to email</label><span className="grow"><FileText size={14} /> <b>{f.name}</b> <span className="caption">{f.size}</span></span><button className="qdel" aria-label="Remove attachment" onClick={() => setFiles(fs => fs.filter((_, k) => k !== i))}><X size={14} /></button></div>)}
            <button type="button" className="dropzone" style={{ padding: 14, minHeight: 84 }} onClick={() => fileRef.current?.click()}><Paperclip size={18} /><b>Add attachment</b><span className="caption">Photos, reports or drawings · max 20 MB</span></button>
            <input ref={fileRef} type="file" multiple hidden aria-label="Attachments" onChange={e => { const fs = Array.from(e.target.files ?? []); setFiles(x => [...x, ...fs.map(f => ({ name: f.name, size: `${Math.max(1, Math.round(f.size / 1024))} kB`, send: true }))]); e.target.value = ''; }} />
          </div>
        </div>
        <div className="col" style={{ gap: 14 }}>
          <div className="etotals">
            <div><span>Subtotal</span><b>{money(sub)}</b></div>
            <div><span>Discount</span><span className="flex" style={{ gap: 6 }}><span className="eseg">{(['%', '£'] as const).map(x => <button key={x} className={discMode === x ? 'on' : ''} onClick={() => setDiscMode(x)}>{x}</button>)}</span><input aria-label="Discount" value={disc} onChange={e => setDisc(e.target.value)} placeholder="0" /></span><b>{discAmt ? '−' + money(discAmt) : money(0)}</b></div>
            <div className="big"><span>{isQuote ? 'Quote total' : 'Balance due'}</span><b>{money(total)}</b></div>
          </div>
          {isQuote && <Card className="flat" title="Staff only" sub="Not on the quote.">
            <Field label="Contractor"><Select value={con} onChange={setCon} options={s.contractors.filter(x => x.type === 'Trade').map(x => ({ value: x.id, label: `${x.name} · ${x.trade}${x.status !== 'Active' ? ' (paused)' : ''}`, disabled: x.status !== 'Active' }))} /></Field>
            <Field label="Contractor cost (£)"><Text value={cost} onChange={setCost} placeholder={String(Math.round(total * .7))} /></Field>
            {total - costN >= 0 ? <Note tone="ok">LSP margin {money(r2(total - costN))}.</Note> : <Note tone="err">The total is lower than the contractor's cost.</Note>}
          </Card>}
        </div>
      </div>
    </section>
    <div className="ebar">
      <Btn kind="ghost" onClick={back}>Cancel</Btn>
      <div className="grow" />
      {(isQuote || job) && <Btn kind="outline" icon={<Save size={16} />} disabled={!c || !used.length} onClick={() => isQuote ? saveQuote(false) : saveInvoice(false)}>Save draft</Btn>}
      <Btn kind="outline" icon={<Eye size={16} />} disabled={!used.length} onClick={() => setM('preview')}>Preview</Btn>
      <Btn icon={<Send size={16} />} disabled={!ok} onClick={() => setM('send')}>Save and send</Btn>
    </div>
    {m === 'preview' && <Modal wide title={`Preview · ${isQuote ? 'Quote' : 'Invoice'} ${no}`} sub="This is the PDF the customer receives." onClose={() => setM('')} footer={<><Btn kind="outline" onClick={() => setM('')}>Back to edit</Btn><Btn icon={<Send size={16} />} disabled={!ok} onClick={() => setM('send')}>Save and send</Btn></>}>{paper}</Modal>}
    {m === 'send' && <SendEmail kind={kind} no={no} to={email} cc={cc} name={c?.contact ?? c?.name ?? ''} total={total} expiry={fromInput(expiry)} due={due} files={files.filter(f => f.send).map(f => f.name)} onClose={() => setM('')} onSend={mail => { setM(''); isQuote ? saveQuote(true, mail) : saveInvoice(true, mail); }} />}
    {typeof m === 'object' && <AddProduct code={m.add} onClose={() => setM('')} onSave={p => { s.setCatalogue(cs => [...cs, p]); if (m.row) pick(m.row, p); s.log(`Saved new product or service ${p.code} (${p.name})`, 'Products'); s.toast(`${p.code} saved. Next time it fills in by itself.`); setM(''); }} />}
  </>;
}

/* ---- product or service picker: search saved items by code or name, or add a new one ---- */
function ProductBox({ value, name, onType, onPick, onAdd }: { value: string; name: string; onType: (v: string) => void; onPick: (p: Product) => void; onAdd: (v: string) => void }) {
  const s = useStore(); const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const list = s.catalogue.filter(p => !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)).slice(0, 8);
  const exact = s.catalogue.some(p => p.code.toLowerCase() === q);
  const hl = (t: string) => { if (!q) return t; const i = t.toLowerCase().indexOf(q); return i < 0 ? t : <>{t.slice(0, i)}<b>{t.slice(i, i + q.length)}</b>{t.slice(i + q.length)}</>; };
  return <div className="ecombo">
    <div className="ecombo-in"><input aria-label="Product or service" value={value} placeholder="Code or name" onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 160)} onChange={e => { onType(e.target.value.toUpperCase()); setOpen(true); }} /><ChevronDown size={14} /></div>
    {name && value && <span className="caption ellip">{name}</span>}
    {open && <div className="ecombo-pop">
      {list.map(p => <button key={p.code} onMouseDown={e => e.preventDefault()} onClick={() => { onPick(p); setOpen(false); }}><span className="ec-code">{hl(p.code)}</span><span className="stack"><span>{hl(p.name)}</span><em>{p.kind} · {money(p.rate)}</em></span></button>)}
      {!list.length && <span className="ec-empty"><Search size={13} /> No saved product matches “{value}”.</span>}
      {q && !exact && <button className="ec-add" onMouseDown={e => e.preventDefault()} onClick={() => { onAdd(value); setOpen(false); }}><Plus size={14} /> Add “{value}” as a new product or service</button>}
    </div>}
  </div>;
}

function AddProduct({ code, onClose, onSave }: { code: string; onClose: () => void; onSave: (p: Product) => void }) {
  const s = useStore();
  const [f, setF] = useState({ code: code.toUpperCase(), name: '', desc: '', rate: '', kind: 'Material' as Product['kind'] });
  const dup = s.catalogue.some(p => p.code.toLowerCase() === f.code.trim().toLowerCase());
  return <Modal title="New product or service" sub="Saved to your list. Next time, type the code and the name, description and rate fill in by themselves." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Save size={16} />} disabled={!f.code.trim() || !f.name.trim() || dup} onClick={() => onSave({ code: f.code.trim().toUpperCase(), name: f.name.trim(), desc: f.desc.trim() || f.name.trim(), rate: +f.rate || 0, kind: f.kind })}>Save and use</Btn></>}>
    <div className="grid g2"><Field label="Code (staff only)"><Text value={f.code} onChange={v => setF({ ...f, code: v.toUpperCase() })} placeholder="e.g. DS/2G/WHT" /></Field><Field label="Type"><Select value={f.kind} onChange={v => setF({ ...f, kind: v as Product['kind'] })} options={['Material', 'Service', 'Labour'].map(x => ({ value: x, label: x }))} /></Field></div>
    <Field label="Name the customer sees"><Text value={f.name} onChange={v => setF({ ...f, name: v })} placeholder="e.g. Double socket supply and fit" /></Field>
    <Field label="Description"><Area value={f.desc} onChange={v => setF({ ...f, desc: v })} placeholder="e.g. 13 Amp 2 gang double switched socket, supply and fit" /></Field>
    <Field label="Default rate (£)"><Text value={f.rate} onChange={v => setF({ ...f, rate: v })} placeholder="0.00" /></Field>
    {dup && <Note tone="err">{f.code} is already saved. Pick it from the list.</Note>}
  </Modal>;
}

/* ---- email with the PDF, attachments and the LSP signature ---- */
function SendEmail({ kind, no, to, cc, name, total, expiry, due, files, onClose, onSend }: { kind: Kind; no: string; to: string; cc: string; name: string; total: number; expiry: string; due: string; files: string[]; onClose: () => void; onSend: (m: { to: string; subject: string; body: string }) => void }) {
  const s = useStore(); const me = s.staff.find(x => x.id === ME);
  const isQuote = kind === 'quote'; const first = name.split(' ')[0] || 'there';
  const [t, setT] = useState(to); const [c2, setC2] = useState(cc);
  const [subject, setSubject] = useState(`${isQuote ? 'Quote' : 'Invoice'} ${no} from ${COMPANY.name}`);
  const [body, setBody] = useState(isQuote
    ? `Dear ${first},\n\nPlease find attached our quote ${no} for ${money(total)}. It is valid until ${expiry}.\n\nTo go ahead, reply to this email or accept it in your client portal. If you have any questions, just let me know.\n\nKind regards,`
    : `Dear ${first},\n\nPlease find attached invoice ${no} for ${money(total)}, due on ${due}.\n\nPayment details are on the invoice. Thank you for your business.\n\nKind regards,`);
  const all = [`${isQuote ? 'Quote' : 'Invoice'}-${no}.pdf`, ...files];
  return <Modal wide title={`Send ${isQuote ? 'quote' : 'invoice'} ${no}`} sub="Sent from LSP's Outlook. A copy is saved in the history." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Back</Btn><Btn icon={<Send size={16} />} disabled={!/@/.test(t) || !subject.trim()} onClick={() => onSend({ to: t, subject, body })}>Send</Btn></>}>
    <div className="email">
      <div className="email-row"><span>From</span><b>{me?.name} &lt;{me?.email}&gt;</b></div>
      <div className="email-row"><span>To</span><input aria-label="To" value={t} onChange={e => setT(e.target.value)} /></div>
      <div className="email-row"><span>Cc</span><input aria-label="Cc" value={c2} onChange={e => setC2(e.target.value)} placeholder="Optional" /></div>
      <div className="email-row"><span>Subject</span><input aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)} /></div>
      <div className="email-att">{all.map((f, i) => <span key={f + i} className="email-chip"><FileText size={13} />{f}{i === 0 && <em>PDF</em>}</span>)}</div>
      <textarea aria-label="Message" className="email-body" value={body} onChange={e => setBody(e.target.value)} />
      <div className="sig">
        <div className="sig-main"><b>{me?.name}</b><span>{me?.role} · {COMPANY.name}</span><span><Mail size={12} /> {me?.email} · {me?.phone}</span><span>lsp.co.uk · {COMPANY.address.join(', ')}</span></div>
        <img src="images/logo.svg" alt="Landlord Service Plans" />
        <p className="sig-legal">{COMPANY.reg}. This email and any attachments are confidential and meant only for the person they are addressed to. If you received it by mistake, please tell us and delete it.</p>
      </div>
    </div>
    <span className="caption"><Upload size={12} /> {PORTAL === 'oa' ? 'Sent by you as the Office Admin.' : 'Sent by you as the Supervisor.'}</span>
  </Modal>;
}

/** Route detail for the editor pages: "quote~<job|new>[~client]" or "invoice~<job|new>". */
export const editorLink = (kind: Kind, job?: string, client?: string) => [kind, job ?? 'new', ...(client ? [client] : [])].join('~');
export function EditorRoute({ detail, ctx }: { detail: string; ctx: 'clients' | 'jobs' | 'rent' }) {
  const s = useStore();
  const [kind, target, client] = detail.split('~') as [Kind, string, string | undefined];
  const back = () => target !== 'new' ? s.go(ctx === 'rent' ? 'jobs' : ctx, target) : client ? s.go('clients', client) : s.go(ctx);
  return <DocEditor kind={kind} target={target} client={client} back={back} />;
}
