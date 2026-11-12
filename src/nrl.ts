import { useSyncExternalStore } from 'react';
import { nowStamp, type LeasePay } from './data';

/* Overseas landlords' tax (HMRC's Non-Resident Landlord scheme, "NRL"). Same file in the Supervisor and Office Admin portals.
   When a landlord lives outside the UK, LSP keeps back tax from their rent and pays it to HMRC every quarter,
   unless HMRC has sent a letter saying LSP can pay them in full. An accountant works out the figure outside Genesis;
   Genesis records it, blocks payouts that are not ready, and tracks the HMRC payments and deadlines.
   Kept in its own small store (useNrl) so both portals share it without changing the main store. */

export type NrlStatus = 'UK resident' | 'Review pending' | 'Tax kept back' | 'HMRC approved';
export const NRL_STATUSES: NrlStatus[] = ['Review pending', 'Tax kept back', 'HMRC approved', 'UK resident'];
export const STATUS_TEXT: Record<NrlStatus, string> = {
  'UK resident': 'Lives in the UK. Paid in full.',
  'Review pending': 'May live abroad. Not checked yet, so payouts are blocked.',
  'Tax kept back': 'Lives abroad. Tax is kept back from every payout and paid to HMRC.',
  'HMRC approved': 'Lives abroad, but HMRC has approved paying the full rent. The HMRC letter must be on file.',
};
export const statusTone = (st: NrlStatus) => st === 'Tax kept back' ? 'brand' as const : st === 'HMRC approved' ? 'ok' as const : st === 'Review pending' ? 'warn' as const : 'neutral' as const;

/** The accountant's figure for one landlord and one month. */
export interface NrlCalc { month: string; taxable: number; tax: number; by: string; at: string; file: string }
export interface NrlEvent { at: string; by: string; text: string }
export interface NrlRecord {
  landlord: string; abroad: 'Yes' | 'No' | 'Not sure'; country?: string; since?: string;
  status: NrlStatus; decidedBy?: string; decidedAt?: string; reason?: string; from?: string;
  /** HMRC's approval letter to pay the rent in full, with HMRC's reference. */
  letter?: { file: string; ref: string; date: string };
  calcs: NrlCalc[]; history: NrlEvent[];
  /** An Office Admin asked the Supervisor to decide. */ asked?: string;
}
/** Joint owners of one home and their share. Tax is only kept back on the share of an owner who lives abroad. */
export interface Share { name: string; pct: number; abroad: boolean; country?: string; status: NrlStatus; landlord?: string }
export interface HmrcPay { id: string; quarter: string; paid: number; paidAt: string; ref: string; by: string }
export interface NrlTask { id: string; kind: 'Quarterly payment' | 'Yearly return' | 'Landlord certificates'; title: string; due: string; done?: string; by?: string }
export interface NrlSetting { rate: number; hmrcRef: string; reminders: number[]; agentName: string; history: NrlEvent[] }

const ev = (at: string, by: string, text: string): NrlEvent => ({ at, by, text });
const calc = (month: string, taxable: number, by = 'Ade Accountants'): NrlCalc => ({ month, taxable, tax: Math.round(taxable * 20) / 100, by, at: '', file: `NRL-calc-${month.replace(' ', '-')}.pdf` });
const stamp = (c: NrlCalc, at: string): NrlCalc => ({ ...c, at });

export const CURRENT_MONTH = 'Oct 2026';

