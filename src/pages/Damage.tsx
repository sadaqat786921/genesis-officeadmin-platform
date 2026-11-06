import { useRef, useState } from 'react';
import { Plus, Send, Hammer, CheckCircle2, XCircle, MessageSquareWarning, Download, Pencil, PoundSterling, Wallet, Trash2, Image as ImageIcon, Eye, BellRing, ArrowRight } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { ME_NAME, nowStamp, parseDate, fmtDate, type Line, type Property, type Tenant } from '../data';
import { ActionCard, Avatar, Btn, Card, Chip, DetailHead, Empty, Field, HSteps, KV, Modal, Note, Reason, Select, Text, Area, Timeline, When } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { DocSheet, downloadPdf } from './docs';
import { HomeCard } from './shared';
import { DAMAGE_STEPS, DAMAGE_OPEN, damageStep, damageTotal, damageTone, damageLabel, type Damage, type DamageSource, type DamageStatus } from '../damage';

/* Tenant damage (staff portals): report damage the tenant caused, send them a quote, then record
   their answer and how it was paid. Shown on the tenant's page and on the managed property page.
   Paid by the tenant. Never taken from the landlord's maintenance budget. */

type S = ReturnType<typeof useStore>;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ddmm = (v: string) => { const d = parseDate(v); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const plusDays = (v: string, n: number) => { const d = parseDate(v); d.setDate(d.getDate() + n); return fmtDate(d); };
export const nextDamageNo = (s: S) => 'DQ-' + (1000 + s.damages.length + 1);

function dmEvent(s: S, id: string, text: string, patch: Partial<Damage> = {}, by = ME_NAME) {
  s.setDamages(ds => ds.map(x => x.id === id ? { ...x, ...patch, events: [...x.events, { at: nowStamp(), by, text }] } : x));
}
/** Keep a copy of every damage message on the tenant's communication log. */
function tellTenant(s: S, tenant: string, subject: string, text: string) {
  s.setTenants(ts => ts.map(t => t.id === tenant ? { ...t, comms: [...t.comms, { id: 'cm' + Date.now() + Math.random(), at: nowStamp(), by: ME_NAME, channel: 'Email', dir: 'out', subject, text }] } : t));
}

/* ---------- list: on the tenant page or the property page ---------- */
export function DamageCard({ tenant, property }: { tenant?: Tenant; property?: Property }) {
  const s = useStore(); const L = useLookups();
  const [add, setAdd] = useState(false);
  const list = s.damages.filter(d => (tenant ? d.tenant === tenant.id : true) && (property ? d.property === property.id : true)).sort((a, b) => parseDate(b.found).getTime() - parseDate(a.found).getTime());
  const open = list.filter(d => DAMAGE_OPEN.includes(d.status)); const owed = list.filter(d => ['Quote sent', 'Agreed', 'Disputed'].includes(d.status)).reduce((a, d) => a + damageTotal(d), 0);
  const canAdd = tenant ? tenant.status !== 'Moved out' || !!tenant.moveOut : (property ? s.tenants.some(t => t.property === property.id && t.status !== 'Moved out') : false);
  return <Card title={tenant ? 'Damage' : 'Tenant damage'} sub={`${list.length ? `${open.length} open · ${money(owed)} waiting from ${tenant ? firstOf(tenant.name) : 'tenants'}. ` : ''}When a tenant damages the home, send them a quote for the repair. The tenant pays. It never comes from the landlord's budget.`}
    action={canAdd && <Btn sm icon={<Plus size={14} />} onClick={() => setAdd(true)}>Report damage</Btn>}>
    {list.length ? <div className="tablewrap"><table className="t"><thead><tr><th>Damage</th>{!tenant && <th>Tenant</th>}<th>Quote</th><th>Amount</th><th>Found</th><th>Status</th></tr></thead><tbody>
      {list.map(d => <tr key={d.id} onClick={() => s.go('tenants', d.id)}>
        <td><span className="cell"><span className={`tile t-${damageTone(d.status) === 'neutral' ? 'neutral' : damageTone(d.status)}`} style={{ width: 32, height: 32 }}><Hammer size={15} /></span><span className="stack"><b className="strong">{d.title}</b><span className="caption">{d.room ? d.room + ' · ' : ''}{d.source}</span></span></span></td>
        {!tenant && <td><span className="cell"><Avatar name={L.tenant(d.tenant)?.name ?? ''} />{L.tenant(d.tenant)?.name}</span></td>}
        <td>{d.quoteNo}</td><td><b>{money(damageTotal(d))}</b></td><td><When at={d.found} /></td><td><Chip tone={damageTone(d.status)}>{damageLabel(d.status)}</Chip></td></tr>)}
    </tbody></table></div> : <Empty icon={<Hammer size={22} />}>No damage reported{tenant ? ` for ${firstOf(tenant.name)}` : ' at this home'}.</Empty>}
    {add && <DamageForm tenant={tenant?.id} property={property?.id ?? tenant?.property} onClose={() => setAdd(false)} onSaved={id => { setAdd(false); s.go('tenants', id); }} />}
  </Card>;
}
const firstOf = (n: string) => n.split(' ')[0];

/* ---------- report damage and build the quote ---------- */
type Row = Line & { key: string };
const blank = (): Row => ({ key: Math.random().toString(36).slice(2), activity: '', desc: '', qty: 1, rate: 0 });
export function DamageForm({ tenant, property, damage, onClose, onSaved }: { tenant?: string; property?: string; damage?: Damage; onClose: () => void; onSaved: (id: string) => void }) {
  const s = useStore(); const L = useLookups(); const ref = useRef<HTMLInputElement>(null);
  const homeTenants = s.tenants.filter(t => t.property === (damage?.property ?? property) && (t.status !== 'Moved out' || t.id === tenant || t.id === damage?.tenant));
  const [tid, setTid] = useState(damage?.tenant ?? tenant ?? homeTenants[0]?.id ?? '');
  const t = L.tenant(tid); const p = L.prop(t?.property ?? property);
  const rooms = s.rooms.filter(r => r.property === p?.id);
  const [f, setF] = useState({ title: damage?.title ?? '', note: damage?.note ?? '', room: damage?.room ?? t?.room ?? '', source: (damage?.source ?? 'Reported by staff') as DamageSource, valid: damage?.validUntil ?? plusDays(nowStamp().split(',')[0], 30) });
  const [photos, setPhotos] = useState<string[]>(damage?.photos ?? []);
  const [rows, setRows] = useState<Row[]>(damage ? [...damage.lines.map(l => ({ ...l, key: Math.random().toString(36).slice(2) }))] : [{ ...blank(), activity: 'Labour' }, { ...blank(), activity: 'Materials' }]);
  const [prev, setPrev] = useState(false);
  const used = rows.filter(r => r.desc.trim() && r.rate > 0 && r.qty > 0);
  const lines: Line[] = used.map(({ key: _k, ...l }) => ({ ...l, activity: l.activity || 'Repair' }));
  const total = r2(lines.reduce((a, l) => a + l.qty * l.rate, 0));
  const no = damage?.quoteNo ?? nextDamageNo(s);
  const ok = !!t && f.title.trim() && f.note.trim() && lines.length > 0;
  const setRow = (key: string, patch: Partial<Row>) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  const save = (send: boolean) => {
    if (!t || !p) return; const at = nowStamp();
    const base = { tenant: t.id, property: p.id, room: f.room || undefined, title: f.title.trim(), note: f.note.trim(), source: f.source, photos, lines, quoteNo: no, validUntil: f.valid };
    const sentText = `Quote ${no} (${money(total)}) sent to ${t.name}`;
    let id = damage?.id;
    if (damage) dmEvent(s, damage.id, send ? (damage.status === 'Disputed' ? `Changed the quote after ${firstOf(t.name)} disagreed. ${sentText}` : sentText) : 'Quote changed and saved as a draft', { ...base, ...(send ? { status: 'Quote sent' as DamageStatus, sent: at, disputed: undefined } : {}) });
    else {
      id = 'DM' + (Date.now() % 100000);
      s.setDamages(ds => [{ id: id!, ...base, found: at, status: send ? 'Quote sent' : 'Draft', sent: send ? at : undefined, events: [{ at, by: ME_NAME, text: `Damage reported${f.room ? ' in ' + f.room : ''}${photos.length ? ` with ${photos.length} photo${photos.length > 1 ? 's' : ''}` : ''}` }, ...(send ? [{ at, by: ME_NAME, text: sentText }] : [])] }, ...ds]);
    }
    if (send) tellTenant(s, t.id, `Quote ${no} for damage at ${p.address}`, `We found ${f.title.trim().toLowerCase()}. The repair costs ${money(total)} (quote ${no}, valid until ${f.valid}). Please agree to it or tell us if you disagree in your tenant portal.`);
    s.log(send ? `${sentText} for damage at ${p.address}: ${f.title.trim()}` : `Saved damage quote ${no} as a draft for ${t.name}`, 'Tenants');
    s.toast(send ? `Quote ${no} sent to ${t.name}` : `Quote ${no} saved as a draft`); onSaved(id!);
  };
  return <Modal wide title={damage ? `Change quote ${no}` : 'Report damage and create a quote'} sub={p ? `${p.address}. The tenant gets the quote by email and in their tenant portal.` : 'Choose the tenant.'} onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><div className="grow" /><Btn kind="ghost" icon={<Eye size={16} />} disabled={!lines.length} onClick={() => setPrev(true)}>Preview</Btn>{(!damage || damage.status === 'Draft') && <Btn kind="outline" disabled={!ok} onClick={() => save(false)}>Save draft</Btn>}<Btn icon={<Send size={16} />} disabled={!ok} onClick={() => save(true)}>Send quote to tenant</Btn></>}>
    <div className="grid g3">
      <Field label="Tenant">{tenant || damage ? <div className="ro">{t?.name}</div> : <Select value={tid} onChange={setTid} options={homeTenants.map(x => ({ value: x.id, label: `${x.name}${x.room ? ' · ' + x.room : ''}` }))} />}</Field>
      <Field label="Room"><Select value={f.room} onChange={v => setF({ ...f, room: v })} options={[{ value: '', label: 'Choose the room' }, ...rooms.map(r => ({ value: r.name, label: r.name })), ...(t?.room && !rooms.some(r => r.name === t.room) ? [{ value: t.room, label: t.room }] : [])]} /></Field>
      <Field label="How it was found"><Select value={f.source} onChange={v => setF({ ...f, source: v as DamageSource })} options={['Inspection', 'Repair visit', 'Move-out', 'Reported by staff'].map(x => ({ value: x, label: x }))} /></Field>
    </div>
    <Field label="What is damaged"><Text value={f.title} onChange={v => setF({ ...f, title: v })} placeholder="e.g. Broken kitchen cupboard door" /></Field>
    <Field label="What happened"><Area value={f.note} onChange={v => setF({ ...f, note: v })} placeholder="What you found and why it is the tenant's damage, not normal wear and tear" /></Field>
    <div className="field"><span>Photos</span><div className="flex wrap">{photos.map((x, i) => <span key={x + i} className="chip neutral">{x}<button className="link" aria-label={`Remove ${x}`} onClick={() => setPhotos(ps => ps.filter((_, k) => k !== i))}><XCircle size={12} /></button></span>)}<Btn sm kind="outline" icon={<ImageIcon size={14} />} onClick={() => ref.current?.click()}>Add photos</Btn></div>
      <input ref={ref} type="file" accept="image/*" multiple hidden aria-label="Damage photos" onChange={e => { const fs = Array.from(e.target.files ?? []); setPhotos(ps => [...ps, ...fs.map(x => x.name.replace(/\.[^.]+$/, ''))]); e.target.value = ''; }} /></div>
    <div className="field"><span>Quote for the tenant · {no}</span>
      <div className="tablewrap"><table className="t qrows"><thead><tr><th style={{ width: '22%' }}>Item</th><th>Description</th><th style={{ width: 70 }}>Qty</th><th style={{ width: 100 }}>Rate (£)</th><th style={{ width: 100, textAlign: 'right' }}>Amount</th><th style={{ width: 36 }} /></tr></thead><tbody>
        {rows.map(r => <tr key={r.key} className="static"><td><input className="input" aria-label="Item" value={r.activity} onChange={e => setRow(r.key, { activity: e.target.value })} placeholder="e.g. Labour" /></td><td><input className="input" aria-label="Description" value={r.desc} onChange={e => setRow(r.key, { desc: e.target.value })} placeholder="What the tenant sees" /></td><td><input className="input" aria-label="Quantity" type="number" min={0} value={r.qty} onChange={e => setRow(r.key, { qty: +e.target.value })} /></td><td><input className="input" aria-label="Rate" type="number" step="0.01" value={r.rate || ''} onChange={e => setRow(r.key, { rate: +e.target.value })} placeholder="0.00" /></td><td style={{ textAlign: 'right' }}><b>{money(r2(r.qty * r.rate))}</b></td><td><button className="qdel" aria-label="Remove line" disabled={rows.length < 2} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><Trash2 size={14} /></button></td></tr>)}
      </tbody></table></div>
      <div className="flex between"><Btn sm kind="ghost" icon={<Plus size={14} />} onClick={() => setRows(rs => [...rs, blank()])}>Add a line</Btn><span className="flex" style={{ gap: 10 }}><span className="label">Tenant pays</span><b style={{ fontSize: 18 }}>{money(total)}</b></span></div>
    </div>
    <div className="grid g2"><Field label="Valid until"><Text value={f.valid} onChange={v => setF({ ...f, valid: v })} /></Field><Note>The tenant pays this. It is not taken from {p ? (L.landlord(p.owner)?.name ?? 'the landlord') + "'s" : "the landlord's"} maintenance budget.</Note></div>
    {prev && t && p && <Modal wide title={`Preview · Quote ${no}`} sub="This is what the tenant receives." onClose={() => setPrev(false)} footer={<Btn kind="outline" onClick={() => setPrev(false)}>Back to edit</Btn>}>
      <DamagePaper d={{ id: damage?.id ?? 'new', tenant: t.id, property: p.id, room: f.room, title: f.title, note: f.note, found: damage?.found ?? nowStamp(), source: f.source, photos, lines, quoteNo: no, validUntil: f.valid, status: 'Draft', events: [] }} />
    </Modal>}
  </Modal>;
}

