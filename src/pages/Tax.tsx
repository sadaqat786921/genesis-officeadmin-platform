import { useState } from 'react';
import { Globe2, Landmark, FileCheck2, Upload, Calculator, CalendarDays, CheckCircle2, ArrowRight, Send, Users, Pencil, Ban, Plus, Trash2, Download, Settings2, FileText } from 'lucide-react';
import { useStore, useLookups, money, type Route } from '../store';
import { PORTAL, ME, ME_NAME, nowStamp, daysFrom, parseDate, type Landlord, type Property } from '../data';
import { ActionCard, Avatar, Btn, Card, Chip, DetailHead, Empty, Field, KV, Kpi, Modal, Note, PageTabs, Select, Stat, Text, Area, Timeline, When } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';
import { isLeased } from '../pricing';
import {
  useNrl, recordOf, updateRecord, setShares, addCalc, addPay, doneTask, saveSetting, blockOf, taxOf, needsTax, abroadShare, suggestTax, leaseTaxOf, heldIn, quarterOf, overseas, r2,
  STATUS_TEXT, NRL_STATUSES, statusTone, CURRENT_MONTH, QUARTERS, type NrlStatus, type NrlRecord, type Share,
} from '../nrl';

/* Overseas landlords' tax (NRL). Same file in the Supervisor and Office Admin portals.
   Supervisor: decides the status, clears blocked payouts by fixing what is missing, records payments to HMRC, sets the rules.
   Office Admin: records where the landlord lives, uploads HMRC letters and the accountant's figures, and asks the Supervisor to decide. */

type S = ReturnType<typeof useStore>;
const SUP = PORTAL === 'supervisor';
const homesOf = (s: S, id: string) => s.properties.filter(p => p.managed && p.owner === id && !isLeased(p));
const ids = (ps: Property[]) => ps.map(p => p.id);

/* ---------------- small pieces used on other screens ---------------- */
export function TaxChip({ landlord, props }: { landlord: string; props?: string[] }) {
  const st = useNrl(); const rec = recordOf(st, landlord);
  const joint = !needsTax(st, landlord, []) && props && needsTax(st, landlord, props);
  if (rec.status === 'UK resident' && !joint) return null;
  return <Chip tone={joint ? 'brand' : statusTone(rec.status)} dot={false}><Globe2 size={12} /> {joint ? 'Joint owner abroad' : rec.status === 'Review pending' ? 'Tax: review pending' : rec.status === 'HMRC approved' ? 'Abroad · HMRC approved' : 'Abroad · tax kept back'}</Chip>;
}