/* ---------- seed: the five cases the client asked to see ---------- */
const SEED_RECORDS: NrlRecord[] = [
  // 1. Tax must be kept back (and the owner of a home leased to LSP)
  { landlord: 'L1', abroad: 'Yes', country: 'Nigeria (Lagos)', since: 'Jan 2025', status: 'Tax kept back', decidedBy: 'Sarah Khan', decidedAt: '1 Apr 2026, 10:00', from: '1 Apr 2026', reason: 'Lives in Lagos for most of the year. No HMRC approval to pay in full.',
    calcs: [stamp(calc('Apr 2026', 984), '5 May 2026, 11:00'), stamp(calc('May 2026', 1020), '4 Jun 2026, 10:30'), stamp(calc('Jun 2026', 1056), '3 Jul 2026, 09:40'), stamp(calc('Jul 2026', 1092), '5 Aug 2026, 10:10'), stamp(calc('Aug 2026', 1092), '4 Sep 2026, 15:00'), stamp(calc('Sep 2026', 1056), '5 Oct 2026, 10:00'), stamp(calc('Oct 2026', 1092), '14 Oct 2026, 16:30')],
    history: [ev('1 Apr 2026, 10:00', 'Sarah Khan', 'Set to Tax kept back: lives in Lagos, Nigeria. No HMRC approval.'), ev('14 Oct 2026, 16:30', 'Ade Accountants', 'October figure entered: £218.40 tax on £1,092.00')] },
  // 2. HMRC approved full payment, and 4. an approval that changed
  { landlord: 'L3', abroad: 'Yes', country: 'Spain (Málaga)', since: 'Mar 2024', status: 'HMRC approved', decidedBy: 'Sarah Khan', decidedAt: '1 Sep 2026, 09:30', from: '1 Sep 2026', reason: 'HMRC approval letter received. Pay in full from September.',
    letter: { file: 'HMRC-NRL-approval-R-Evans.pdf', ref: 'NA041872', date: '28 Aug 2026' },
    calcs: [stamp(calc('Jun 2026', 744), '3 Jul 2026, 09:45'), stamp(calc('Jul 2026', 744), '5 Aug 2026, 10:15'), stamp(calc('Aug 2026', 744), '4 Sep 2026, 15:05')],
    history: [ev('10 Jun 2026, 12:00', 'Sarah Khan', 'Set to Tax kept back: lives in Spain. Asked her to apply to HMRC.'), ev('1 Sep 2026, 09:30', 'Sarah Khan', 'Changed to HMRC approved: letter NA041872 dated 28 Aug 2026 uploaded. Paid in full from September.')] },
  // 3. HMRC letter missing: payouts blocked
  { landlord: 'L5', abroad: 'Yes', country: 'United Arab Emirates (Dubai)', since: 'Sep 2026', status: 'HMRC approved', decidedBy: 'Emma Thompson', decidedAt: '8 Oct 2026, 14:00', from: '1 Oct 2026', reason: 'Helen says HMRC approved her in September. Letter not sent to us yet.',
    calcs: [], history: [ev('8 Oct 2026, 14:00', 'Emma Thompson', 'Helen moved to Dubai in September and says HMRC approved her. Waiting for the letter.')] },
  // Not checked yet: payouts blocked
  { landlord: 'L7', abroad: 'Not sure', country: 'Canada (Toronto)', since: 'Oct 2026', status: 'Review pending', reason: 'Told James on 10 Oct he is moving to Toronto for work. Not checked yet.',
    calcs: [], history: [ev('10 Oct 2026, 16:20', 'James Carter', 'Simon said he is moving to Toronto this month. Set to Review pending.')] },
  // Asked by an Office Admin: waiting for the Supervisor
  { landlord: 'L4', abroad: 'Yes', country: 'Qatar (Doha)', since: 'Oct 2026', status: 'Review pending', reason: 'Moved to Doha in October for work.', asked: '15 Oct 2026, 09:10',
    calcs: [], history: [ev('15 Oct 2026, 09:05', 'Liam Murphy', 'Tom told us he moved to Doha this month. Set to Review pending.'), ev('15 Oct 2026, 09:10', 'Liam Murphy', 'Asked the Supervisor to decide: suggest Tax kept back.')] },
  // 5. Joint owners treated differently: David lives in the UK, his sister Anna owns half of 22 Oak Avenue and lives in Australia
  { landlord: 'L2', abroad: 'No', status: 'UK resident', decidedBy: 'Sarah Khan', decidedAt: '15 Jan 2026, 10:00', reason: 'Lives in London. His joint owner on 22 Oak Avenue lives abroad (see the property).',
    calcs: [stamp(calc('Aug 2026', 432), '4 Sep 2026, 15:10'), stamp(calc('Sep 2026', 432), '5 Oct 2026, 10:05'), stamp(calc('Oct 2026', 432), '14 Oct 2026, 16:35')],
    history: [ev('15 Jan 2026, 10:00', 'Sarah Khan', 'Lives in the UK. Joint owner Anna Hughes (50% of 22 Oak Avenue) lives in Australia: tax kept back on her share only.')] },
];
const SEED_SHARES: Record<string, Share[]> = {
  P2: [{ name: 'David Hughes', landlord: 'L2', pct: 50, abroad: false, status: 'UK resident' }, { name: 'Anna Hughes', pct: 50, abroad: true, country: 'Australia (Perth)', status: 'Tax kept back' }],
  P1: [{ name: 'Margaret Okafor', landlord: 'L1', pct: 100, abroad: true, country: 'Nigeria (Lagos)', status: 'Tax kept back' }],
};
const SEED_PAYS: HmrcPay[] = [
  { id: 'HP1', quarter: 'Apr–Jun 2026', paid: 760.8, paidAt: '28 Jul 2026', ref: 'HMRC NRL Q1 · 7731', by: 'Sarah Khan' },
];
const SEED_TASKS: NrlTask[] = [
  { id: 'NT1', kind: 'Quarterly payment', title: 'Pay HMRC for Apr–Jun 2026', due: '30 Jul 2026', done: '28 Jul 2026', by: 'Sarah Khan' },
  { id: 'NT2', kind: 'Quarterly payment', title: 'Pay HMRC for Jul–Sep 2026', due: '30 Oct 2026' },
  { id: 'NT3', kind: 'Quarterly payment', title: 'Pay HMRC for Oct–Dec 2026', due: '30 Jan 2027' },
  { id: 'NT4', kind: 'Quarterly payment', title: 'Pay HMRC for Jan–Mar 2027', due: '30 Apr 2027' },
  { id: 'NT5', kind: 'Yearly return', title: 'Yearly return to HMRC for 2026–27', due: '5 Jul 2027' },
  { id: 'NT6', kind: 'Landlord certificates', title: 'Send each overseas landlord their yearly tax certificate', due: '5 Jul 2027' },
];