/** The quote on LSP paper, as the tenant sees it. */
export function DamagePaper({ d }: { d: Damage }) {
  const L = useLookups(); const t = L.tenant(d.tenant); const p = L.prop(d.property); const total = damageTotal(d);
  const stamp = d.status === 'Paid' ? { text: 'PAID', tone: 'ok' as const } : d.status === 'From deposit' ? { text: 'FROM DEPOSIT', tone: 'ok' as const } : d.status === 'Agreed' ? { text: 'AGREED', tone: 'info' as const } : d.status === 'Quote sent' || d.status === 'Disputed' ? { text: 'FOR YOUR ANSWER', tone: 'warn' as const } : undefined;
  return <DocSheet kind="DAMAGE QUOTE" to={{ label: 'Quote for', rows: [t?.name ?? '', ...(p ? [p.address + (t?.room ? ', ' + t.room : ''), p.area] : [])] }} site={p ? `${p.address}, ${p.area}${d.room ? ' · ' + d.room : ''}` : ''}
    meta={[['Quote', d.quoteNo], ['Date', ddmm(d.sent ?? d.found)], ['Valid until', d.validUntil ? ddmm(d.validUntil) : '—'], ['Damage', d.title]]} lines={d.lines}
    foot={[['Total', '£' + num(total)], ...(d.status === 'From deposit' ? [['Taken from deposit', '−£' + num(total)], ['To pay', '£0.00']] as [string, string][] : d.status === 'Paid' ? [['Paid', '−£' + num(total)], ['To pay', '£0.00']] as [string, string][] : [['Tenant pays', '£' + num(total)]] as [string, string][])]} stamp={stamp}>
    <p className="doc-note">{d.note} This is damage, not normal wear and tear, so under your tenancy agreement the cost is yours. Agree to the quote or tell us if you disagree. If you do not pay before you move out, it can be taken from your deposit with your agreement or the deposit scheme's decision.</p>
  </DocSheet>;
}

