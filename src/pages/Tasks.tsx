import { useState } from 'react';
import { Plus, CheckCircle2, CircleCheck, Clock, CalendarDays, RotateCcw, CalendarClock, ListChecks, ArrowRight } from 'lucide-react';
import { useStore, type Route } from '../store';
import { parseDate, nowStamp, fmtDate, daysFrom, ME, SUPERVISOR, type Task } from '../data';
import { Btn, Card, Chip, Field, Kpi, Modal, Select, Tabs, Text, When, Empty, Note } from '../ui';
import { PageHeader, crumbsFor } from '../Shell';

const dueLabel = (d: string) => d === '15 Oct 2026' ? 'Today' : d === '16 Oct 2026' ? 'Tomorrow' : d.replace(' 2026', '');
const taskTone = (t: Task) => t.done ? 'ok' : t.late ? 'err' : daysFrom(t.due) <= 0 ? 'warn' : 'info';
const taskLabel = (t: Task) => t.done ? 'Done' : t.late ? 'Late' : daysFrom(t.due) <= 0 ? 'Due today' : 'On track';
const toLabel = (iso: string) => fmtDate(new Date(iso + 'T00:00'));

/** The Office Admin's own task list. Tasks come from the Supervisor, from the system (new enquiry, KYC to check) or are added by the Office Admin. */
export function Tasks() {
  const s = useStore();
  const [tab, setTab] = useState<'open' | 'today' | 'late' | 'done'>('open');
  const [add, setAdd] = useState(false); const [move, setMove] = useState<string | null>(null);
  const T = s.tasks;
  const open = T.filter(t => !t.done), late = open.filter(t => t.late), today = open.filter(t => !t.late && daysFrom(t.due) <= 0), done = T.filter(t => t.done);
  const list = (tab === 'open' ? open : tab === 'today' ? today : tab === 'late' ? late : done).sort((a, b) => Number(b.late) - Number(a.late) || parseDate(a.due).getTime() - parseDate(b.due).getTime());
  const finish = (t: Task) => { s.setTasks(ts => ts.map(x => x.id === t.id ? { ...x, done: true, late: false } : x)); s.log(`Finished task: ${t.title}`, 'My Tasks'); s.toast('Task done'); };
  const undo = (t: Task) => { s.setTasks(ts => ts.map(x => x.id === t.id ? { ...x, done: false, late: daysFrom(x.due) < 0 } : x)); s.log(`Opened task again: ${t.title}`, 'My Tasks'); s.toast('Task opened again'); };
  return <>
    <PageHeader crumbs={crumbsFor('tasks', s.go)} title="My Tasks" action={<Btn icon={<Plus size={18} />} onClick={() => setAdd(true)}>Add task</Btn>} />
    <div className="grid g4">
      <Kpi icon={<ListChecks size={18} />} tone="brand" label="Open" value={open.length} caption="still to do" active={tab === 'open'} onClick={() => setTab('open')} />
      <Kpi icon={<CalendarDays size={18} />} tone="warn" label="Due today" value={today.length} caption="15 Oct 2026" active={tab === 'today'} onClick={() => setTab('today')} />
      <Kpi icon={<Clock size={18} />} tone="err" label="Late" value={late.length} caption={`${SUPERVISOR} can see late tasks`} active={tab === 'late'} onClick={() => setTab('late')} />
      <Kpi icon={<CircleCheck size={18} />} tone="ok" label="Done" value={done.length} caption="this month" active={tab === 'done'} onClick={() => setTab('done')} />
    </div>
    <Card title="Tasks" sub="Click a task to open the record it is about. Tick it off when it's done, or move the date if it has to wait."
      action={<Tabs value={tab} onChange={setTab} items={[{ id: 'open', label: 'Open', count: open.length }, { id: 'today', label: 'Today', count: today.length }, { id: 'late', label: 'Late', count: late.length }, { id: 'done', label: 'Done', count: done.length }]} />}>
      <div className="tablewrap"><table className="t"><thead><tr><th>Task</th><th>From</th><th>Created</th><th>Due</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead><tbody>
        {list.map(t => <tr key={t.id} onClick={() => t.link && s.go(t.link.route as Route, t.link.id ?? null)} style={t.link ? undefined : { cursor: 'default' }}>
          <td><span className="stack"><b className="strong">{t.title}</b><span className="caption">{t.area}{t.link ? ' · click to open' : ''}</span></span></td>
          <td><span className="caption" style={{ fontWeight: 600 }}>{t.from ?? (t.area === 'My Day' || t.area === 'General' ? 'You' : 'Genesis')}</span></td>
          <td><When at={t.created} /></td><td><b>{dueLabel(t.due)}</b></td><td><Chip tone={taskTone(t)}>{taskLabel(t)}</Chip></td>
          <td onClick={e => e.stopPropagation()}><div className="flex" style={{ justifyContent: 'flex-end' }}>
            {t.done ? <Btn sm kind="ghost" icon={<RotateCcw size={14} />} onClick={() => undo(t)}>Open again</Btn> : <>
              {t.link && <Btn sm kind="ghost" icon={<ArrowRight size={14} />} onClick={() => s.go(t.link!.route as Route, t.link!.id ?? null)}>Open</Btn>}
              <Btn sm kind="ghost" icon={<CalendarClock size={14} />} onClick={() => setMove(t.id)}>Move date</Btn>
              <Btn sm kind="outline" icon={<CheckCircle2 size={14} />} onClick={() => finish(t)}>Done</Btn></>}
          </div></td></tr>)}
      </tbody></table>{!list.length && <Empty icon={<CircleCheck size={22} />}>Nothing here.</Empty>}</div>
    </Card>
    {add && <AddTask onClose={() => setAdd(false)} />}
    {move && <MoveDate id={move} onClose={() => setMove(null)} />}
  </>;
}