/** Landlord page › Overview: the overseas tax card. */
export function NrlCard({ l }: { l: Landlord }) {
  const s = useStore(); const st = useNrl(); const rec = recordOf(st, l.id); const props = ids(homesOf(s, l.id));
  const [m, setM] = useState<'' | 'status' | 'letter' | 'calc' | 'where'>('');
  const block = blockOf(st, l.id, props); const joint = rec.status === 'UK resident' && needsTax(st, l.id, props);
  return <Card title="Overseas tax (NRL)" sub="Landlords who live outside the UK: LSP keeps back tax and pays it to HMRC, unless HMRC approves paying in full."
    action={<Btn sm kind="ghost" icon={<ArrowRight size={14} />} onClick={() => s.go('tax', l.id)}>Tax page</Btn>}>
    <div className="flex wrap" style={{ gap: 8 }}><Chip tone={statusTone(rec.status)}>{rec.status}</Chip>{joint && <Chip tone="brand" dot={false}><Users size={12} /> Joint owner abroad</Chip>}{block && <Chip tone="err"><Ban size={12} /> Payout blocked</Chip>}</div>
    <span className="small">{joint ? 'Lives in the UK, but a joint owner of one of the homes lives abroad. Tax is kept back on their share only.' : STATUS_TEXT[rec.status]}</span>
    <KV rows={[['Lives outside the UK', rec.abroad === 'Not sure' ? 'Not sure yet' : rec.abroad], ...(rec.country ? [['Country', `${rec.country}${rec.since ? ` · since ${rec.since}` : ''}`] as [string, string]] : []), ['Decided', rec.decidedBy ? `${rec.decidedBy}, ${rec.decidedAt}` : 'Not decided yet'], ...(rec.from ? [['From', rec.from] as [string, string]] : []), ['Reason', rec.reason ?? '—'],
      ['HMRC letter', rec.letter ? `${rec.letter.ref} · ${rec.letter.date}` : rec.status === 'HMRC approved' ? <b style={{ color: 'var(--err)' }}>Missing</b> : 'Not needed'], ['This month', needsTax(st, l.id, props) ? (rec.calcs.find(c => c.month === CURRENT_MONTH) ? `${money(taxOf(st, l.id, props))} tax kept back` : 'Accountant\'s figure needed') : 'No tax kept back']]} />
    {block && <Note tone="err">Payout blocked: {block.reason}. {block.fix}</Note>}
    {rec.asked && rec.status === 'Review pending' && <Note>{SUP ? 'The Office Admin asked you to decide' : 'Sent to the Supervisor to decide'} on {rec.asked}.</Note>}
    <div className="flex wrap" style={{ gap: 8 }}>
      <Btn sm icon={<Pencil size={14} />} onClick={() => setM('status')}>{SUP ? 'Change status' : 'Ask Supervisor to decide'}</Btn>
      <Btn sm kind="outline" icon={<Globe2 size={14} />} onClick={() => setM('where')}>Where they live</Btn>
      {rec.abroad !== 'No' && <Btn sm kind="outline" icon={<Upload size={14} />} onClick={() => setM('letter')}>{rec.letter ? 'Replace HMRC letter' : 'Upload HMRC letter'}</Btn>}
      {needsTax(st, l.id, props) && <Btn sm kind="outline" icon={<Calculator size={14} />} onClick={() => setM('calc')}>Enter accountant's figure</Btn>}
    </div>
    {m === 'status' && <StatusModal l={l} onClose={() => setM('')} />}
    {m === 'where' && <WhereModal l={l} onClose={() => setM('')} />}
    {m === 'letter' && <LetterModal l={l} onClose={() => setM('')} />}
    {m === 'calc' && <CalcModal l={l} onClose={() => setM('')} />}
  </Card>;
}

/** Property page › Overview: who owns the home and in what share. */
export function OwnersCard({ p }: { p: Property }) {
  const s = useStore(); const L = useLookups(); const st = useNrl(); const ll = L.landlord(p.owner);
  const [edit, setEdit] = useState(false);
  const own = st.shares[p.id] ?? [{ name: ll?.name ?? 'Owner', landlord: p.owner, pct: 100, abroad: recordOf(st, p.owner).abroad === 'Yes', country: recordOf(st, p.owner).country, status: recordOf(st, p.owner).status }];
  const taxed = own.filter(o => o.abroad && o.status === 'Tax kept back').reduce((a, o) => a + o.pct, 0);
  return <Card title="Owners and shares" sub="Who owns this home and how much. Tax is only kept back on the share of an owner who lives abroad." action={<Btn sm kind="ghost" icon={<Pencil size={14} />} onClick={() => setEdit(true)}>Edit</Btn>}>
    <div className="divlist">{own.map((o, i) => <div key={i} className="item"><Avatar name={o.name} /><div className="stack grow"><b>{o.name}{o.landlord ? '' : ' · joint owner'}</b><span className="caption">{o.abroad ? `Lives abroad · ${o.country ?? 'country not given'}` : 'Lives in the UK'}</span></div><b>{o.pct}%</b><Chip tone={statusTone(o.status)}>{o.status}</Chip></div>)}</div>
    <KV rows={[['Responsible LSP company', 'Landlord Service Plans Limited'], ['Tax kept back on', taxed ? `${taxed}% of this home's rent` : 'Nothing']]} />
    {edit && <SharesModal p={p} own={own} onClose={() => setEdit(false)} />}
  </Card>;
}

/** Leased home › Lease tab: tax on the lease rent LSP pays an owner who lives abroad. */
export function LeaseTaxCard({ p }: { p: Property }) {
  const s = useStore(); const L = useLookups(); const st = useNrl(); const o = L.landlord(p.owner); const rec = recordOf(st, p.owner); const rent = p.lease?.rent ?? 0;
  const tax = leaseTaxOf(st, p.owner, { amount: rent });
  return <Card title="Tax on the lease rent" sub="LSP pays the lease rent, so LSP keeps back tax when the owner lives abroad." action={<Btn sm kind="ghost" onClick={() => s.go('tax', p.owner)}>Owner's tax page</Btn>}>
    <div className="flex wrap" style={{ gap: 8 }}><Chip tone={statusTone(rec.status)}>{rec.status}</Chip>{rec.country && <Chip tone="neutral" dot={false}><Globe2 size={12} /> {rec.country}</Chip>}</div>
    <div className="feebox">
      <div><span>Lease rent each month</span><b>{money(rent)}</b></div>
      <div className="muted2"><span>Tax kept back ({tax ? `${st.setting.rate}%` : 'none'})</span><b>− {money(tax)}</b></div>
      <div className="tot"><span>Paid to {o?.name.split(' ')[0] ?? 'the owner'}</span><b>{money(rent - tax)}</b></div>
    </div>
    <KV rows={[['Receives the rent', o?.name ?? '—'], ['UK agent for NRL', 'Landlord Service Plans Limited (LSP pays HMRC)']]} />
    <span className="caption">Tax kept back is paid to HMRC, so it is never shown as money owed to the owner.</span>
  </Card>;
}

/** Shown when someone tries to pay a blocked payout. */
export function BlockedModal({ l, onClose }: { l: Landlord; onClose: () => void }) {
  const s = useStore(); const st = useNrl(); const b = blockOf(st, l.id, ids(homesOf(s, l.id)));
  return <Modal title={`Payout blocked · ${l.name}`} sub="This landlord lives abroad, or might. The payout can't go out until the tax side is sorted." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Close</Btn><Btn icon={<ArrowRight size={16} />} onClick={() => { onClose(); s.go('tax', l.id); }}>Fix it on the tax page</Btn></>}>
    {b && <Note tone="err"><b>{b.reason}.</b> {b.fix}</Note>}
    <span className="small">Once it is fixed the block lifts by itself and the payout can be marked paid.</span>
  </Modal>;
}

/* ---------------- modals ---------------- */
function StatusModal({ l, onClose }: { l: Landlord; onClose: () => void }) {
  const s = useStore(); const st = useNrl(); const rec = recordOf(st, l.id);
  const [v, setV] = useState<NrlStatus>(rec.status === 'Review pending' ? 'Tax kept back' : rec.status); const [why, setWhy] = useState(''); const [from, setFrom] = useState('1 Nov 2026');
  if (!SUP) return <Modal title={`Ask the Supervisor to decide · ${l.name}`} sub="Only the Supervisor decides the tax status. They see what you suggest and your reason." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Send size={16} />} disabled={!why.trim()} onClick={() => {
      const at = nowStamp();
      s.setRequests(rs => [{ id: 'Q' + Date.now(), kind: 'Tax status', from: ME, title: `Decide tax status: ${l.name}`, about: `Suggest "${v}". ${why.trim()}`, at, status: 'Waiting', link: { route: 'tax', id: l.id }, data: { landlord: l.id, status: v } }, ...rs]);
      updateRecord(l.id, { asked: at, status: rec.status === 'UK resident' ? 'Review pending' : rec.status }, ME_NAME, `Asked the Supervisor to decide: suggest ${v}. ${why.trim()}`);
      s.log(`Asked the Supervisor to decide the tax status of ${l.name}`, 'Sent to Supervisor'); s.toast('Sent to the Supervisor'); onClose();
    }}>Send to Supervisor</Btn></>}>
    <Field label="What you suggest"><Select value={v} onChange={x => setV(x as NrlStatus)} options={NRL_STATUSES.map(x => ({ value: x, label: x }))} /></Field>
    <Field label="Why"><Area value={why} onChange={setWhy} placeholder="e.g. Moved to Dubai in September. No HMRC letter yet." /></Field>
    <Note>Until the Supervisor decides, payouts to {l.name.split(' ')[0]} are blocked.</Note>
  </Modal>;
  return <Modal title={`Tax status · ${l.name}`} sub="Saved in the landlord's tax history with your name, the date and the reason." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<CheckCircle2 size={16} />} disabled={!why.trim()} onClick={() => {
      updateRecord(l.id, { status: v, decidedBy: ME_NAME, decidedAt: nowStamp(), reason: why.trim(), from, asked: undefined, abroad: v === 'UK resident' ? 'No' : 'Yes' }, ME_NAME, `${rec.status === v ? 'Confirmed' : `Changed from ${rec.status} to`} ${v} from ${from}: ${why.trim()}`);
      s.log(`Set the tax status of ${l.name} to ${v}`, 'Landlords'); s.toast('Tax status saved'); onClose();
    }}>Save</Btn></>}>
    <div className="grid g2" style={{ gap: 10 }}>{NRL_STATUSES.map(x => <button key={x} className={`choice${v === x ? ' on' : ''}`} onClick={() => setV(x)}><b>{x}</b><span className="caption">{STATUS_TEXT[x]}</span></button>)}</div>
    <div className="grid g2"><Field label="From"><Text value={from} onChange={setFrom} /></Field><Field label="Reason"><Text value={why} onChange={setWhy} placeholder="e.g. HMRC letter NA041872 received" /></Field></div>
    {v === 'HMRC approved' && !rec.letter && <Note tone="warn">Upload HMRC's letter too, or payouts stay blocked.</Note>}
  </Modal>;
}
function WhereModal({ l, onClose }: { l: Landlord; onClose: () => void }) {
  const st = useNrl(); const s = useStore(); const rec = recordOf(st, l.id);
  const [f, setF] = useState({ abroad: rec.abroad, country: rec.country ?? '', since: rec.since ?? '' });
  return <Modal title={`Where ${l.name.split(' ')[0]} lives`} sub="A landlord who lives outside the UK for 6 months or more a year counts as living abroad." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn onClick={() => {
      const pend = f.abroad !== 'No' && rec.status === 'UK resident';
      updateRecord(l.id, { abroad: f.abroad, country: f.abroad === 'No' ? undefined : f.country, since: f.since || undefined, ...(pend ? { status: 'Review pending' as NrlStatus } : {}) }, ME_NAME, `Lives outside the UK: ${f.abroad}${f.country && f.abroad !== 'No' ? ` (${f.country})` : ''}${pend ? '. Set to Review pending' : ''}`);
      s.log(`Updated where ${l.name} lives`, 'Landlords'); s.toast(pend ? 'Saved. Payouts blocked until the Supervisor decides.' : 'Saved'); onClose();
    }}>Save</Btn></>}>
    <Field label="Does this landlord live outside the UK?"><Select value={f.abroad} onChange={v => setF({ ...f, abroad: v as NrlRecord['abroad'] })} options={[{ value: 'No', label: 'No, lives in the UK' }, { value: 'Yes', label: 'Yes' }, { value: 'Not sure', label: 'Not sure yet' }]} /></Field>
    {f.abroad !== 'No' && <div className="grid g2"><Field label="Country and city"><Text value={f.country} onChange={v => setF({ ...f, country: v })} placeholder="e.g. Spain (Málaga)" /></Field><Field label="Since"><Text value={f.since} onChange={v => setF({ ...f, since: v })} placeholder="e.g. Mar 2024" /></Field></div>}
  </Modal>;
}
function LetterModal({ l, onClose }: { l: Landlord; onClose: () => void }) {
  const st = useNrl(); const s = useStore(); const rec = recordOf(st, l.id);
  const [f, setF] = useState({ ref: rec.letter?.ref ?? '', date: rec.letter?.date ?? '', file: '' });
  return <Modal title="Upload HMRC's approval letter" sub="HMRC's letter saying LSP can pay this landlord in full. The earlier letter is kept in the history." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Upload size={16} />} disabled={!f.ref.trim() || !f.date.trim() || !f.file} onClick={() => {
      updateRecord(l.id, { letter: { file: f.file, ref: f.ref.trim(), date: f.date.trim() } }, ME_NAME, `Uploaded HMRC approval letter ${f.ref.trim()} dated ${f.date.trim()}`);
      s.log(`Uploaded HMRC approval letter for ${l.name}`, 'Landlords'); s.toast('HMRC letter saved'); onClose();
    }}>Save letter</Btn></>}>
    <label className="dropzone"><Upload size={20} /><b>{f.file || 'Choose the letter (PDF)'}</b><input type="file" accept=".pdf,image/*" hidden aria-label="HMRC letter" onChange={e => { const x = e.target.files?.[0]; if (x) setF({ ...f, file: x.name }); }} /></label>
    <div className="grid g2"><Field label="HMRC reference"><Text value={f.ref} onChange={v => setF({ ...f, ref: v })} placeholder="e.g. NA041872" /></Field><Field label="Letter date"><Text value={f.date} onChange={v => setF({ ...f, date: v })} placeholder="e.g. 28 Aug 2026" /></Field></div>
  </Modal>;
}
function CalcModal({ l, onClose }: { l: Landlord; onClose: () => void }) {
  const s = useStore(); const st = useNrl(); const props = ids(homesOf(s, l.id));
  const share = abroadShare(st, l.id, props);
  const [f, setF] = useState({ month: CURRENT_MONTH, taxable: '', tax: '', by: 'Ade Accountants', file: '' });
  const sug = f.taxable ? suggestTax(st, +f.taxable || 0, share) : 0;
  return <Modal title={`Accountant's tax figure · ${l.name}`} sub="The accountant works out the tax outside Genesis. Enter their figure and attach their working. It is taken off this month's payout." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Calculator size={16} />} disabled={!f.taxable || !f.tax || !f.file} onClick={() => {
      addCalc(l.id, { month: f.month, taxable: +f.taxable, tax: r2(+f.tax), by: f.by, at: nowStamp(), file: f.file }, ME_NAME);
      s.log(`Entered the ${f.month} tax figure for ${l.name}: ${money(+f.tax)}`, 'Landlords'); s.toast(`Saved. ${money(+f.tax)} is kept back from ${f.month}.`); onClose();
    }}>Save figure</Btn></>}>
    <div className="grid g2">
      <Field label="Month"><Select value={f.month} onChange={v => setF({ ...f, month: v })} options={['Oct 2026', 'Nov 2026', 'Dec 2026'].map(x => ({ value: x, label: x }))} /></Field>
      <Field label="Accountant"><Text value={f.by} onChange={v => setF({ ...f, by: v })} /></Field>
      <Field label="Rent after expenses (£)" hint="Rent collected minus the LSP fee and repairs paid"><Text value={f.taxable} onChange={v => setF({ ...f, taxable: v.replace(/[^0-9.]/g, '') })} /></Field>
      <Field label="Tax to keep back (£)" hint={sug ? `Check: ${st.setting.rate}%${share < 1 ? ` of the ${Math.round(share * 100)}% share abroad` : ''} = ${money(sug)}` : undefined}><Text value={f.tax} onChange={v => setF({ ...f, tax: v.replace(/[^0-9.]/g, '') })} /></Field>
    </div>
    {sug > 0 && !f.tax && <button className="btn ghost sm" onClick={() => setF({ ...f, tax: String(sug) })}>Use {money(sug)}</button>}
    <label className="dropzone"><Upload size={20} /><b>{f.file || "Attach the accountant's working (PDF)"}</b><input type="file" accept=".pdf,.xlsx,image/*" hidden aria-label="Accountant's working" onChange={e => { const x = e.target.files?.[0]; if (x) setF({ ...f, file: x.name }); }} /></label>
  </Modal>;
}
function SharesModal({ p, own, onClose }: { p: Property; own: Share[]; onClose: () => void }) {
  const s = useStore(); const [rows, setRows] = useState<Share[]>(own); const total = rows.reduce((a, x) => a + (+x.pct || 0), 0);
  const up = (i: number, patch: Partial<Share>) => setRows(rs => rs.map((x, k) => k === i ? { ...x, ...patch } : x));
  return <Modal wide title={`Owners and shares · ${p.address}`} sub="Shares must add up to 100%. An owner living abroad has their own tax status." onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn disabled={total !== 100 || rows.some(r => !r.name.trim())} onClick={() => { setShares(p.id, rows); s.log(`Updated the owners and shares of ${p.address}`, 'Properties'); s.toast('Owners saved'); onClose(); }}>Save</Btn></>}>
    {rows.map((r, i) => <div key={i} className="grid g4" style={{ gap: 10, alignItems: 'end' }}>
      <Field label={i === 0 ? 'Owner' : 'Joint owner'}><Text value={r.name} onChange={v => up(i, { name: v })} /></Field>
      <Field label="Share (%)"><Text value={String(r.pct)} onChange={v => up(i, { pct: +v.replace(/\D/g, '') || 0 })} /></Field>
      <Field label="Lives"><Select value={r.abroad ? 'abroad' : 'uk'} onChange={v => up(i, { abroad: v === 'abroad', status: v === 'abroad' ? 'Review pending' : 'UK resident' })} options={[{ value: 'uk', label: 'In the UK' }, { value: 'abroad', label: 'Abroad' }]} /></Field>
      <div className="flex" style={{ gap: 6 }}>{r.abroad ? <Select value={r.status} onChange={v => up(i, { status: v as NrlStatus })} options={NRL_STATUSES.filter(x => x !== 'UK resident').map(x => ({ value: x, label: x }))} /> : <span className="caption">No tax</span>}{i > 0 && <button className="link" aria-label="Remove owner" onClick={() => setRows(rs => rs.filter((_, k) => k !== i))}><Trash2 size={14} /></button>}</div>
    </div>)}
    <div className="flex between"><Btn sm kind="ghost" icon={<Plus size={14} />} onClick={() => setRows(rs => [...rs, { name: '', pct: 0, abroad: false, status: 'UK resident' }])}>Add joint owner</Btn><Chip tone={total === 100 ? 'ok' : 'err'}>Total {total}%</Chip></div>
  </Modal>;
}
function PayModal({ quarter, owed, onClose }: { quarter: string; owed: number; onClose: () => void }) {
  const s = useStore(); const [f, setF] = useState({ amount: String(owed), date: '15 Oct 2026', ref: '' });
  return <Modal title={`Record payment to HMRC · ${quarter}`} sub={`Due ${quarterOf(quarter.split(' ')[0].split('–')[1] + ' ' + quarter.split(' ')[1]).due}. Recording it here does not move money.`} onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Landmark size={16} />} disabled={!+f.amount || !f.ref.trim()} onClick={() => {
      addPay({ id: 'HP' + Date.now(), quarter, paid: r2(+f.amount), paidAt: f.date, ref: f.ref.trim(), by: ME_NAME });
      s.log(`Recorded ${money(+f.amount)} paid to HMRC for ${quarter}`, 'Rent & Invoices'); s.toast('Payment to HMRC saved'); onClose();
    }}>Save payment</Btn></>}>
    <div className="grid g3"><Field label="Amount (£)"><Text value={f.amount} onChange={v => setF({ ...f, amount: v.replace(/[^0-9.]/g, '') })} /></Field><Field label="Paid on"><Text value={f.date} onChange={v => setF({ ...f, date: v })} /></Field><Field label="HMRC reference"><Text value={f.ref} onChange={v => setF({ ...f, ref: v })} placeholder="e.g. HMRC NRL Q2 · 8120" /></Field></div>
  </Modal>;
}

