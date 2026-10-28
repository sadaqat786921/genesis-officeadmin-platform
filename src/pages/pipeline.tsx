import { useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Check, GripVertical, Info, Lock, LayoutGrid, List, Clock, CalendarClock } from 'lucide-react';
import { Avatar, Btn, Modal } from '../ui';
import { adminName } from './shared';

/* Shared pipeline board (Lettings, Planned Switch). Same file in both portals.
   Columns with a coloured dot, count and total; cards with the home, the money, who owns it,
   whose turn it is, what happens next and how long it has waited. Quiet cards turn red. */

export type Tone = 'info' | 'brand' | 'warn' | 'ok' | 'err' | 'neutral';
export type Turn = 'Supervisor' | 'Office Admin' | 'Applicant' | 'Landlord' | 'Referencing' | 'Done';
const TURN_TONE: Record<Turn, Tone> = { Supervisor: 'brand', 'Office Admin': 'info', Applicant: 'warn', Landlord: 'warn', Referencing: 'neutral', Done: 'ok' };
export const STALE_DAYS = 5;

export interface PCard {
  key: string; name: string; sub: string; photo?: string; amount?: string; amountNote?: string; owner?: string;
  status: ReactNode; turn?: Turn; next?: string; when?: string; age?: string; stale?: boolean; mine?: boolean; muted?: boolean; badge?: string;
  action?: { label: string; run: () => void; kind?: 'primary' | 'outline' }; onMove?: () => void; onOpen: () => void;
}
export interface PCol { key: string; title: string; tone: Tone; hint: string; total?: string; cards: PCard[]; dropNote?: string }

export function ViewToggle<T extends string>({ value, onChange, items }: { value: T; onChange: (v: any) => void; items: { id: T; label: string; icon: 'board' | 'list' }[] }) {
  return <div className="pview" role="tablist">{items.map(i => <button key={i.id} role="tab" aria-selected={value === i.id} className={value === i.id ? 'on' : ''} onClick={() => onChange(i.id)}>{i.icon === 'board' ? <LayoutGrid size={14} /> : <List size={14} />}{i.label}</button>)}</div>;
}

export function PersonChips({ value, onChange, people, all = 'Whole team' }: { value: string; onChange: (v: string) => void; people: { id: string; count: number }[]; all?: string }) {
  return <div className="pchips">
    <button className={`pchip${value === 'all' ? ' on' : ''}`} onClick={() => onChange('all')}>{all}</button>
    {people.map(p => <button key={p.id} className={`pchip${value === p.id ? ' on' : ''}`} onClick={() => onChange(p.id)}><Avatar id={p.id} />{adminName(p.id)}<em>{p.count}</em></button>)}
  </div>;
}

export function PipeStats({ items }: { items: [string, ReactNode, Tone?][] }) {
  return <div className="pmetrics">{items.map(([k, v, t]) => <span key={k}>{k} <b className={t ? 'c-' + t : ''}>{v}</b></span>)}</div>;
}

export function ChaseBar({ count, what, onShow, showing, rule = `${STALE_DAYS}+ days in the same stage.` }: { count: number; what: string; onShow?: () => void; showing?: boolean; rule?: string }) {
  if (!count) return <div className="chase ok"><Check size={16} /><span><b>Nothing waiting too long.</b> No {what} needs chasing today.</span></div>;
  return <div className="chase"><AlertTriangle size={16} /><span><b>{count} {count === 1 ? what + ' needs' : what + 's need'} chasing.</b> {rule} They are marked in red.</span>{onShow && <button className="link" onClick={onShow}>{showing ? 'Show all' : 'Show only these'}</button>}</div>;
}