function AddTask({ onClose }: { onClose: () => void }) {
  const s = useStore(); const [t, setT] = useState(''); const [d, setD] = useState('2026-10-16'); const [area, setArea] = useState('General');
  return <Modal title="Add a task" sub="Only you see it. It shows on My Day when it's due." onClose={onClose} footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn disabled={!t.trim()} onClick={() => { s.setTasks(ts => [{ id: 'K' + Date.now(), title: t.trim(), admin: ME, due: toLabel(d), late: false, done: false, created: nowStamp(), area, from: 'You' }, ...ts]); s.log(`Added task: ${t.trim()}`, 'My Tasks'); s.toast('Task added'); onClose(); }}>Add task</Btn></>}>
    <Field label="What needs doing"><Text value={t} onChange={setT} placeholder="e.g. Call the tenant at 5 Mill Lane" /></Field>
    <div className="grid g2"><Field label="Due"><input className="input" type="date" value={d} onChange={e => setD(e.target.value)} /></Field><Field label="Area"><Select value={area} onChange={setArea} options={['General', 'Enquiries', 'Lettings', 'Tenants', 'Jobs', 'Inspections', 'Safety', 'Rent', 'Clients'].map(x => ({ value: x, label: x }))} /></Field></div>
  </Modal>;
}

function MoveDate({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useStore(); const t = s.tasks.find(x => x.id === id)!; const [d, setD] = useState('2026-10-17'); const [why, setWhy] = useState('Waiting for a reply');
  return <Modal title="Move the due date" sub={t.title} onClose={onClose} footer={<><Btn kind="outline" onClick={onClose}>Cancel</Btn><Btn onClick={() => { const due = toLabel(d); s.setTasks(ts => ts.map(x => x.id === id ? { ...x, due, late: daysFrom(due) < 0 } : x)); s.log(`Moved "${t.title}" to ${due}: ${why}`, 'My Tasks'); s.toast(`Moved to ${due}`); onClose(); }}>Move date</Btn></>}>
    <div className="grid g2"><Field label="New due date"><input className="input" type="date" value={d} onChange={e => setD(e.target.value)} /></Field><Field label="Why"><Select value={why} onChange={setWhy} options={['Waiting for a reply', 'Contractor not free until then', 'Tenant asked for another day', 'Waiting for the Supervisor', 'Other'].map(x => ({ value: x, label: x }))} /></Field></div>
    {t.from === SUPERVISOR && <Note>{SUPERVISOR} gave you this task. They see the new date and the reason.</Note>}
  </Modal>;
}
