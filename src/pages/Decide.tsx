import { useState } from 'react';
import { CheckCircle2, Send, XCircle, Wallet, UserRound } from 'lucide-react';
import { useStore, useLookups, money } from '../store';
import { type Job } from '../data';
import { Btn, Field, KV, Modal, Note, Reason, Text } from '../ui';
import { approveJob, declineJob, defaultCover, canAskLandlord, jobLimit } from './shared';

/* The Supervisor's three answers for a job over the landlord's job limit (same file in both portals;
   in the Office Admin portal it only shows inside the "Prototype: the Supervisor's answer" box):
   1. Approve · manage under the plan: the maintenance budget pays all of it and the contractor gets the job.
   2. Approve · send to the landlord: the Office Admin sends the landlord a quote first. The plan covers part, the landlord pays the rest.
   3. Decline: nothing is taken from the budget. */

export function DecisionButtons({ j, sm, block }: { j: Job; sm?: boolean; block?: boolean }) {
  const s = useStore(); const L = useLookups();
  const [m, setM] = useState<'' | 'landlord' | 'decline'>('');
  const ask = canAskLandlord(j, L);
  return <>
    <Btn sm={sm} block={block} icon={<CheckCircle2 size={sm ? 14 : 16} />} onClick={() => approveJob(s, j, L, 'Under plan')}>{sm ? 'Manage under plan' : 'Approve · manage under the plan'}</Btn>
    {ask && <Btn sm={sm} block={block} kind="outline" icon={<Send size={sm ? 14 : 16} />} onClick={() => setM('landlord')}>{sm ? 'Send to landlord' : 'Approve · send to the landlord'}</Btn>}
    <Btn sm={sm} block={block} kind={sm ? 'outline' : 'ghost'} icon={<XCircle size={sm ? 14 : 16} />} onClick={() => setM('decline')}>Decline</Btn>
    {m === 'landlord' && <LandlordModal j={j} onClose={() => setM('')} />}
    {m === 'decline' && <DeclineJob j={j} onClose={() => setM('')} />}
  </>;
}

export function DeclineJob({ j, onClose }: { j: Job; onClose: () => void }) {
  const s = useStore();
  return <Reason danger title="Decline this job" sub="The Office Admin is told. The budget is not touched." cta="Decline" options={['Too expensive, get another quote', 'Not urgent, wait', 'Landlord will fix it themselves', 'Not LSP’s responsibility']} onClose={onClose} onDone={r => { declineJob(s, j, r); onClose(); }} />;
}

/** Send to the landlord: choose how much the plan covers. The landlord pays the rest after approving the quote. */
export function LandlordModal({ j, onClose }: { j: Job; onClose: () => void }) {
  const s = useStore(); const L = useLookups(); const p = L.prop(j.property); const ll = L.landlord(p?.owner);
  const limit = jobLimit(j, L); const left = p ? Math.max(0, p.budget - p.used) : 0;
  const [cov, setCov] = useState(String(defaultCover(j, L)));
  const c = Math.max(0, Math.min(+cov || 0, j.price)); const pays = Math.round((j.price - c) * 100) / 100;
  return <Modal title="Approve and send to the landlord" sub={`The Office Admin sends ${ll?.name ?? 'the landlord'} a quote showing what the plan covers and what they pay. No work starts until they approve it.`} onClose={onClose}
    footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn icon={<Send size={16} />} disabled={c > left} onClick={() => { approveJob(s, j, L, 'Landlord', c); onClose(); }}>Approve and send to {ll?.name.split(' ')[0] ?? 'landlord'}</Btn></>}>
    <Field label="The plan covers (£)" hint={`Suggested: up to the ${money(limit)} job limit. ${money(left)} left in this home's maintenance budget. Use 0 if the landlord pays it all.`}><Text value={cov} onChange={setCov} /></Field>
    <div className="covsplit">
      <div><span className="caption">Job total</span><b>{money(j.price)}</b></div>
      <div className="ok"><span className="caption"><Wallet size={12} /> Plan covers</span><b>{money(c)}</b></div>
      <div className="you"><span className="caption"><UserRound size={12} /> {ll?.name.split(' ')[0] ?? 'Landlord'} pays</span><b>{money(pays)}</b></div>
    </div>
    {c > left ? <Note tone="err">Only {money(left)} is left in this home's maintenance budget.</Note> : <KV rows={[['Taken from the budget now', money(c)], ['Budget left after', money(left - c)], ['If the landlord says no', `${money(c)} goes back into the budget`]]} />}
  </Modal>;
}
