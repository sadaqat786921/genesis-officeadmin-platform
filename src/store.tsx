import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import * as D from './data';
import { useLocation, useNavigate } from 'react-router-dom';

export type Route =
  | 'today' | 'tasks' | 'enquiries' | 'switch' | 'landlords' | 'lettings' | 'tenants' | 'properties' | 'clients'
  | 'contractors' | 'jobs' | 'inspections' | 'requests' | 'safety' | 'rent' | 'records';

export const ROUTES: Route[] = ['today', 'tasks', 'enquiries', 'switch', 'landlords', 'lettings', 'tenants', 'properties', 'clients', 'contractors', 'jobs', 'inspections', 'requests', 'safety', 'rent', 'records'];
type Setter<T> = (fn: (prev: T[]) => T[]) => void;
export type PayoutStatus = 'Scheduled' | 'Paid' | 'On hold';
interface Store {
  route: Route; detail: string | null; go: (r: Route, detail?: string | null) => void;
  toast: (msg: string) => void; toasts: { id: number; msg: string }[];
  log: (what: string, area: string) => void;
  staff: D.Staff[]; setStaff: Setter<D.Staff>;
  landlords: D.Landlord[]; setLandlords: Setter<D.Landlord>;
  properties: D.Property[]; setProperties: Setter<D.Property>;
  enquiries: D.Enquiry[]; setEnquiries: Setter<D.Enquiry>;
  applicants: D.Applicant[]; setApplicants: Setter<D.Applicant>;
  tenants: D.Tenant[]; setTenants: Setter<D.Tenant>;
  signups: D.SignUp[]; setSignups: Setter<D.SignUp>;
  clients: D.Client[]; setClients: Setter<D.Client>;
  contractors: D.Contractor[]; setContractors: Setter<D.Contractor>;
  jobs: D.Job[]; setJobs: Setter<D.Job>;
  inspections: D.Inspection[]; setInspections: Setter<D.Inspection>;
  safety: D.SafetyCert[]; setSafety: Setter<D.SafetyCert>;
  rent: D.RentRow[]; setRent: Setter<D.RentRow>;
  invoices: D.Invoice[]; setInvoices: Setter<D.Invoice>;
  tasks: D.Task[]; setTasks: Setter<D.Task>;
  activity: D.Activity[];
  locked: D.LockedRecord[]; setLocked: Setter<D.LockedRecord>;
  support: D.SupportReq[]; setSupport: Setter<D.SupportReq>;
  leads: D.Lead[]; setLeads: Setter<D.Lead>;
  requests: D.SupReq[]; setRequests: Setter<D.SupReq>;
  plans: D.PlanVersion[]; setPlans: Setter<D.PlanVersion>;
  payouts: Record<string, PayoutStatus>; setPayout: (id: string, st: PayoutStatus) => void;
}
const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

/* ---------- only this Office Admin's work ---------- */
const MY_PROPS = D.PROPERTIES.filter(p => p.admin === D.ME);
const MY_LL = D.LANDLORDS.filter(l => l.admin === D.ME || MY_PROPS.some(p => p.managed && p.owner === l.id));
const PROPS = D.PROPERTIES.filter(p => MY_PROPS.includes(p) || (p.managed && MY_LL.some(l => l.id === p.owner)));
const PIDS = new Set(PROPS.map(p => p.id));
const ADDR = PROPS.map(p => p.address);
const TENANTS = D.TENANTS.filter(t => PIDS.has(t.property));
const JOBS = D.JOBS.filter(j => PIDS.has(j.property));
const CLIENTS = D.CLIENTS.filter(c => PROPS.some(p => !p.managed && p.owner === c.id));
const NAMES = [...MY_LL.map(l => l.name), ...TENANTS.map(t => t.name), ...CLIENTS.map(c => c.name)];
const mine = (text: string) => ADDR.some(a => text.includes(a)) || NAMES.some(n => text.includes(n));
export const SCOPE = {
  landlords: MY_LL, properties: PROPS, tenants: TENANTS, jobs: JOBS, clients: CLIENTS,
  enquiries: D.ENQUIRIES.filter(e => e.admin === D.ME),
  applicants: D.APPLICANTS.filter(a => a.admin === D.ME),
  inspections: D.INSPECTIONS.filter(i => PIDS.has(i.property)),
  safety: D.SAFETY.filter(c => PIDS.has(c.property)),
  rent: D.RENT.filter(r => TENANTS.some(t => t.id === r.tenant)),
  invoices: D.INVOICES.filter(i => (i.toKind === 'Landlord' && MY_LL.some(l => l.id === i.to)) || (i.job && JOBS.some(j => j.id === i.job)) || i.items.some(x => ADDR.some(a => x.desc.includes(a)))),
  tasks: D.TASKS.filter(t => t.admin === D.ME),
  activity: D.ACTIVITY.filter(a => a.who === D.ME_NAME || mine(a.what)),
  locked: D.LOCKED.filter(r => ADDR.some(a => r.title.includes(a))),
};