/* ---------- the small shared store ---------- */
interface NrlState { records: NrlRecord[]; shares: Record<string, Share[]>; pays: HmrcPay[]; tasks: NrlTask[]; setting: NrlSetting }
let state: NrlState = {
  records: SEED_RECORDS, shares: SEED_SHARES, pays: SEED_PAYS, tasks: SEED_TASKS,
  setting: { rate: 20, hmrcRef: 'NA/LSP/004417', reminders: [30, 14, 7], agentName: 'Landlord Service Plans Limited', history: [ev('1 Feb 2026, 09:00', 'Sarah Khan', 'LSP registered with HMRC as a letting agent for overseas landlords (NA/LSP/004417). Rate 20%.')] },
};
const subs = new Set<() => void>();
function set(fn: (s: NrlState) => NrlState) { state = fn(state); subs.forEach(f => f()); }
export function useNrl() {
  return useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state);
}
export const nrlState = () => state;

export function recordOf(st: NrlState, landlord?: string): NrlRecord {
  return st.records.find(r => r.landlord === landlord) ?? { landlord: landlord ?? '', abroad: 'No', status: 'UK resident', calcs: [], history: [] };
}
/** Change one landlord's record and add a history line. */
export function updateRecord(landlord: string, patch: Partial<NrlRecord>, by: string, text: string) {
  set(s => {
    const had = s.records.some(r => r.landlord === landlord);
    const base = recordOf(s, landlord);
    const next = { ...base, ...patch, history: [...base.history, ev(nowStamp(), by, text)] };
    return { ...s, records: had ? s.records.map(r => r.landlord === landlord ? next : r) : [...s.records, next] };
  });
}
export function setShares(property: string, shares: Share[]) { set(s => ({ ...s, shares: { ...s.shares, [property]: shares } })); }
export function addCalc(landlord: string, c: NrlCalc, by: string) {
  set(s => { const base = recordOf(s, landlord); const calcs = [...base.calcs.filter(x => x.month !== c.month), c]; const next = { ...base, calcs, history: [...base.history, ev(c.at, by, `${c.month} figure entered: £${c.tax.toFixed(2)} tax on £${c.taxable.toFixed(2)} (${c.by})`)] };
    return { ...s, records: s.records.some(r => r.landlord === landlord) ? s.records.map(r => r.landlord === landlord ? next : r) : [...s.records, next] }; });
}
export function addPay(p: HmrcPay) { set(s => ({ ...s, pays: [p, ...s.pays], tasks: s.tasks.map(t => t.kind === 'Quarterly payment' && t.title.endsWith(p.quarter) ? { ...t, done: p.paidAt, by: p.by } : t) })); }
export function doneTask(id: string, by: string) { set(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, done: nowStamp().split(',')[0], by } : t) })); }
export function saveSetting(patch: Partial<NrlSetting>, by: string, text: string) { set(s => ({ ...s, setting: { ...s.setting, ...patch, history: [ev(nowStamp(), by, text), ...s.setting.history] } })); }

