import { useState } from 'react';
import { FileText, Download, Save, Eye, CheckCircle2, AlertTriangle, RefreshCw, ArrowLeft, Mail } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { CERT_KINDS, PLAN, nowStamp, parseDate, daysFrom, type PlanData, type PlanVersion, type Property } from '../data';
import { ME_NAME } from '../data';
import { Btn, Card, Chip, Modal, Note, Empty } from '../ui';
import { DocSheet, downloadPdf } from './docs';
import { adminName, DONE_JOB } from './shared';

type S = ReturnType<typeof useStore>;
const NR = 'Not recorded';

const ACTION: Record<string, string> = { Missing: 'Book the check and upload the certificate', Overdue: 'Renew now', 'Due soon': 'Book the renewal', Booked: 'Visit booked, upload certificate after', 'Proof to check': 'Check the uploaded certificate', Valid: 'None' };

/** Builds the plan from what Genesis already holds. Nothing is invented: gaps say "Not recorded". */
export function buildPlan(s: S, L: ReturnType<typeof useLookups>, p: Property): PlanData {
  const ll = L.landlord(p.owner); const missing: PlanData['missing'] = [];
  if (!ll) missing.push({ text: 'No landlord linked to this property', blocks: true });
  if (!p.admin) missing.push({ text: 'No Office Admin assigned', blocks: true });
  const tenants = s.tenants.filter(t => t.property === p.id && t.status !== 'Moved out');
  if (!tenants.length) missing.push({ text: 'No current tenancy recorded. Shown as "No current tenancy".', blocks: false });

  const certs = s.safety.filter(c => c.property === p.id);
  const certRows = CERT_KINDS.filter(k => certs.some(c => c.kind === k)).map(k => {
    const c = certs.find(x => x.kind === k)!;
    if (c.status === 'Missing') missing.push({ text: `${k}: no certificate on file. Shown as "${NR}".`, blocks: false });
    return [k, c.status === 'Missing' ? NR : c.status, c.issued ? c.issued.split(',')[0] : NR, c.issued ? c.expires : NR, ACTION[c.status] ?? NR, c.contractor ? L.contractor(c.contractor)?.name ?? NR : c.status === 'Valid' ? '—' : 'Not assigned'];
  });

  const insp = s.inspections.filter(i => i.property === p.id).sort((a, b) => parseDate(b.doneAt ?? b.date).getTime() - parseDate(a.doneAt ?? a.date).getTime());
  const next = insp.filter(i => !i.doneAt && daysFrom(i.date) >= 0).sort((a, b) => daysFrom(a.date) - daysFrom(b.date))[0];
  if (!insp.some(i => i.doneAt)) missing.push({ text: `No completed inspection on file. Shown as "${NR}".`, blocks: false });
  const inspRows = insp.map(i => [i.kind + (i.room ? ` · ${i.room}` : ''), i.doneAt ? i.doneAt.split(',')[0] : `Booked ${i.date}`, i.summary ?? NR, i.result === 'Fail' ? 'Follow-up needed' : i.doneAt ? 'None recorded' : 'Visit to take place', L.contractor(i.inspector)?.name ?? 'Not assigned']);

  const open = s.jobs.filter(j => j.property === p.id && !DONE_JOB.includes(j.status));
  const actRows = [
    ...open.map(j => { if (!j.contractor) missing.push({ text: `${j.title}: no contractor assigned yet. Shown as "Not assigned".`, blocks: false }); return [j.title, j.price ? `${money(j.price)} · ${j.note ?? j.category}` : `${NR} · ${j.note ?? j.category}`, j.contractor ? L.contractor(j.contractor)?.name ?? NR : 'Not assigned', j.urgent ? 'High' : 'Normal', NR, j.status]; }),
    ...certs.filter(c => c.status !== 'Valid').map(c => [`${c.kind} certificate`, ACTION[c.status], c.contractor ? L.contractor(c.contractor)?.name ?? NR : 'Not assigned', ['Overdue', 'Missing'].includes(c.status) ? 'High' : 'Normal', c.issued ? c.expires : NR, c.status]),
    ...(next ? [[`${next.kind} inspection`, `${next.scope}${next.room ? ' · ' + next.room : ''}`, L.contractor(next.inspector)?.name ?? 'Not assigned', 'Normal', `${next.date}, ${next.time}`, next.status]] : []),
  ];

  const respRows: string[][] = [
    ['Day-to-day management', `LSP · Office Admin ${adminName(p.admin)}`],
    ...(ll ? [['Approving repairs over the job limit', `${ll.name} (landlord) · over ${money(PLAN[ll.plan].limit)} per job on the ${ll.plan}% plan`]] : []),
    ...open.filter(j => j.contractor).map(j => [j.title, `${L.contractor(j.contractor)?.name} (contractor)`]),
    ...certs.filter(c => c.contractor && c.status !== 'Valid').map(c => [`${c.kind} visit`, `${L.contractor(c.contractor)?.name} (contractor)`]),
  ];

  const vNext = s.plans.filter(x => x.property === p.id).length + 1;
  return {
    ref: `PMP-${p.id}-${String(vNext).padStart(2, '0')}`, address: p.address, area: p.area, admin: adminName(p.admin),
    landlord: ll ? [ll.name, ...ll.billing.split(', '), `${ll.plan}% plan`] : [NR],
    overview: [
      ['Property', `${p.type === 'HMO' ? `Shared house · ${p.rooms} rooms` : `${p.beds} bed ${p.type.toLowerCase()}`} · ${p.baths} bath`],
      ['Occupancy', p.status],
      ['Rent', `${money(p.rent)} pcm`],
      ['Yearly repair budget', `${money(p.budget)} · ${money(p.used)} used · ${money(p.budget - p.used)} left`],
      ...(tenants.length ? tenants.map(t => [t.room ? `Tenant · ${t.room}` : 'Tenant', `${t.name} · ${t.start} to ${t.end} · ${t.phone}`] as [string, string]) : [['Tenancy', 'No current tenancy'] as [string, string]]),
    ],
    tables: [
      { title: 'Compliance schedule', cols: ['Certificate', 'Status', 'Done', 'Due date', 'Outstanding action', 'Who'], rows: certRows, empty: 'No compliance records held.' },
      { title: 'Inspection summary', cols: ['Inspection', 'Date', 'Findings', 'Follow-up', 'Inspector'], rows: inspRows, empty: `${NR}.` },
      { title: 'Maintenance and action schedule', cols: ['Item', 'Agreed work', 'Responsible', 'Priority', 'Target date', 'Status'], rows: actRows, empty: 'No open work or actions.' },
      { title: 'Responsibilities', cols: ['What', 'Recorded responsible party'], rows: respRows, empty: NR },
    ],
    missing,
  };
}