/* ---------------- the Overseas Tax page ---------------- */
export function Tax() {
  const s = useStore();
  if (s.detail && s.landlords.some(l => l.id === s.detail)) return <OwnerTax id={s.detail} />;
  return <TaxHome />;
}

function TaxHome() {
  const s = useStore(); const L = useLookups(); const st = useNrl();
  const [tab, setTab] = useState<'owners' | 'hmrc' | 'deadlines'>(s.detail === 'hmrc' ? 'hmrc' : s.detail === 'deadlines' ? 'deadlines' : 'owners');
  const [pay, setPay] = useState<{ q: string; owed: number } | null>(null);
  const ownerOf = (pid: string) => L.prop(pid)?.owner;
  const recs = s.landlords.map(l => ({ l, rec: recordOf(st, l.id), props: ids(homesOf(s, l.id)) })).filter(x => x.rec.abroad !== 'No' || x.rec.status !== 'UK resident' || needsTax(st, x.l.id, x.props) || s.properties.some(p => isLeased(p) && p.owner === x.l.id && x.rec.status === 'Tax kept back'));
  const blocked = recs.filter(x => blockOf(st, x.l.id, x.props));
  const qs = QUARTERS.map(q => { const h = heldIn(st, q, s.leasePays, ownerOf); const paid = st.pays.filter(p => p.quarter === q).reduce((a, p) => a + p.paid, 0); return { q, ...h, paid: r2(paid), owed: r2(h.total - paid), due: quarterOf(q.split(' ')[0].split('–')[1] + ' ' + q.split(' ')[1]).due }; });
  const owed = qs.reduce((a, x) => a + Math.max(0, x.owed), 0);
  const next = st.tasks.filter(t => !t.done).sort((a, b) => daysFrom(a.due) - daysFrom(b.due))[0];
  return <>
    <PageHeader crumbs={crumbsFor('tax' as Route, s.go)} title="Overseas Tax" />
    <div className="grid g4">
      <Kpi icon={<Globe2 size={18} />} tone="brand" label="Landlords abroad" value={recs.length} caption={`${recs.filter(x => x.rec.status === 'Tax kept back' || needsTax(st, x.l.id, x.props)).length} with tax kept back`} active={tab === 'owners'} onClick={() => setTab('owners')} />
      <Kpi icon={<Ban size={18} />} tone={blocked.length ? 'err' : 'ok'} label="Payouts blocked" value={blocked.length} caption={blocked.length ? 'something missing' : 'nothing blocked'} onClick={() => setTab('owners')} />
      <Kpi icon={<Landmark size={18} />} tone="warn" label="Owed to HMRC" value={money(owed)} caption="tax kept back, not paid yet" active={tab === 'hmrc'} onClick={() => setTab('hmrc')} />
      <Kpi icon={<CalendarDays size={18} />} tone="info" label="Next deadline" value={next ? next.due.replace(' 2026', '') : '—'} caption={next?.title ?? 'nothing due'} active={tab === 'deadlines'} onClick={() => setTab('deadlines')} />
    </div>
    <PageTabs value={tab} onChange={setTab} items={[{ id: 'owners', label: 'Landlords abroad', count: recs.length }, { id: 'hmrc', label: 'HMRC payments' }, { id: 'deadlines', label: 'Deadlines', count: st.tasks.filter(t => !t.done).length }]} />
    {tab === 'owners' && <Card title="Landlords who live abroad" sub="Everyone with tax kept back, HMRC approval, or a status still to decide. A blocked payout says what is missing.">
      <div className="tablewrap"><table className="t"><thead><tr><th>Landlord</th><th>Lives in</th><th>Status</th><th>HMRC letter</th><th>{CURRENT_MONTH} tax</th><th>Payout</th><th /></tr></thead><tbody>
        {recs.map(({ l, rec, props }) => { const b = blockOf(st, l.id, props); const joint = rec.status === 'UK resident' && needsTax(st, l.id, props); return <tr key={l.id} onClick={() => s.go('tax', l.id)}>
          <td><span className="cell"><Avatar name={l.name} /><span className="stack"><b className="strong">{l.name}</b><span className="caption">{props.length} home{props.length === 1 ? '' : 's'}{s.properties.some(p => isLeased(p) && p.owner === l.id) ? ' · leases to LSP' : ''}</span></span></span></td>
          <td>{joint ? <span className="small">UK · joint owner abroad</span> : rec.country ?? (rec.abroad === 'Not sure' ? 'Not sure yet' : '—')}</td>
          <td><Chip tone={joint ? 'brand' : statusTone(rec.status)}>{joint ? 'Tax on joint share' : rec.status}</Chip></td>
          <td>{rec.letter ? <span className="stack"><b className="small">{rec.letter.ref}</b><span className="caption">{rec.letter.date}</span></span> : rec.status === 'HMRC approved' ? <Chip tone="err">Missing</Chip> : <span className="muted">Not needed</span>}</td>
          <td>{needsTax(st, l.id, props) ? (rec.calcs.find(c => c.month === CURRENT_MONTH) ? <b>{money(taxOf(st, l.id, props))}</b> : <Chip tone="warn">Figure needed</Chip>) : <span className="muted">—</span>}</td>
          <td>{b ? <span className="stack"><Chip tone="err"><Ban size={12} /> Blocked</Chip><span className="caption">{b.reason}</span></span> : <Chip tone="ok">Ready</Chip>}</td>
          <td style={{ textAlign: 'right' }}><ArrowRight size={16} color="#98A2B3" /></td></tr>; })}
      </tbody></table>{!recs.length && <Empty icon={<Globe2 size={22} />}>No landlords live abroad.</Empty>}</div>
    </Card>}
    {tab === 'hmrc' && <>
      {!SUP && <Note>Payments to HMRC are made by the Supervisor. You can see what is held and paid.</Note>}
      <Card title="Tax kept back and paid to HMRC" sub="Each quarter's tax is paid to HMRC within 30 days of the quarter ending. Includes tax on lease rent LSP pays to owners abroad.">
        <div className="tablewrap"><table className="t"><thead><tr><th>Quarter</th><th>From payouts</th><th>From lease rent</th><th>Kept back</th><th>Paid to HMRC</th><th>Still to pay</th><th>Due</th><th /></tr></thead><tbody>
          {qs.map(x => { const late = x.owed > 0 && daysFrom(x.due) < 0; return <tr key={x.q} className="static">
            <td className="strong">{x.q}</td><td>{money(x.fromPayouts)}</td><td>{money(x.fromLease)}</td><td><b>{money(x.total)}</b></td><td>{x.paid ? money(x.paid) : '—'}{st.pays.filter(p => p.quarter === x.q).map(p => <div key={p.id} className="caption">{p.paidAt} · {p.ref}</div>)}</td>
            <td>{x.owed > 0 ? <b style={{ color: late ? 'var(--err)' : 'var(--warn)' }}>{money(x.owed)}</b> : <Chip tone="ok">Paid</Chip>}</td>
            <td>{x.due}{x.owed > 0 && <div className="caption">{daysFrom(x.due) < 0 ? 'late' : `in ${daysFrom(x.due)} days`}</div>}</td>
            <td style={{ textAlign: 'right' }}>{SUP && x.owed > 0 && daysFrom(x.due) <= 30 && <Btn sm onClick={() => setPay({ q: x.q, owed: x.owed })}>Record payment</Btn>}{x.q === 'Oct–Dec 2026' && x.owed > 0 && <span className="caption">quarter still running</span>}</td></tr>; })}
        </tbody></table></div>
        <KV rows={[['LSP\'s HMRC reference', st.setting.hmrcRef], ['Tax rate', `${st.setting.rate}% of rent after expenses`]]} />
      </Card></>}
    {tab === 'deadlines' && <Card title="Tax deadlines" sub={`Reminders go out ${st.setting.reminders.join(', ')} days before each deadline.`}>
      <div className="divlist">{[...st.tasks].sort((a, b) => parseDate(a.due).getTime() - parseDate(b.due).getTime()).map(t => { const d = daysFrom(t.due); return <div key={t.id} className="item">
        <span className={`tile ${t.done ? 't-ok' : d < 0 ? 't-err' : d <= 30 ? 't-warn' : 't-info'}`} style={{ width: 32, height: 32 }}>{t.done ? <CheckCircle2 size={15} /> : <CalendarDays size={15} />}</span>
        <div className="stack grow"><b>{t.title}</b><span className="caption">{t.kind} · due {t.due}{t.done ? ` · done ${t.done} by ${t.by}` : d < 0 ? ` · ${-d} days late` : ` · in ${d} days`}</span></div>
        {t.done ? <Chip tone="ok">Done</Chip> : t.kind === 'Quarterly payment' ? (SUP ? <Btn sm kind="outline" onClick={() => setTab('hmrc')}>Pay HMRC</Btn> : <Chip tone={d <= 30 ? 'warn' : 'neutral'}>Supervisor</Chip>) : SUP ? <Btn sm kind="outline" onClick={() => { doneTask(t.id, ME_NAME); s.log(`Marked done: ${t.title}`, 'Rent & Invoices'); s.toast('Marked done'); }}>Mark done</Btn> : <Chip tone="neutral">Supervisor</Chip>}
      </div>; })}</div>
      <Btn sm kind="ghost" icon={<Download size={14} />} onClick={() => { s.log('Downloaded the overseas tax export for the accountant', 'Rent & Invoices'); s.toast('Export for the accountant downloaded (Excel)'); }}>Export for the accountant</Btn>
    </Card>}
    {pay && <PayModal quarter={pay.q} owed={pay.owed} onClose={() => setPay(null)} />}
  </>;
}

