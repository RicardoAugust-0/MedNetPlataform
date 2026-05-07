import { useState } from 'react';
import { useApp } from '../context';
import { fmtDate } from '../utils';

export default function Agenda() {
  const { reminders, setReminders, remNextId, setRemNextId } = useApp();
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('10:00');
  const [prio, setPrio] = useState('');
  const [sub, setSub] = useState('');

  const sorted = [...reminders].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.time.localeCompare(b.time);
  });

  const toggle = (id) => setReminders(reminders.map(r => r.id === id ? { ...r, done: !r.done } : r));

  const remove = (id) => {
    const r = reminders.find(x => x.id === id);
    if (!r || !confirm(`Excluir lembrete "${r.title}"?`)) return;
    setReminders(reminders.filter(x => x.id !== id));
  };

  const add = () => {
    if (!title.trim()) return;
    setReminders([...reminders, { id: remNextId, title: title.trim(), sub: sub.trim(), time: time || '10:00', urgent: prio === 'urgent', done: false }]);
    setRemNextId(remNextId + 1);
    setTitle(''); setSub(''); setTime('10:00'); setPrio('');
  };

  const done = reminders.filter(r => r.done).length;

  return (
    <div className="agenda-layout">
      <div>
        <div className="reminders-header">
          <div className="reminders-title">Lembretes de hoje · {fmtDate()}</div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{done} de {reminders.length} concluídos</span>
        </div>
        <div>
          {sorted.length === 0
            ? <div className="empty-state"><i className="ti ti-bell-off"></i>Sem lembretes</div>
            : sorted.map(r => (
              <div key={r.id} className={`reminder-item ${r.urgent ? 'urgent' : ''} ${r.done ? 'done' : ''}`}>
                <div className="reminder-time">{r.time}</div>
                <div className="reminder-body">
                  <div className="reminder-title">{r.title}</div>
                  {r.sub && <div className="reminder-sub">{r.sub}</div>}
                </div>
                <button className="reminder-check" onClick={() => toggle(r.id)} title={r.done ? 'Reabrir' : 'Concluir'}>
                  {r.done && <i className="ti ti-check"></i>}
                </button>
                <button className="btn-icon" style={{ color: 'var(--text-muted)' }} onClick={() => remove(r.id)} title="Excluir">
                  <i className="ti ti-trash"></i>
                </button>
              </div>
            ))
          }
        </div>
      </div>

      <div className="add-reminder-card">
        <div className="add-reminder-title"><i className="ti ti-plus"></i> Adicionar lembrete</div>
        <div className="form-group">
          <label className="form-label">Título</label>
          <input className="form-control" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: retornar contato com motorista" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Hora</label>
            <input className="form-control" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Prioridade</label>
            <select className="form-control" value={prio} onChange={e => setPrio(e.target.value)}>
              <option value="">Normal</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Detalhe (opcional)</label>
          <input className="form-control" value={sub} onChange={e => setSub(e.target.value)} placeholder="Ex: motorista Carlos · BR-101" />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={add}>
          <i className="ti ti-plus"></i> Adicionar
        </button>
      </div>
    </div>
  );
}