export function PlanSheet({ d, version, at }: { d: PlanData; version: number; at: string }) {
  return <DocSheet kind="PROPERTY MANAGEMENT PLAN" to={{ label: 'Landlord', rows: d.landlord }} site={`${d.address}, ${d.area}`}
    meta={[['Plan ref', d.ref], ['Version', `v${version}`], ['Generated', at], ['Office Admin', d.admin]]}>
    <div className="doc-sec"><span className="doc-lab">Property and tenancy overview</span><div className="doc-kv two">{d.overview.flatMap(([k, v], i) => [<span key={'k' + i}>{k}</span>, <b key={'v' + i}>{v}</b>])}</div></div>
    {d.tables.map(t => <div key={t.title} className="doc-sec"><span className="doc-lab">{t.title}</span>
      {t.rows.length ? <table className="doc-t sm"><thead><tr>{t.cols.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{t.rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k} className={c === NR || c === 'Not assigned' ? 'nr' : ''}>{c}</td>)}</tr>)}</tbody></table> : <span className="caption">{t.empty}</span>}</div>)}
    <p className="doc-note">Made from the records Genesis holds for this property on {at}. Anything not on file says “{NR}”. This version is saved and will not change. A new version is made when the plan is generated again.</p>
  </DocSheet>;
}