function OwnerTax({ id }: { id: string }) {
  const s = useStore(); const st = useNrl(); const l = s.landlords.find(x => x.id === id)!; const rec = recordOf(st, id); const props = homesOf(s, id);
  const leased = s.properties.filter(p => isLeased(p) && p.owner === id);
  const b = blockOf(st, id, ids(props));
  const leaseRows = s.leasePays.filter(x => leased.some(p => p.id === x.property));
  return <>
    <PageHeader crumbs={crumbsFor('tax' as Route, s.go, l.name)} back={() => s.go('tax')} title={`Overseas tax · ${l.name}`} action={<Btn kind="outline" icon={<ArrowRight size={16} />} onClick={() => s.go('landlords', id)}>Landlord page</Btn>} />
    <DetailHead media={<Avatar name={l.name} size="xl" />} title={l.name} chips={<><Chip tone={statusTone(rec.status)}>{rec.status}</Chip>{b && <Chip tone="err"><Ban size={12} /> Payout blocked</Chip>}</>}
      meta={[['Lives in', rec.country ?? (rec.abroad === 'No' ? 'UK' : 'Not sure yet')], ['Decided', rec.decidedAt ? `${rec.decidedBy}, ${rec.decidedAt.split(',')[0]}` : 'Not yet'], ['HMRC letter', rec.letter?.ref ?? (rec.status === 'HMRC approved' ? 'Missing' : 'Not needed')], ['Homes', String(props.length + leased.length)]]} />
    <div className="grid g4">
      <Stat label={`${CURRENT_MONTH} tax`} value={money(taxOf(st, id, ids(props)))} tone={needsTax(st, id, ids(props)) && !rec.calcs.some(c => c.month === CURRENT_MONTH) ? 'err' : undefined} sub={needsTax(st, id, ids(props)) ? (rec.calcs.some(c => c.month === CURRENT_MONTH) ? 'from the accountant' : 'figure needed') : 'none kept back'} />
      <Stat label="Kept back this tax year" value={money(r2(rec.calcs.reduce((a, c) => a + c.tax, 0) + leaseRows.reduce((a, x) => a + leaseTaxOf(st, id, x), 0)))} sub="since 6 Apr 2026" />
      <Stat label="Lease rent tax" value={leased.length ? money(leaseTaxOf(st, id, { amount: leased[0].lease?.rent ?? 0 })) : '—'} sub={leased.length ? 'each month' : 'no leased home'} />
      <Stat label="Yearly certificate" value="5 Jul 2027" sub="sent to the landlord" />
    </div>
    <div className="dgrid">
      <div className="col">
        <Card title="Accountant's figures" sub="One figure per month, with the accountant's working attached. Taken off that month's payout.">
          {rec.calcs.length ? <div className="tablewrap"><table className="t"><thead><tr><th>Month</th><th>Rent after expenses</th><th>Tax kept back</th><th>By</th><th>Working</th></tr></thead><tbody>
            {[...rec.calcs].reverse().map(c => <tr key={c.month} className="static"><td className="strong">{c.month}</td><td>{money(c.taxable)}</td><td><b>{money(c.tax)}</b></td><td>{c.by}<div className="caption">{c.at}</div></td><td><button className="link small" onClick={() => s.toast(`${c.file} downloaded`)}><FileText size={12} /> {c.file}</button></td></tr>)}
          </tbody></table></div> : <Empty icon={<Calculator size={22} />}>No figures yet.</Empty>}
        </Card>
        {leased.length > 0 && <Card title="Tax on lease rent" sub="LSP keeps back tax from the lease rent it pays this owner."><div className="tablewrap"><table className="t"><thead><tr><th>Month</th><th>Lease rent</th><th>Tax kept back</th><th>To the owner</th></tr></thead><tbody>
          {leaseRows.map(x => { const t = leaseTaxOf(st, id, x); return <tr key={x.id} className="static"><td className="strong">{x.month}</td><td>{money(x.amount)}</td><td>{t ? money(t) : '—'}</td><td><b>{money(x.amount - t)}</b></td></tr>; })}
        </tbody></table></div></Card>}
        <Card title="Tax history" sub="Every decision, letter and figure, with the date and time. Nothing is deleted."><Timeline items={[...rec.history].reverse().map(h => ({ at: h.at, text: h.text, by: h.by }))} /></Card>
      </div>
      <div className="col">
        <NrlCard l={l} />
        {b && <ActionCard tone="warn" title="Payout blocked" text={`${b.reason}. ${b.fix}`} />}
        <Card title="HMRC letter">{rec.letter ? <div className="lrow"><FileCheck2 size={18} color="var(--ok)" /><div className="stack grow"><b>{rec.letter.ref}</b><span className="caption">{rec.letter.file} · {rec.letter.date}</span></div><Btn sm kind="ghost" icon={<Download size={14} />} onClick={() => s.toast('Letter downloaded')}>PDF</Btn></div> : <Note tone={rec.status === 'HMRC approved' ? 'err' : undefined}>{rec.status === 'HMRC approved' ? 'Missing. Payouts are blocked until it is uploaded.' : 'No letter. Tax is kept back.'}</Note>}</Card>
      </div>
    </div>
  </>;
}

