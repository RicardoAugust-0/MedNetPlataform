import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useReminders } from '../hooks/useReminders';
import { useConfirm } from '../hooks/useConfirm';
import { fmtDate } from '../utils';

const today = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};
const fmtDisplayDate = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  const t = new Date(); t.setHours(0,0,0,0);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  if (diff < 0) return `Atrasado · ${d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })}`;
  return d.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' });
};

const ICON_TABS = [
  { label: 'Frota',   icons: ['truck', 'car', 'gas-station', 'tool'] },
  { label: 'Contato', icons: ['phone', 'user', 'message', 'id'] },
  { label: 'Alerta',  icons: ['alert-triangle', 'flame', 'clock', 'flag'] },
  { label: 'Admin',   icons: ['file', 'clipboard', 'calendar', 'building'] },
];

function IconPicker({ value, onChange }) {
  const [activeTab, setActiveTab] = useState(0);
  return (
    <div>
      <div className="icon-picker-tabs">
        {ICON_TABS.map((t, i) => (
          <button key={t.label} type="button" className={`btn btn-sm ${activeTab === i ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab(i)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="icon-picker-grid">
        {ICON_TABS[activeTab].icons.map(ic => (
          <button
            key={ic}
            type="button"
            className={`icon-picker-btn ${value === ic ? 'selected' : ''}`}
            onClick={() => onChange(value === ic ? null : ic)}
            title={ic}
          >
            <i className={`ti ti-${ic}`}></i>
          </button>
        ))}
      </div>
    </div>
  );
}

function EditModal({ reminder, onSave, onClose }) {
  const [title, setTitle] = useState(reminder.title);
  const [sub,   setSub]   = useState(reminder.sub || '');
  const [date,  setDate]  = useState(reminder.date);
  const [time,  setTime]  = useState(reminder.time);
  const [prio,  setPrio]  = useState(reminder.urgent ? 'urgent' : '');
  const [icon,  setIcon]  = useState(reminder.icon || null);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), sub: sub.trim(), date: date || today(), time: time || '10:00', urgent: prio === 'urgent', icon });
  };

  return createPortal(
    <div className="edit-reminder-modal" onClick={onClose}>
      <div className="edit-reminder-modal-card" onClick={e => e.stopPropagation()}>
        <div className="add-reminder-title" style={{ marginBottom: 14 }}><i className="ti ti-pencil"></i> Editar lembrete</div>
        <div className="form-group">
          <label className="form-label">Título</label>
          <input className="form-control" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Data</label>
            <input className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Hora</label>
            <input className="form-control" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Prioridade</label>
          <select className="form-control" value={prio} onChange={e => setPrio(e.target.value)}>
            <option value="">Normal</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Detalhe (opcional)</label>
          <input className="form-control" value={sub} onChange={e => setSub(e.target.value)} placeholder="Ex: motorista Carlos · BR-101" />
        </div>
        <div className="form-group">
          <label className="form-label">Ícone</label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave}>
            <i className="ti ti-check"></i> Salvar
          </button>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Agenda() {
  const { reminders, loading, add, toggle, remove, update } = useReminders();
  const confirm = useConfirm();
  const [title,  setTitle]  = useState('');
  const [time,   setTime]   = useState('10:00');
  const [date,   setDate]   = useState(today());
  const [prio,   setPrio]   = useState('');
  const [sub,    setSub]    = useState('');
  const [icon,   setIcon]   = useState(null);
  const [filter, setFilter] = useState('hoje');
  const [editingReminder, setEditingReminder] = useState(null);

  const todayStr = today();

  const sorted = [...reminders]
    .filter(r => {
      if (filter === 'hoje')   return r.date === todayStr;
      if (filter === 'futuros') return r.date > todayStr;
      return true;
    })
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });

  const handleRemove = async (id) => {
    const r = reminders.find(x => x.id === id);
    if (!r || !(await confirm({ title: 'Excluir lembrete', message: `Excluir lembrete "${r.title}"?`, danger: true }))) return;
    remove(id);
  };

  const handleAdd = () => {
    if (!title.trim()) return;
    add({ title: title.trim(), sub: sub.trim(), time: time || '10:00', urgent: prio === 'urgent', date: date || today(), icon });
    setTitle(''); setSub(''); setTime('10:00'); setDate(today()); setPrio(''); setIcon(null);
  };

  const handleEditSave = (fields) => {
    update(editingReminder.id, fields);
    setEditingReminder(null);
  };

  const done  = reminders.filter(r => r.done).length;
  const overdue = reminders.filter(r => !r.done && r.date < todayStr).length;

  if (loading) return <div className="empty-state"><i className="ti ti-loader-2"></i> Carregando...</div>;

  return (
    <div className="agenda-layout">
      <div>
        <div className="reminders-header">
          <div>
            <div className="reminders-title">Agenda & Lembretes · {fmtDate()}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {done} concluídos · {reminders.length} total {overdue > 0 && <span style={{ color: 'var(--danger-500)', fontWeight: 600 }}>· {overdue} atrasado{overdue > 1 ? 's' : ''}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['hoje','futuros','todos'].map(f => (
              <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f)}>
                {f === 'hoje' ? 'Hoje' : f === 'futuros' ? 'Próximos' : 'Todos'}
              </button>
            ))}
          </div>
        </div>

        {sorted.length === 0
          ? <div className="empty-state"><i className="ti ti-bell-off"></i>Sem lembretes para este período</div>
          : sorted.map(r => (
            <div key={r.id} className={`reminder-item ${r.urgent ? 'urgent' : ''} ${r.done ? 'done' : ''} ${!r.done && r.date < todayStr ? 'urgent' : ''}`}>
              <div className="reminder-icon-col">
                <i className={`ti ti-${r.icon || 'bell'}`} style={{ color: r.icon ? 'var(--accent-500)' : 'var(--text-muted)' }}></i>
              </div>
              <div className="reminder-time">
                <div>{r.time}</div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 1 }}>{fmtDisplayDate(r.date)}</div>
              </div>
              <div className="reminder-body">
                <div className="reminder-title">{r.title}</div>
                {r.sub && <div className="reminder-sub">{r.sub}</div>}
              </div>
              <button className="reminder-check" onClick={() => toggle(r.id)} title={r.done ? 'Reabrir' : 'Concluir'}>
                {r.done && <i className="ti ti-check"></i>}
              </button>
              <button className="btn-icon" style={{ color: 'var(--text-muted)' }} onClick={() => setEditingReminder(r)} title="Editar">
                <i className="ti ti-pencil"></i>
              </button>
              <button className="btn-icon" style={{ color: 'var(--text-muted)' }} onClick={() => handleRemove(r.id)} title="Excluir">
                <i className="ti ti-trash"></i>
              </button>
            </div>
          ))
        }
      </div>

      <div className="add-reminder-card">
        <div className="add-reminder-title"><i className="ti ti-plus"></i> Adicionar lembrete</div>
        <div className="form-group">
          <label className="form-label">Título</label>
          <input className="form-control" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: retornar contato com motorista" onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Data</label>
            <input className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Hora</label>
            <input className="form-control" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Prioridade</label>
          <select className="form-control" value={prio} onChange={e => setPrio(e.target.value)}>
            <option value="">Normal</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Detalhe (opcional)</label>
          <input className="form-control" value={sub} onChange={e => setSub(e.target.value)} placeholder="Ex: motorista Carlos · BR-101" />
        </div>
        <div className="form-group">
          <label className="form-label">Ícone</label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleAdd}>
          <i className="ti ti-plus"></i> Adicionar
        </button>
      </div>

      {editingReminder && (
        <EditModal
          reminder={editingReminder}
          onSave={handleEditSave}
          onClose={() => setEditingReminder(null)}
        />
      )}
    </div>
  );
}
