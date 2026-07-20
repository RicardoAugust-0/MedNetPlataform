import { useState, useMemo } from 'react';
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
      <div className="edit-reminder-modal-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="edit-reminder-modal-title">
        <div id="edit-reminder-modal-title" className="add-reminder-title" style={{ marginBottom: 14 }}><i className="ti ti-pencil"></i> Editar lembrete</div>
        <div className="form-group">
          <label className="form-label" htmlFor="edit-reminder-title">Título</label>
          <input id="edit-reminder-title" className="form-control" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="edit-reminder-date">Data</label>
            <input id="edit-reminder-date" className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="edit-reminder-time">Hora</label>
            <input id="edit-reminder-time" className="form-control" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="edit-reminder-prio">Prioridade</label>
          <select id="edit-reminder-prio" className="form-control" value={prio} onChange={e => setPrio(e.target.value)}>
            <option value="">Normal</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="edit-reminder-sub">Detalhe (opcional)</label>
          <input id="edit-reminder-sub" className="form-control" value={sub} onChange={e => setSub(e.target.value)} placeholder="Ex: motorista Carlos · BR-101" />
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

function CalendarView({ reminders, onSelectDay, selectedDay }) {
  const [calDate, setCalDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const todayStr = today();
  const weekdays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  const cells = useMemo(() => {
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const result = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrev - i);
      result.push({ date: d, current: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      result.push({ date: new Date(year, month, d), current: true });
    }
    const remaining = 42 - result.length;
    for (let d = 1; d <= remaining; d++) {
      result.push({ date: new Date(year, month + 1, d), current: false });
    }
    return result;
  }, [calDate]);

  const remindersByDay = useMemo(() => {
    const map = {};
    reminders.forEach(r => {
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });
    return map;
  }, [reminders]);

  const toISO = (d) => {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  };

  const prevMonth = () => setCalDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCalDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const monthLabel = calDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="agenda-cal-nav">
        <button className="btn btn-sm btn-ghost" onClick={prevMonth}><i className="ti ti-chevron-left"></i></button>
        <span className="agenda-cal-title">{monthLabel}</span>
        <button className="btn btn-sm btn-ghost" onClick={nextMonth}><i className="ti ti-chevron-right"></i></button>
      </div>
      <div className="agenda-cal-grid">
        {weekdays.map(w => <div key={w} className="agenda-cal-weekday">{w}</div>)}
        {cells.map((cell, i) => {
          const iso = toISO(cell.date);
          const dayRems = remindersByDay[iso] || [];
          const isToday = iso === todayStr;
          const isSelected = iso === selectedDay;
          return (
            <div
              key={i}
              className={`agenda-cal-day${!cell.current ? ' other-month' : ''}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
              onClick={() => onSelectDay(iso === selectedDay ? null : iso)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectDay(iso === selectedDay ? null : iso); } }}
            >
              <div className="agenda-cal-day-num">{cell.date.getDate()}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {dayRems.slice(0, 5).map(r => (
                  <span key={r.id} className={`agenda-cal-dot${r.urgent ? ' urgent' : ''}${r.done ? ' done' : ''}`} title={r.title} />
                ))}
                {dayRems.length > 5 && <span style={{ fontSize: 8, color: 'var(--text-muted)', alignSelf: 'center' }}>+{dayRems.length - 5}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
  const [busca,  setBusca]  = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [selectedDay, setSelectedDay] = useState(null);
  const [editingReminder, setEditingReminder] = useState(null);

  const todayStr = today();

  const normalizeText = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const sorted = [...reminders]
    .filter(r => {
      if (selectedDay) return r.date === selectedDay;
      if (filter === 'hoje')    return r.date === todayStr;
      if (filter === 'futuros') return r.date > todayStr;
      return true;
    })
    .filter(r => {
      if (!busca.trim()) return true;
      const q = normalizeText(busca);
      return normalizeText(r.title).includes(q) || normalizeText(r.sub).includes(q);
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
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setViewMode('list'); setSelectedDay(null); }}
              title="Visão lista"
            >
              <i className="ti ti-list"></i>
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'calendar' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('calendar')}
              title="Visão calendário"
            >
              <i className="ti ti-calendar"></i>
            </button>
            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
            {viewMode === 'list' && !selectedDay && ['hoje','futuros','todos'].map(f => (
              <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f)}>
                {f === 'hoje' ? 'Hoje' : f === 'futuros' ? 'Próximos' : 'Todos'}
              </button>
            ))}
            {selectedDay && (
              <button className="btn btn-sm btn-ghost" onClick={() => setSelectedDay(null)}>
                <i className="ti ti-x"></i> {selectedDay}
              </button>
            )}
          </div>
        </div>

        {viewMode === 'calendar' && (
          <div style={{ marginBottom: 16 }}>
            <CalendarView
              reminders={reminders}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
            {selectedDay && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              <i className="ti ti-filter"></i> Filtrando por {selectedDay}
            </div>}
          </div>
        )}

        <div className="agenda-search">
          <i className="ti ti-search"></i>
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por título ou detalhe…"
          />
          {busca && <button className="btn-icon" style={{ fontSize: 12, color: 'var(--text-muted)' }} onClick={() => setBusca('')}><i className="ti ti-x"></i></button>}
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
          <label className="form-label" htmlFor="new-reminder-title">Título</label>
          <input id="new-reminder-title" className="form-control" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: retornar contato com motorista" onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="new-reminder-date">Data</label>
            <input id="new-reminder-date" className="form-control" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="new-reminder-time">Hora</label>
            <input id="new-reminder-time" className="form-control" type="time" value={time} onChange={e => setTime(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="new-reminder-prio">Prioridade</label>
          <select id="new-reminder-prio" className="form-control" value={prio} onChange={e => setPrio(e.target.value)}>
            <option value="">Normal</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="new-reminder-sub">Detalhe (opcional)</label>
          <input id="new-reminder-sub" className="form-control" value={sub} onChange={e => setSub(e.target.value)} placeholder="Ex: motorista Carlos · BR-101" />
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