/** Generate → check missing info → preview → save a version → download. */
export function PlanModal({ p, view, onClose }: { p: Property; view?: PlanVersion; onClose: () => void }) {
  const s = useStore(); const L = useLookups();
  const [step, setStep] = useState<'check' | 'preview' | 'saved'>(view ? 'saved' : 'check');
  const [draft] = useState(() => buildPlan(s, L, p)); const [at] = useState(nowStamp());
  const [saved, setSaved] = useState<PlanVersion | undefined>(view);
  const version = saved?.version ?? s.plans.filter(x => x.property === p.id).length + 1;
  const blocks = draft.missing.filter(m => m.blocks);
  const save = () => {
    const v: PlanVersion = { id: 'PV' + Date.now(), property: p.id, version, at, by: ME_NAME, data: draft };
    s.setPlans(ps => [v, ...ps]); s.log(`Property Management Plan v${version} saved for ${p.address} (${draft.ref})`, 'Properties');
    s.toast(`Plan v${version} saved`); setSaved(v); setStep('saved');
  };
  const d = saved?.data ?? draft;
  if (step === 'check') return <Modal wide title="Generate Property Management Plan" sub={`${p.address}. Genesis fills the plan from the records it already holds. Check the gaps first.`} onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Eye size={16} />} disabled={!!blocks.length} onClick={() => setStep('preview')}>Preview plan</Btn></>}>
    <div className="plan-src">{[['Tenancy', s.tenants.some(t => t.property === p.id && t.status !== 'Moved out')], ['Compliance', s.safety.some(c => c.property === p.id)], ['Inspections', s.inspections.some(i => i.property === p.id)], ['Maintenance', s.jobs.some(j => j.property === p.id)], ['Responsibilities', true]].map(([k, ok]) => <div key={k as string}><span className={`tile ${ok ? 't-ok' : 't-warn'}`} style={{ width: 30, height: 30 }}>{ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span><b>{k}</b><span className="caption">{ok ? 'From records' : 'Nothing on file'}</span></div>)}</div>
    {draft.missing.length ? <div className="divlist">{draft.missing.map((m, i) => <div key={i} className="item"><span className={`tile ${m.blocks ? 't-err' : 't-warn'}`} style={{ width: 30, height: 30 }}><AlertTriangle size={14} /></span><span className="grow small">{m.text}</span><Chip tone={m.blocks ? 'err' : 'warn'} dot={false}>{m.blocks ? 'Must fix first' : 'Shown as not recorded'}</Chip></div>)}</div> : <Note tone="ok">Nothing missing. Every section has records.</Note>}
    {blocks.length ? <Note tone="err">Fix the items marked “Must fix first” before the plan can be made.</Note> : <Note tone="ok">Ready. Gaps will say “Not recorded”. Genesis never fills in dates, finished work or a compliant status that isn’t on file.</Note>}
  </Modal>;
  return <Modal wide title={step === 'saved' ? `Property Management Plan · v${version}` : 'Preview the plan'} sub={step === 'saved' ? `${d.ref} · saved ${saved?.at} by ${saved?.by}. This version will not change.` : 'Check it, then save it as a version.'} onClose={onClose}
    footer={step === 'preview'
      ? <><Btn kind="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep('check')}>Back</Btn><Btn icon={<Save size={16} />} onClick={save}>Save as v{version}</Btn></>
      : <><Btn kind="outline" icon={<Mail size={16} />} onClick={() => { s.log(`Emailed Property Management Plan v${version} for ${p.address} to ${L.ownerName(p)}`, 'Properties'); s.toast(`Plan sent to ${L.landlord(p.owner)?.email}`); }}>Email to landlord</Btn><Btn icon={<Download size={16} />} onClick={() => { s.log(`Downloaded Property Management Plan v${version} for ${p.address}`, 'Properties'); downloadPdf(s, `Plan ${d.ref}`); }}>Download PDF</Btn></>}>
    {step === 'saved' && !view && <Note tone="ok">Saved as v{version}. It is in the property’s plans list and in its history.</Note>}
    <PlanSheet d={d} version={version} at={saved?.at ?? at} />
  </Modal>;
}

/** Card on the property page: generate, and every saved version kept. */
export function PlanCard({ p }: { p: Property }) {
  const s = useStore(); const [m, setM] = useState<'' | 'new' | PlanVersion>('');
  const vs = s.plans.filter(x => x.property === p.id);
  return <Card title="Property Management Plan" sub="A PDF of this home’s tenancy, compliance, inspections, open work and who is responsible, made from its records."
    action={<Btn sm icon={vs.length ? <RefreshCw size={14} /> : <FileText size={14} />} onClick={() => setM('new')}>{vs.length ? 'Generate new version' : 'Generate plan'}</Btn>}>
    {vs.length ? <div className="divlist">{vs.map((v, i) => <div key={v.id} className="item"><span className="tile t-brand" style={{ width: 32, height: 32 }}><FileText size={15} /></span><div className="stack grow"><b>{v.data.ref} · v{v.version}</b><span className="caption">Saved {v.at} · {v.by}</span></div>{i === 0 ? <Chip tone="ok">Latest</Chip> : <Chip tone="neutral" dot={false}>Earlier version kept</Chip>}<Btn sm kind="ghost" icon={<Eye size={14} />} onClick={() => setM(v)}>View</Btn></div>)}</div>
      : <Empty icon={<FileText size={22} />}>No plan yet. Generate one to download it as a PDF.</Empty>}
    {m === 'new' && <PlanModal p={p} onClose={() => setM('')} />}
    {m && m !== 'new' && <PlanModal p={p} view={m} onClose={() => setM('')} />}
  </Card>;
}