/* ---------- the maths and the rules ---------- */
export const r2 = (n: number) => Math.round(n * 100) / 100;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** HMRC quarters run Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar. Tax is paid within 30 days of the quarter's end. */
export function quarterOf(month: string) {
  const [m, y] = month.split(' '); const i = MON.indexOf(m); const yr = +y;
  const q = i >= 3 && i <= 5 ? 0 : i >= 6 && i <= 8 ? 1 : i >= 9 ? 2 : 3;
  const label = ['Apr–Jun', 'Jul–Sep', 'Oct–Dec', 'Jan–Mar'][q] + ' ' + yr;
  const due = ['30 Jul', '30 Oct', '30 Jan', '30 Apr'][q] + ' ' + (q === 2 ? yr + 1 : yr);
  return { label, due };
}
export const QUARTERS = ['Apr–Jun 2026', 'Jul–Sep 2026', 'Oct–Dec 2026'];
/** Does any owner of this landlord's homes live abroad? */
export function abroadShare(st: NrlState, landlord: string, props: string[]) {
  const rec = recordOf(st, landlord);
  if (rec.status === 'Tax kept back' || rec.status === 'Review pending' || rec.status === 'HMRC approved') return 1;
  const parts = props.map(p => (st.shares[p] ?? []).filter(x => x.abroad && x.status === 'Tax kept back').reduce((a, x) => a + x.pct, 0) / 100);
  return parts.length ? Math.max(...parts) : 0;
}
/** True when tax has to be kept back from this landlord's payout (on all or part of it). */
export function needsTax(st: NrlState, landlord: string, props: string[]) {
  const rec = recordOf(st, landlord);
  if (rec.status === 'Tax kept back') return true;
  return props.some(p => (st.shares[p] ?? []).some(x => x.abroad && x.status === 'Tax kept back'));
}
/** What stops a payout going out, if anything. */
export function blockOf(st: NrlState, landlord: string, props: string[], month = CURRENT_MONTH): { reason: string; fix: string } | null {
  const rec = recordOf(st, landlord);
  if (rec.status === 'Review pending') return { reason: 'Tax status not decided yet', fix: 'The Supervisor decides the tax status on the landlord page.' };
  if (rec.status === 'HMRC approved' && !rec.letter) return { reason: 'HMRC approval letter not on file', fix: 'Upload HMRC\'s letter with its reference before paying in full.' };
  if (needsTax(st, landlord, props) && !rec.calcs.some(c => c.month === month)) return { reason: `Accountant's tax figure for ${month} not entered`, fix: 'Enter the accountant\'s figure for this month.' };
  return null;
}
/** Tax kept back from one landlord's payout this month (the accountant's figure). */
export function taxOf(st: NrlState, landlord: string, props: string[], month = CURRENT_MONTH) {
  if (!needsTax(st, landlord, props)) return 0;
  return recordOf(st, landlord).calcs.find(c => c.month === month)?.tax ?? 0;
}
/** Suggested figure to help the accountant: rate × the amount after expenses × the share owned by someone abroad. */
export const suggestTax = (st: NrlState, taxable: number, share: number) => r2(taxable * share * st.setting.rate / 100);

/** Lease rent LSP pays the owner of a leased home. When the owner lives abroad, LSP keeps back tax on it. */
export function leaseTaxOf(st: NrlState, owner: string | undefined, x: Pick<LeasePay, 'amount'>) {
  return recordOf(st, owner).status === 'Tax kept back' ? r2(x.amount * st.setting.rate / 100) : 0;
}
/** Tax kept back in a quarter: the accountant's monthly figures plus tax on lease rent. */
export function heldIn(st: NrlState, quarter: string, leasePays: LeasePay[], ownerOf: (property: string) => string | undefined) {
  const fromPayouts = st.records.flatMap(r => r.calcs).filter(c => quarterOf(c.month).label === quarter).reduce((a, c) => a + c.tax, 0);
  const fromLease = leasePays.filter(x => quarterOf(x.month).label === quarter).reduce((a, x) => a + leaseTaxOf(st, ownerOf(x.property), x), 0);
  return { fromPayouts: r2(fromPayouts), fromLease: r2(fromLease), total: r2(fromPayouts + fromLease) };
}
export const overseas = (st: NrlState) => st.records.filter(r => r.abroad !== 'No' || r.status !== 'UK resident');
