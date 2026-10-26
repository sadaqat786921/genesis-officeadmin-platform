import { useEffect, useState } from 'react';
import { Home, PoundSterling, Wrench, ShieldCheck, KeyRound, ClipboardCheck, ArrowRight, Check, CircleCheck, Menu, X, Star, LineChart, Send, Plus, Minus, Bell, ChevronRight, CalendarDays, FileText, Sparkles, Users, Building2 } from 'lucide-react';

const NAV = [['services', 'Services'], ['plans', 'Plans'], ['how', 'How it works'], ['about', 'About'], ['contact', 'Contact']] as const;

const SERVICES = [
  { ic: Home, t: 'Full management & Maintenance', d: 'We look after your home from tenant to keys back, so you don’t have to take the calls.', top: true },
  { ic: PoundSterling, t: 'Rent collection', d: 'Rent checked against the bank every month. Late payers get reminders and a call.' },
  { ic: Wrench, t: 'Repairs that get done', d: 'Vetted contractors, photo proof of every job, and nothing over your limit without your OK.' },
  { ic: ShieldCheck, t: 'Safety and compliance', d: 'Gas, electrical, EPC, fire alarms and HMO licences tracked and booked before they end.' },
  { ic: KeyRound, t: 'Lettings and tenant find', d: 'Listed on Rightmove and Zoopla, ID and right to rent checks, referencing and move-in.' },
  { ic: ClipboardCheck, t: 'Inspections', d: 'Move-in, routine and move-out reports with dated photos and meter readings.' },
];

const PLANS = [
  { p: 12, limit: 150, t: 'Essential', d: 'For landlords who like to stay close to every decision.', f: ['Landlord & Tenant Portal', 'Tenant Find & Referencing', 'Rent collection and reminders', 'Safety checks tracked', 'Repairs up to £150 Labour Only', 'Routine Inspection & Photos'] },
  { p: 16, limit: 200, t: 'Complete', d: 'Our most chosen plan. Hands-off, with full visibility.', f: ['Landlord & Tenant Portal', 'Tenant Find & Referencing', 'Rent collection and reminders', 'Repairs up to £200 Labour & Materials', 'Safety checks tracked', 'Repairs up to £150 Labour Only'], top: true },
  { p: 20, limit: 300, t: 'Premium', d: 'For portfolios and shared houses that need the most care.', f: ['Everything in Complete', 'Tenant Find & Referencing', 'HMO licence management', 'Repairs up to £300 Labour & Materials', 'Regular Works e.g Gardening, Cleaning & Window Cleaning'] },
];

const NEXT = [
  { t: 'Tell us about your portfolio', d: 'Share how many properties and homes you look after today.' },
  { t: 'We arrange a conversation', d: 'A member of the team will get in touch to understand your workflows.' },
  { t: 'See Genesis in context', d: 'We show how the platform supports your day-to-day operations.' },
];

const FAQ = [
  { q: 'Is LSP available yet?', a: 'LSP is preparing to launch. Joining the waiting list registers your interest; it does not start a management service or guarantee a pilot place. We will share further details as plans develop.' },
  { q: 'What will the maintenance cover include?', a: 'The proposed service includes a defined annual monetary allowance for qualifying routine maintenance, with a separate limit per job. Coverage, materials, limits and exclusions will depend on the agreed package. Final terms and pricing will be shared before you commit.' },
  { q: 'Can I buy maintenance cover on its own?', a: 'Maintenance is designed to form part of LSP’s property management service, rather than a standalone product.' },
  { q: 'Where will you operate?', a: 'Our initial focus is London and Greater London. Tell us your property area when you register so we can understand demand.' },
];