export function PipeBoard({ cols, onDrop, hint }: { cols: PCol[]; onDrop?: (card: string, col: string) => void; hint?: string }) {
  const [drag, setDrag] = useState<string | null>(null); const [over, setOver] = useState<string | null>(null);
  return <>
    <div className="pipe">{cols.map(c => <section key={c.key} className={`pcol${over === c.key ? ' over' : ''}`} aria-label={c.title}
      onDragOver={e => { if (drag && onDrop) { e.preventDefault(); setOver(c.key); } }} onDragLeave={() => setOver(o => o === c.key ? null : o)}
      onDrop={e => { e.preventDefault(); if (drag && onDrop) onDrop(drag, c.key); setDrag(null); setOver(null); }}>
      <header className="pcol-h">
        <span className={`pdot d-${c.tone}`} /><b>{c.title}</b><span className="pcol-n">{c.cards.length}</span><span className="grow" />{c.total && <span className="pcol-v">{c.total}</span>}
      </header>
      <span className="pcol-hint">{c.hint}</span>
      <div className="pcards">
        {c.cards.map(k => <Card key={k.key} k={k} draggable={!!onDrop && !k.muted} onDrag={setDrag} />)}
        {!c.cards.length && <div className="pempty">{over === c.key ? 'Drop here' : 'No one here'}</div>}
      </div>
    </section>)}</div>
    {hint && <p className="phint"><Info size={13} />{hint}</p>}
  </>;
}

function Card({ k, draggable, onDrag }: { k: PCard; draggable: boolean; onDrag: (k: string | null) => void }) {
  return <article className={`plcard${k.stale ? ' stale' : ''}${k.mine ? ' mine' : ''}${k.muted ? ' muted' : ''}`} tabIndex={0} role="button" aria-label={`Open ${k.name}`}
    draggable={draggable} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDrag(k.key); }} onDragEnd={() => onDrag(null)}
    onClick={k.onOpen} onKeyDown={e => e.key === 'Enter' && k.onOpen()}>
    {k.mine && <span className="pturnflag"><Clock size={11} /> Your turn</span>}
    <div className="plcard-top">
      {k.photo ? <img className="pthumb" src={k.photo} alt="" /> : <Avatar name={k.name} />}
      <div className="stack grow"><b className="pname">{k.name}</b><span className="psub">{k.sub}</span></div>
      {draggable && <GripVertical size={14} className="pgrip" aria-hidden="true" />}
    </div>
    {(k.amount || k.owner || k.badge) && <div className="pamt">
      {k.amount && <b>{k.amount}{k.amountNote && <em>{k.amountNote}</em>}</b>}<span className="grow" />
      {k.badge && <span className="pbadge">{k.badge}</span>}
      {k.owner && <span className="powner">{adminName(k.owner).split(' ')[0]}<Avatar id={k.owner} /></span>}
    </div>}
    <div className="pstatus">{k.status}</div>
    {(k.turn || k.next) && <div className="pnext">{k.turn && <span className={`pturn t-${TURN_TONE[k.turn]}`}>{k.turn}</span>}{k.next && <span>Next: {k.next}</span>}</div>}
    {k.when && <span className="pwhen"><CalendarClock size={12} />{k.when}</span>}
    {k.age && <span className={`page${k.stale ? ' late' : ''}`}>{k.age}</span>}
    {(k.action || k.onMove) && <div className="pact" onClick={e => e.stopPropagation()}>
      {k.action && <Btn sm kind={k.action.kind ?? 'primary'} onClick={k.action.run}>{k.action.label}</Btn>}
      {k.onMove && <Btn sm kind="outline" onClick={k.onMove}>Move</Btn>}
    </div>}
  </article>;
}

/** "Move" opens this: every stage, the next one ready to use, the others locked with the reason. */
export interface MoveOption { key: string; label: string; state: 'current' | 'done' | 'ok' | 'blocked'; note: string }
export function MoveModal({ name, options, onPick, onClose }: { name: string; options: MoveOption[]; onPick: (key: string) => void; onClose: () => void }) {
  return <Modal title={`Move ${name}`} sub="One stage at a time, so nothing is skipped. Locked stages say why." onClose={onClose} footer={<Btn kind="outline" onClick={onClose}>Close</Btn>}>
    <div className="pmove">{options.map((o, i) => <button key={o.key} className={`pmove-row s-${o.state}`} disabled={o.state !== 'ok'} onClick={() => onPick(o.key)}>
      <span className="pmove-n">{o.state === 'done' ? <Check size={13} /> : o.state === 'blocked' ? <Lock size={12} /> : i + 1}</span>
      <span className="stack grow"><b>{o.label}</b><span className="caption">{o.note}</span></span>
      {o.state === 'current' && <span className="pturn t-brand">Now here</span>}
      {o.state === 'ok' && <span className="pmove-go">Move here <ArrowRight size={14} /></span>}
    </button>)}</div>
  </Modal>;
}

export const daysIn = (n: number) => n <= 0 ? 'Moved here today' : `${n} day${n === 1 ? '' : 's'} in this stage`;