/* ---------- one damage: the quote, what happened and the next step ---------- */
export function DamagePage({ id }: { id: string }) {
  const s = useStore(); const L = useLookups(); const d = s.damages.find(x => x.id === id)!;
  const t = L.tenant(d.tenant); const p = L.prop(d.property); const total = damageTotal(d);
  const [m, setM] = useState<'' | 'edit' | 'agree' | 'dispute' | 'paid' | 'deposit' | 'cancel'>('');
  const ev = (text: string, patch: Partial<Damage> = {}, by = ME_NAME) => { dmEvent(s, id, text, patch, by); s.log(`${d.title} at ${p?.address}: ${text}`, 'Tenants'); s.toast(text); };
  const stopped = d.status === 'Cancelled' ? 'Cancelled' : d.status === 'Disputed' ? 'Tenant disagrees' : undefined;
  const action = (() => {
    switch (d.status) {
      case 'Draft': return <ActionCard text="The quote is saved but not sent. Check it, then send it to the tenant."><Btn block icon={<Send size={16} />} onClick={() => setM('edit')}>Check and send quote</Btn><Btn block kind="ghost" icon={<XCircle size={16} />} onClick={() => setM('cancel')}>Cancel</Btn></ActionCard>;
      case 'Quote sent': return <ActionCard tone="warn" title={`Waiting for ${firstOf(t?.name ?? 'the tenant')}`} text={`Quote ${d.quoteNo} for ${money(total)} sent ${d.sent}. Valid until ${d.validUntil}. The tenant agrees or disagrees in their portal, or by phone or email.`}>
        <Btn block icon={<CheckCircle2 size={16} />} onClick={() => setM('agree')}>Tenant agreed</Btn><Btn block kind="outline" icon={<MessageSquareWarning size={16} />} onClick={() => setM('dispute')}>Tenant disagrees</Btn>
        <Btn block kind="ghost" icon={<BellRing size={16} />} onClick={() => { tellTenant(s, d.tenant, `Reminder: quote ${d.quoteNo}`, `A reminder about quote ${d.quoteNo} for ${money(total)}. Please agree to it or tell us if you disagree.`); ev(`Reminder sent to ${t?.name}`); }}>Send a reminder</Btn></ActionCard>;
      case 'Disputed': return <ActionCard tone="warn" title={`${firstOf(t?.name ?? 'The tenant')} disagrees`} text={`"${d.disputed}". Change the quote and send it again, send it again as it is with an explanation, or cancel the charge.`}>
        <Btn block icon={<Pencil size={16} />} onClick={() => setM('edit')}>Change the quote and resend</Btn><Btn block kind="outline" icon={<Send size={16} />} onClick={() => { tellTenant(s, d.tenant, `Quote ${d.quoteNo}`, `We checked your answer against the move-in report and photos. The quote stays at ${money(total)}.`); ev(`Checked the tenant's answer. Quote ${d.quoteNo} sent again as it is`, { status: 'Quote sent', sent: nowStamp() }); }}>Keep the quote and resend</Btn><Btn block kind="ghost" icon={<XCircle size={16} />} onClick={() => setM('cancel')}>Cancel the charge</Btn></ActionCard>;
      case 'Agreed': return <ActionCard tone="ok" title="Tenant agreed" text={`${t?.name} agreed to pay ${money(total)} on ${d.agreed}. Record the payment when it arrives${t?.moveOut || t?.status !== 'Live' ? ', or take it from the deposit at move-out' : ''}.`}>
        <Btn block icon={<PoundSterling size={16} />} onClick={() => setM('paid')}>Record payment</Btn><Btn block kind="outline" icon={<Wallet size={16} />} onClick={() => setM('deposit')}>Take from the deposit</Btn></ActionCard>;
      case 'Paid': case 'From deposit': return <ActionCard tone="ok" title="Done" text={d.status === 'Paid' ? `${money(total)} paid by ${d.payHow?.toLowerCase()} on ${d.paidAt}.` : `${money(total)} taken from the deposit on ${d.paidAt}.`}><Btn block kind="outline" icon={<Download size={16} />} onClick={() => downloadPdf(s, `Damage quote ${d.quoteNo}`)}>Download quote</Btn></ActionCard>;
      default: return <ActionCard tone="neutral" title="Cancelled" text={[...d.events].reverse().find(e => e.text.startsWith('Cancelled'))?.text ?? 'Nothing to pay.'} />;
    }
  })();
  return <>
    <PageHeader crumbs={crumbsFor('tenants', s.go, `${t?.name ?? ''} · ${d.title}`)} back={() => s.go('tenants', d.tenant)} title={d.title}
      action={<div className="flex"><Btn kind="ghost" icon={<Download size={16} />} onClick={() => downloadPdf(s, `Damage quote ${d.quoteNo}`)}>Quote PDF</Btn>{DAMAGE_OPEN.includes(d.status) && d.status !== 'Agreed' && <Btn kind="outline" icon={<Pencil size={16} />} onClick={() => setM('edit')}>Change quote</Btn>}</div>} />
    <DetailHead media={<span className={`tile t-${damageTone(d.status) === 'neutral' ? 'neutral' : damageTone(d.status)}`} style={{ width: 64, height: 64, borderRadius: 18 }}><Hammer size={28} /></span>} title={`${d.title} · ${money(total)}`}
      chips={<><Chip tone={damageTone(d.status)}>{damageLabel(d.status)}</Chip><Chip tone="neutral" dot={false}>Tenant damage · tenant pays</Chip></>}
      meta={[['Tenant', t?.name ?? ''], ['Home', `${p?.address ?? ''}${d.room ? ' · ' + d.room : ''}`], ['Quote', d.quoteNo], ['Found', d.found]]} />
    <Card><HSteps items={DAMAGE_STEPS} at={damageStep(d)} stopped={stopped} /></Card>
    <div className="dgrid">
      <div className="col">
        <Card title={`Quote ${d.quoteNo}`} sub={d.sent ? `Sent ${d.sent}${d.validUntil ? ' · valid until ' + d.validUntil : ''}` : 'Draft, not sent yet'}><DamagePaper d={d} /></Card>
        <Card title="What happened"><p style={{ margin: 0, lineHeight: 1.6 }}>{d.note}</p>
          {d.photos.length > 0 && <div className="photos">{d.photos.map((x, i) => { const room = s.rooms.find(r => r.property === d.property && r.name === d.room); return <div key={x + i} className="ph" style={{ backgroundImage: `url(${room?.photos[i % Math.max(1, room.photos.length)] ?? `images/home${(i % 3) + 1}.jpg`})` }}><span>{x}</span></div>; })}</div>}
          <KV rows={[['Room', d.room ?? '—'], ['How it was found', d.source], ...(d.inspection ? [['Inspection', <button className="link" onClick={() => s.go('inspections', d.inspection)}>{s.inspections.find(i => i.id === d.inspection)?.kind ?? 'Inspection'} report</button>] as [string, React.ReactNode]] : []), ['Who pays', `${t?.name} (tenant). Not the landlord's budget.`]]} /></Card>
        <Card title="History" sub="Every step, with the date and time."><Timeline items={[...d.events].reverse().map(e => ({ at: e.at, text: e.text, by: e.by }))} /></Card>
      </div>
      <div className="col">
        {action}
        {t && <Card title="Tenant"><div className="flex"><Avatar name={t.name} size="md" /><div className="stack grow"><button className="link" style={{ textAlign: 'left' }} onClick={() => s.go('tenants', t.id)}>{t.name}</button><span className="caption">{t.status} · {t.email}</span></div></div>
          <KV rows={[['Deposit', `${money(t.deposit)} · ${t.depositScheme}`], ['Other damage', String(s.damages.filter(x => x.tenant === t.id && x.id !== d.id).length)]]} />
          <Btn sm kind="ghost" icon={<ArrowRight size={14} />} onClick={() => s.go('tenants', t.id)}>Open tenant</Btn></Card>}
        {p && <HomeCard id={p.id} />}
      </div>
    </div>
    {m === 'edit' && <DamageForm damage={d} onClose={() => setM('')} onSaved={() => setM('')} />}
    {m === 'agree' && <Reason title="Tenant agreed" sub={`Saved with today's date and time. ${t?.name} then pays ${money(total)}.`} cta="Save" label="How did they agree?" options={['Agreed by phone', 'Agreed by email', 'Agreed in person']} onClose={() => setM('')} onDone={r => { ev(`${t?.name} agreed to quote ${d.quoteNo} (${r.toLowerCase()})`, { status: 'Agreed', agreed: nowStamp() }); setM(''); }} />}
    {m === 'dispute' && <Reason title="Tenant disagrees" sub="Write down what they said. Then change the quote, resend it or cancel the charge." cta="Save" label="What did they say?" options={['It was already like this when I moved in', 'It is normal wear and tear', 'The price is too high', 'Someone else caused it']} onClose={() => setM('')} onDone={r => { ev(`${t?.name} disagrees: ${r}`, { status: 'Disputed', disputed: r }); setM(''); }} />}
    {m === 'paid' && <PaidModal total={total} onClose={() => setM('')} onDone={how => { ev(`${money(total)} received by ${how.toLowerCase()}. Marked paid`, { status: 'Paid', paidAt: nowStamp(), payHow: how }); tellTenant(s, d.tenant, `Payment received · ${d.quoteNo}`, `Thank you. We received ${money(total)} for quote ${d.quoteNo}.`); setM(''); }} />}
    {m === 'deposit' && <Modal title="Take it from the deposit" sub={`${money(total)} is taken from ${t?.name}'s ${money(t?.deposit ?? 0)} deposit when it is returned. The tenant has agreed, so the scheme releases it.`} onClose={() => setM('')}
      footer={<><Btn kind="outline" onClick={() => setM('')}>Cancel</Btn><Btn icon={<Wallet size={16} />} onClick={() => { ev(`${money(total)} taken from the deposit (${t?.depositRef})`, { status: 'From deposit', paidAt: nowStamp(), payHow: 'Deposit' }); setM(''); }}>Take {money(total)}</Btn></>}>
      <KV rows={[['Deposit', `${money(t?.deposit ?? 0)} · ${t?.depositScheme} ${t?.depositRef}`], ['Taken for this damage', money(total)], ['Back to the tenant', money(Math.max(0, (t?.deposit ?? 0) - total))]]} /></Modal>}
    {m === 'cancel' && <Reason danger title="Cancel the charge" sub="The tenant is told. Nothing is charged." cta="Cancel the charge" options={['Normal wear and tear after all', 'Was there at move-in', 'Landlord will cover it', 'Sent to the wrong tenant']} onClose={() => setM('')} onDone={r => { tellTenant(s, d.tenant, `Quote ${d.quoteNo} cancelled`, `We have cancelled quote ${d.quoteNo}. There is nothing to pay.`); ev(`Cancelled: ${r}`, { status: 'Cancelled' }); setM(''); }} />}
  </>;
}

function PaidModal({ total, onClose, onDone }: { total: number; onClose: () => void; onDone: (how: 'Bank transfer' | 'Card') => void }) {
  const [how, setHow] = useState<'Bank transfer' | 'Card'>('Bank transfer');
  return <Modal title={`Record ${money(total)} paid`} sub="Check it has arrived in the bank first." onClose={onClose} footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<CheckCircle2 size={16} />} onClick={() => onDone(how)}>Mark paid</Btn></>}>
    <Field label="Paid by"><Select value={how} onChange={v => setHow(v as typeof how)} options={[{ value: 'Bank transfer', label: 'Bank transfer' }, { value: 'Card', label: 'Card (tenant portal)' }]} /></Field>
  </Modal>;
}