function Waitlist({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', who: 'Landlord', area: '' }); const [done, setDone] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="modal-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="modal lp-soon" role="dialog" aria-label="Join the waitlist">
      <button className="lp-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
      {done ? <>
        <span className="lp-soon-ic ok"><Check size={26} /></span>
        <h2>You&rsquo;re on the list, {f.name.split(' ')[0]}</h2>
        <p>We&rsquo;ll email {f.email} as soon as LSP opens in {f.area || 'your area'}. Joining the waitlist doesn&rsquo;t start a management service.</p>
        <button className="btn primary lp-big" onClick={onClose}>Done</button>
      </> : <>
        <span className="lp-soon-ic"><Sparkles size={26} /></span>
        <span className="lp-eyebrow" style={{ alignSelf: 'center' }}>Launching soon</span>
        <h2>Join the waitlist</h2>
        <p>Be first to hear when LSP and the Genesis portals open. It only takes a minute.</p>
        <form className="lp-wl" onSubmit={e => { e.preventDefault(); setDone(true); }}>
          <div className="lp-seg">{['Landlord', 'Tenant'].map(w => <button type="button" key={w} className={f.who === w ? 'on' : ''} onClick={() => setF({ ...f, who: w })}>{w === 'Landlord' ? <Building2 size={14} /> : <Users size={14} />}{w}</button>)}</div>
          <input className="input" required placeholder="Full name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} aria-label="Full name" />
          <input className="input" required type="email" placeholder="you@email.co.uk" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} aria-label="Email" />
          <input className="input" placeholder="Property area or postcode" value={f.area} onChange={e => setF({ ...f, area: e.target.value })} aria-label="Area" />
          <button className="btn primary lp-big" type="submit">Join the waitlist <ArrowRight size={16} /></button>
        </form>
      </>}
    </div>
  </div>;
}