function useList<T>(init: T[]): [T[], Setter<T>] {
  const [v, setV] = useState<T[]>(init);
  return [v, useCallback((fn: (prev: T[]) => T[]) => setV(prev => fn(prev)), [])];
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const loc = useLocation(); const nav = useNavigate();
  const parts = loc.pathname.split('/').filter(Boolean);
  const route = (ROUTES.includes(parts[0] as Route) ? parts[0] : 'today') as Route;
  const detail = parts[1] ? decodeURIComponent(parts[1]) : null;
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [activity, setActivity] = useState<D.Activity[]>(SCOPE.activity);
  const [staff, setStaff] = useList(D.STAFF);
  const [landlords, setLandlords] = useList(SCOPE.landlords);
  const [properties, setProperties] = useList(SCOPE.properties);
  const [enquiries, setEnquiries] = useList(SCOPE.enquiries);
  const [applicants, setApplicants] = useList(SCOPE.applicants);
  const [tenants, setTenants] = useList(SCOPE.tenants);
  const [signups, setSignups] = useList(D.SIGNUPS);
  const [clients, setClients] = useList(SCOPE.clients);
  const [contractors, setContractors] = useList(D.CONTRACTORS);
  const [jobs, setJobs] = useList(SCOPE.jobs);
  const [inspections, setInspections] = useList(SCOPE.inspections);
  const [safety, setSafety] = useList(SCOPE.safety);
  const [rent, setRent] = useList(SCOPE.rent);
  const [invoices, setInvoices] = useList(SCOPE.invoices);
  const [tasks, setTasks] = useList(SCOPE.tasks);
  const [locked, setLocked] = useList(SCOPE.locked);
  const [support, setSupport] = useList(D.SUPPORT);
  const [plans, setPlans] = useList<D.PlanVersion>([]);
  const [leads, setLeads] = useList(D.LEADS.filter(l => l.owner === D.ME));
  const [requests, setRequests] = useList(D.REQUESTS);
  const [payouts, setPayouts] = useState<Record<string, PayoutStatus>>({ L2: 'On hold', L6: 'Paid' });

  const go = useCallback((r: Route, d: string | null = null) => { nav('/' + r + (d ? '/' + encodeURIComponent(d) : '')); window.scrollTo({ top: 0 }); }, [nav]);
  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800);
  }, []);
  const log = useCallback((what: string, area: string) => {
    setActivity(a => [{ id: 'H' + Date.now() + Math.random(), at: D.nowStamp(), who: D.ME_NAME, what, area }, ...a]);
  }, []);
  const setPayout = useCallback((id: string, st: PayoutStatus) => setPayouts(p => ({ ...p, [id]: st })), []);

  const value = useMemo(() => ({
    route, detail, go, toast, toasts, log, activity,
    staff, setStaff, landlords, setLandlords, properties, setProperties, enquiries, setEnquiries, applicants, setApplicants, tenants, setTenants,
    signups, setSignups, clients, setClients, contractors, setContractors, jobs, setJobs, inspections, setInspections, safety, setSafety,
    rent, setRent, invoices, setInvoices, tasks, setTasks, locked, setLocked, support, setSupport, plans, setPlans, requests, setRequests, leads, setLeads, payouts, setPayout,
  }), [leads, setLeads, plans, setPlans, requests, setRequests, route, detail, go, toast, toasts, log, activity, staff, landlords, properties, enquiries, applicants, tenants, signups, clients, contractors, jobs, inspections, safety, rent, invoices, tasks, locked, support, payouts, setPayout, setStaff, setLandlords, setProperties, setEnquiries, setApplicants, setTenants, setSignups, setClients, setContractors, setJobs, setInspections, setSafety, setRent, setInvoices, setTasks, setLocked, setSupport]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ---------- lookups ----------
export const staff = (id?: string) => D.STAFF.find(s => s.id === id);
export const money = (n: number): string => n < 0 ? '−' + money(-n) : '£' + n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
export function useLookups() {
  const s = useStore();
  return {
    prop: (id?: string) => s.properties.find(p => p.id === id),
    landlord: (id?: string) => s.landlords.find(l => l.id === id),
    client: (id?: string) => s.clients.find(a => a.id === id),
    contractor: (id?: string) => s.contractors.find(c => c.id === id),
    tenant: (id?: string) => s.tenants.find(t => t.id === id),
    ownerName: (p?: D.Property) => !p ? '' : p.managed ? (s.landlords.find(l => l.id === p.owner)?.name ?? '') : (s.clients.find(a => a.id === p.owner)?.name ?? ''),
    admins: s.staff.filter(x => x.role === 'Office Admin' && x.active),
  };
}
export type Lookups = ReturnType<typeof useLookups>;

/** Landlord budget is the sum of each property's own yearly repair budget. */
export function landlordBudget(s: Store, id: string) {
  const ps = s.properties.filter(p => p.managed && p.owner === id);
  const budget = ps.reduce((a, p) => a + p.budget, 0), used = ps.reduce((a, p) => a + p.used, 0);
  return { budget, used, left: budget - used, pct: budget ? Math.round(used / budget * 100) : 0, props: ps };
}
export const budgetTone = (pct: number) => pct >= 90 ? 'err' as const : pct >= 70 ? 'warn' as const : 'ok' as const;

export const rentStatus = (r: D.RentRow): { label: string; tone: D.Tone } => {
  if (r.paid >= r.amount) return { label: 'Paid', tone: 'ok' };
  const d = D.daysFrom(r.due);
  if (r.paid > 0) return d < 0 ? { label: 'Part-paid · late', tone: 'err' } : { label: 'Part-paid', tone: 'warn' };
  if (d < 0) return { label: `Late · ${-d} days`, tone: 'err' };
  if (d === 0) return { label: 'Due today', tone: 'info' };
  return { label: 'Due ' + r.due.replace(' 2026', ''), tone: 'neutral' };
};

/** Split "15 Oct 2026, 09:12" into date and time parts for tables. */
export const splitAt = (at: string) => { const [d, t] = at.split(', '); return { d, t: t ?? '' }; };