/* ---------------- Settings › Overseas tax (Supervisor) ---------------- */
export function TaxSettings() {
  const s = useStore(); const st = useNrl(); const [f, setF] = useState({ rate: String(st.setting.rate), ref: st.setting.hmrcRef, rem: st.setting.reminders.join(', ') });
  const ok = +f.rate > 0 && +f.rate <= 50 && f.ref.trim();
  return <Card title="Overseas landlords' tax (NRL)" sub="LSP is registered with HMRC as a letting agent for landlords who live abroad. These rules apply to every payout and lease payment.">
    <div className="grid g3">
      <Field label="Tax rate (%)" hint="Basic rate. The accountant's figure always wins."><Text value={f.rate} onChange={v => setF({ ...f, rate: v.replace(/[^0-9.]/g, '') })} /></Field>
      <Field label="LSP's HMRC reference"><Text value={f.ref} onChange={v => setF({ ...f, ref: v })} /></Field>
      <Field label="Reminder days before a deadline"><Text value={f.rem} onChange={v => setF({ ...f, rem: v })} /></Field>
    </div>
    <div className="flex"><Btn icon={<Settings2 size={16} />} disabled={!ok} onClick={() => { saveSetting({ rate: +f.rate, hmrcRef: f.ref.trim(), reminders: f.rem.split(/[ ,]+/).map(Number).filter(Boolean) }, ME_NAME, `Saved: rate ${f.rate}%, HMRC reference ${f.ref.trim()}, reminders ${f.rem}`); s.log('Updated the overseas tax settings', 'Settings'); s.toast('Overseas tax settings saved'); }}>Save</Btn><Btn kind="ghost" icon={<ArrowRight size={16} />} onClick={() => s.go('tax' as Route)}>Overseas Tax</Btn></div>
    <Timeline items={st.setting.history.map(h => ({ at: h.at, text: h.text, by: h.by }))} />
  </Card>;
}

/* ---------------- alerts for the dashboard ---------------- */
/** Blocked payouts and tax deadlines in the next 30 days. A hook: call it at the top of a component. */
export function useTaxAlerts(s: S) {
  const st = useNrl();
  const blocked = s.landlords.filter(l => blockOf(st, l.id, ids(homesOf(s, l.id))));
  const tasks = st.tasks.filter(t => !t.done && daysFrom(t.due) <= 30);
  return {
    blocked: blocked.map(l => ({ l, why: blockOf(st, l.id, ids(homesOf(s, l.id)))!.reason })),
    due: tasks,
  };
}