/* ---------- phone mockups of the Genesis app ---------- */
function PhoneHome() {
  return <div className="ph-scr">
    <div className="ph-top"><img src="images/sarah.jpg" alt="" /><div><span>Good morning</span><b>Margaret</b></div><span className="ph-bell"><Bell size={15} /><i /></span></div>
    <div className="ph-hero"><span>Your homes · October</span><b>£2,640</b><em>rent collected this month</em><div className="ph-ring"><svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="7" /><circle cx="30" cy="30" r="24" fill="none" stroke="#5BAF00" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 24 * .94} 999`} transform="rotate(-90 30 30)" /></svg><b>94%</b></div></div>
    <div className="ph-row2"><div><span className="tile t-ok"><ShieldCheck size={14} /></span><b>3 of 3</b><em>certificates</em></div><div><span className="tile t-info"><Wrench size={14} /></span><b>1 job</b><em>in progress</em></div></div>
    <div className="ph-card warn"><span className="tile t-warn"><Wrench size={14} /></span><div><b>Boiler · £420</b><em>Over £200 limit</em></div><span className="ph-btn">Review</span></div>
    <div className="ph-label">Your homes</div>
    <div className="ph-home"><div style={{ backgroundImage: 'url(images/home1.jpg)' }} /><div><b>12 Oak Street</b><em>Let · £1,250 pcm</em></div><ChevronRight size={14} /></div>
    <div className="ph-nav"><span className="on"><Home size={15} /></span><span><PoundSterling size={15} /></span><span><Wrench size={15} /></span><span><FileText size={15} /></span></div>
  </div>;
}
function PhoneTenant() {
  return <div className="ph-scr">
    <div className="ph-top"><img src="images/av1.jpg" alt="" /><div><span>Good evening</span><b>Sam</b></div><span className="ph-bell"><Bell size={15} /><i /></span></div>
    <div className="ph-hero green"><span>Next rent · November</span><b>£1,150</b><em>Due 5 Nov · standing order</em><span className="ph-paid"><CircleCheck size={11} />October paid</span></div>
    <div className="ph-row2"><div className="act"><span className="tile t-warn"><Wrench size={14} /></span><b>Report a repair</b></div><div className="act"><span className="tile t-ok"><PoundSterling size={14} /></span><b>Rent and receipts</b></div></div>
    <div className="ph-card"><span className="tile t-info"><Wrench size={14} /></span><div><b>Boiler repair</b><em>Thu 16 Oct · 9–11am</em></div><span className="ph-chip">Booked</span></div>
    <div className="ph-label">Your home</div>
    <div className="ph-home"><div style={{ backgroundImage: 'url(images/home3.jpg)' }} /><div><b>14 Elm Road</b><em>Until 4 May 2027</em></div><ChevronRight size={14} /></div>
    <div className="ph-nav"><span className="on"><Home size={15} /></span><span><PoundSterling size={15} /></span><span><Wrench size={15} /></span><span><FileText size={15} /></span></div>
  </div>;
}
function PhoneApprove() {
  return <div className="ph-scr">
    <div className="ph-bar"><ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /><b>Approve repair</b><span /></div>
    <div className="ph-photo" style={{ backgroundImage: 'url(images/home3.jpg)' }}><span>Photo from tenant</span></div>
    <div className="ph-pad"><b className="ph-h">Boiler repair</b><em>14 Elm Road · HeatRight Ltd</em>
      <div className="ph-price"><span>Quote</span><b>£420</b></div>
      <div className="ph-budget"><div className="flex between"><em>Repair budget after this</em><b>96%</b></div><i><u style={{ width: '70%' }} /><s style={{ width: '26%' }} /></i></div>
      <div className="ph-note"><CircleCheck size={13} />Photo proof required before invoice</div>
      <span className="ph-btn big">Approve £420</span><span className="ph-btn big line">Ask a question</span></div>
  </div>;
}
function PhoneCerts() {
  const rows: [string, string, string][] = [['Gas safety', 'Ends 3 Apr 2027', 'ok'], ['Electrical (EICR)', 'Ends 20 Mar 2029', 'ok'], ['Energy (EPC)', 'Ends 4 Feb 2032', 'ok'], ['Inspection report', 'Done 2 Jul, 10:55', 'info']];
  return <div className="ph-scr">
    <div className="ph-bar"><ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} /><b>12 Oak Street</b><span /></div>
    <div className="ph-tabs"><span>Rent</span><span className="on">Documents</span><span>Jobs</span></div>
    <div className="ph-pad">{rows.map(([t, d, tone]) => <div key={t} className="ph-doc"><span className={`tile t-${tone}`}>{tone === 'ok' ? <ShieldCheck size={14} /> : <CalendarDays size={14} />}</span><div><b>{t}</b><em>{d}</em></div><span className={`chip ${tone}`}>{tone === 'ok' ? 'In date' : 'Report'}</span></div>)}
      <div className="ph-label">Statements</div>
      <div className="ph-doc"><span className="tile t-brand"><FileText size={14} /></span><div><b>September statement</b><em>£1,050 paid to you</em></div><ChevronRight size={14} /></div></div>
  </div>;
}

export default function Landing() {
  const [wl, setWl] = useState(false);
  const [menu, setMenu] = useState(false); const [scrolled, setScrolled] = useState(false); const [open, setOpen] = useState<number[]>([0, 1, 2, 3]);
  const [f, setF] = useState({ name: '', email: '', phone: '', who: 'Landlord', homes: '1', msg: '' }); const [sent, setSent] = useState(false);
  useEffect(() => { const s = () => setScrolled(window.scrollY > 10); s(); window.addEventListener('scroll', s); return () => window.removeEventListener('scroll', s); }, []);
  const to = (id: string) => { setMenu(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return <div className="lp">
    <header className={`lp-head${scrolled ? ' on' : ''}`}>
      <div className="lp-wrap lp-head-in">
        <button className="lp-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Landlord Service Plans home"><img src="images/logo.svg" alt="Landlord Service Plans" /></button>
        <nav className={`lp-nav${menu ? ' open' : ''}`}>{NAV.map(([id, l]) => <button key={id} onClick={() => to(id)}>{l}</button>)}
          <div className="lp-nav-cta"><button className="btn line" onClick={() => { setMenu(false); setWl(true); }}>Join Waitlist</button></div></nav>
        <div className="lp-head-cta"><button className="btn line lp-wl-btn" onClick={() => setWl(true)}>Join Waitlist</button></div>
        <button className="lp-burger" onClick={() => setMenu(m => !m)} aria-label="Menu">{menu ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
    </header>

    {/* HERO */}
    <section className="lp-hero">
      <div className="lp-wrap lp-hero-in">
        <div className="lp-hero-txt">
          <span className="lp-pill"><span className="lp-dot" />Property management for Leeds, Bradford and Wakefield</span>
          <h1>Your rental homes, <span>looked after properly.</span></h1>
          <p>Rent collected, repairs approved, safety checks on time. One trusted team and one clear platform, so you always know what&rsquo;s happening in your homes.</p>
          <div className="lp-hero-cta"><button className="btn accent lp-big" onClick={() => to('contact')}>Get a free plan review <ArrowRight size={18} /></button><button className="btn lp-ghost lp-big" onClick={() => to('plans')}>See our plans</button></div>
          <div className="lp-trust">{['No setup fee', 'Cancel with 2 months notice', 'Every action logged'].map(t => <span key={t}><CircleCheck size={16} />{t}</span>)}</div>
        </div>
        <div className="lp-hero-art">
          <div className="lp-hero-photo" style={{ backgroundImage: 'url(images/home2.jpg)' }} />
          <div className="lp-float f1"><span className="tile t-ok"><PoundSterling size={18} /></span><div><b>94%</b><span>rent collected this month</span></div></div>
          <div className="lp-float f2"><span className="tile t-brand"><Wrench size={18} /></span><div><b>Boiler repair approved</b><span>QuickPlumb · photo proof uploaded</span></div></div>
          <div className="lp-float f3"><ShieldCheck size={18} color="#5BAF00" /><div><b>Gas certificate</b><span>In date until Apr 2027</span></div></div>
        </div>
      </div>
    </section>

    {/* SERVICES */}
    <section className="lp-sec" id="services">
      <div className="lp-wrap">
        <div className="lp-title"><span className="lp-eyebrow">Services</span><h2>Everything a rental home needs, in one plan</h2><p>From the first viewing to the last meter reading, our team handles it and you can see it all.</p></div>
        <div className="lp-svc">{SERVICES.map(s => <div key={s.t} className={`lp-card${s.top ? ' feat' : ''}`}>
          {s.top && <span className="lp-feat-tag"><Star size={12} fill="currentColor" />Included in every plan</span>}
          <span className="lp-ic"><s.ic size={22} /></span><h3>{s.t}</h3><p>{s.d}</p>
          {s.top && <ul className="lp-feat-list">{['Tenants, rent and keys handled', 'Maintenance within your yearly budget', 'Vetted contractors, photo proof'].map(x => <li key={x}><Check size={14} />{x}</li>)}</ul>}
        </div>)}</div>
      </div>
    </section>

    {/* PLANS */}
    <section className="lp-sec lp-alt" id="plans">
      <div className="lp-wrap">
        <div className="lp-title wide"><span className="lp-eyebrow">Plans</span><h2>Simple plans inclusive of maintenance. A fee of the rent, nothing hidden.</h2><p>Your plan sets how much we can spend on a repair without asking you first. Anything above comes to you to approve.</p></div>
        <div className="lp-plans">{PLANS.map(pl => <div key={pl.p} className={`lp-plan${pl.top ? ' top' : ''}`}>
          {pl.top && <span className="lp-badge"><Star size={12} fill="currentColor" />Most chosen</span>}
          <span className="lp-plan-name">{pl.t}</span>
          <div className="lp-price"><b>{pl.p}%</b><span>of monthly rent</span></div>
          <p>{pl.d}</p>
          <div className="lp-limit"><Wrench size={15} />Repair limit <b>£{pl.limit}</b> Per Job</div>
          <ul>{pl.f.map(x => <li key={x}><Check size={16} />{x}</li>)}</ul>
          <button className={`btn ${pl.top ? 'accent' : 'line'} lp-big`} onClick={() => to('contact')}>Choose {pl.t}</button>
        </div>)}</div>
        <p className="lp-small">Every plan includes a yearly repair budget for each home, with alerts to you at 70%, 90% and 100%.</p>
      </div>
    </section>

    {/* PLATFORM · MOBILE APP */}
    <section className="lp-sec lp-dark" id="how">
      <div className="lp-wrap lp-plat">
        <div className="lp-plat-txt">
          <span className="lp-eyebrow light">The Genesis platform</span>
          <h2>See everything. Approve anything. From anywhere.</h2>
          <p>Our team runs your homes on Genesis. Soon you&rsquo;ll have your own login to see rent, repairs, certificates and statements as they happen, right from your phone.</p>
          <ul>{[[LineChart, 'Live rent and repair budget'], [ShieldCheck, 'Every certificate with its end date'], [Wrench, 'Approve repairs over your limit in one tap'], [ClipboardCheck, 'Inspection reports with dated photos']].map(([Ic, t]) => { const I = Ic as typeof Home; return <li key={t as string}><span><I size={16} /></span>{t as string}</li>; })}</ul>
          <div className="lp-hero-cta"><button className="btn accent lp-big" onClick={() => setWl(true)}>Landlord Portal <span className="lp-soon-chip">Soon</span></button><button className="btn lp-ghost lp-big" onClick={() => setWl(true)}>Tenant Portal <span className="lp-soon-chip">Soon</span></button></div>
        </div>
        <div className="lp-phones two">
          <div className="ph-wrap pa"><div className="phone"><span className="ph-notch" /><PhoneHome /></div><span className="ph-tag">Landlord app</span></div>
          <div className="ph-wrap pb"><div className="phone"><span className="ph-notch" /><PhoneTenant /></div><span className="ph-tag green">Tenant app</span></div>
        </div>
      </div>
    </section>

    {/* ABOUT */}
    <section className="lp-sec" id="about">
      <div className="lp-wrap lp-about">
        <div className="lp-about-pics"><div style={{ backgroundImage: 'url(images/home1.jpg)' }} /><div style={{ backgroundImage: 'url(images/home2.jpg)' }} /></div>
        <div>
          <span className="lp-eyebrow">About LSP</span>
          <h2>A local team that treats your homes like their own</h2>
          <p>Landlord Service Plans manages homes and shared houses across London. Each landlord has a named Office Admin, every repair is checked with photos, and every action is saved, so nothing gets lost and nothing is hidden.</p>
          <div className="lp-values">{[['Clear', 'Plain monthly statements and no surprise bills.'], ['Careful', 'Vetted, insured contractors with documents in date.'], ['Compliant', 'Certificates booked before they end, not after.'], ['Close', 'A real person who knows your homes by name.']].map(([t, d]) => <div key={t}><b>{t}</b><span>{d}</span></div>)}</div>
        </div>
      </div>
    </section>

    {/* CONTACT · JOIN OUR PLATFORM */}
    <section className="lp-sec lp-alt" id="contact">
      <div className="lp-wrap lp-contact">
        <div className="lp-contact-info">
          <span className="lp-eyebrow">Contact Us</span>
          <h2>Let&rsquo;s talk about better property management.</h2>
          <p>Get in touch to learn more about Genesis Platform and how it supports your property management operations.</p>
          <h3 className="lp-next-h">What happens next</h3>
          <div className="lp-next">{NEXT.map((n, i) => <div key={n.t}><span>{i + 1}</span><div><b>{n.t}</b><em>{n.d}</em></div></div>)}</div>
        </div>
        <div className="lp-form card">
          {sent ? <div className="lp-sent"><span className="lp-soon-ic ok"><Check size={26} /></span><h3>Thanks, {f.name.split(' ')[0] || 'we got it'}!</h3><p>A member of the team will get in touch on {f.phone || 'the number you gave'} to arrange a conversation.</p><button className="btn line" onClick={() => { setSent(false); setF({ name: '', email: '', phone: '', who: 'Landlord', homes: '1', msg: '' }); }}>Send another message</button></div> :
            <form onSubmit={e => { e.preventDefault(); setSent(true); }}>
              <h3>Join our Platform</h3>
              <div className="lp-seg">{['Landlord', 'Tenant'].map(w => <button type="button" key={w} className={f.who === w ? 'on' : ''} onClick={() => setF({ ...f, who: w })}>{w}</button>)}</div>
              <div className="grid g2" style={{ gap: 14 }}>
                <label className="field"><span>Full name</span><input className="input" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Your name" /></label>
                <label className="field"><span>Phone</span><input className="input" required value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="07700 900000" /></label>
                <label className="field"><span>Email</span><input className="input" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="you@email.co.uk" /></label>
                {f.who === 'Landlord' ? <label className="field"><span>How many homes?</span><select className="input" value={f.homes} onChange={e => setF({ ...f, homes: e.target.value })}>{['1', '2–4', '5–10', 'More than 10'].map(x => <option key={x}>{x}</option>)}</select></label>
                  : <label className="field"><span>Area</span><input className="input" placeholder="e.g. London E1" /></label>}
              </div>
              <label className="field"><span>How can we help?</span><textarea className="input" value={f.msg} onChange={e => setF({ ...f, msg: e.target.value })} placeholder="Tell us about your home or what you need" /></label>
              <label className="check" style={{ fontWeight: 500, color: 'var(--text-secondary)' }}><input type="checkbox" required /> I&rsquo;m happy for LSP to contact me about my enquiry.</label>
              <button className="btn primary lp-big" type="submit"><Send size={16} />Send message</button>
            </form>}
        </div>
      </div>
    </section>

    {/* FAQ */}
    <section className="lp-sec lp-faqsec" id="faq">
      <div className="lp-wrap lp-faq-wrap">
        <span className="lp-eyebrow green">A few things to know</span>
        <h2 className="lp-faq-h">Your questions, answered.</h2>
        <div className="lp-faq">{FAQ.map((x, i) => { const on = open.includes(i); return <div key={x.q} className={`lp-q${on ? ' on' : ''}`}>
          <button onClick={() => setOpen(o => on ? o.filter(k => k !== i) : [...o, i])} aria-expanded={on}><span>{x.q}</span>{on ? <Minus size={16} /> : <Plus size={16} />}</button>
          {on && <p>{x.a}</p>}
        </div>; })}</div>
      </div>
    </section>

    {/* FOOTER */}
    <footer className="lp-foot">
      <div className="lp-wrap">
        <div className="lp-foot-top">
          <div className="lp-foot-brand"><img src="images/logo-white.svg" alt="Landlord Service Plans" /><p>Better management. Better care. Property management for landlords, tenants and letting agents across West Yorkshire.</p></div>
          <div><b>Explore</b>{NAV.map(([id, l]) => <button key={id} onClick={() => to(id)}>{l}</button>)}</div>
          <div><b>Portals</b>{['Landlord login', 'Tenant portal', 'Client portal', 'Contractor sign-up'].map(l => <button key={l} onClick={() => setWl(true)}>{l} <span className="lp-soon-chip">Soon</span></button>)}</div>
          <div><b>Contact</b><span>0113 496 0000</span><span>hello@lsp.co.uk</span><span>40 Park Square, Leeds LS1 2NP</span></div>
        </div>
        <div className="lp-foot-bot"><span>© 2026 Landlord Service Plans. All rights reserved.</span><span>Privacy · Terms · Complaints</span></div>
      </div>
    </footer>
    {wl && <Waitlist onClose={() => setWl(false)} />}
  </div>;
}
