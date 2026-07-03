import { useState, useEffect } from 'react';
import Skeleton from '../../components/Skeleton.jsx';

export function ElapsedTimer({ since }) {
  const [mins, setMins] = useState(() => since ? Math.floor((Date.now() - new Date(since)) / 60000) : 0);

  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setMins(Math.floor((Date.now() - new Date(since)) / 60000)), 30000);
    return () => clearInterval(id);
  }, [since]);

  if (!since || mins < 2) return null;
  const level = mins >= 20 ? 'danger' : mins >= 8 ? 'warning' : 'muted';
  const label = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}min` : ''}` : `${mins}min`;

  return (
    <span className={`d-chip d-chip-${level}`}>
      <i className="ti ti-clock"></i>{label} na fila
    </span>
  );
}

export const sevClass = (d) => d.severidade === 'Gravíssimo' ? 'danger' : d.severidade === 'Grave' ? 'warning' : 'ok';

export const TiposBadge = ({ tipos }) =>
  tipos?.length > 0 ? <div className="d-tags">{tipos.map((t, i) => <span key={i} className="d-tag">{t}</span>)}</div> : null;

export const getCustomVars = () => {
  try { return JSON.parse(localStorage.getItem('mn_template_vars') || '{}'); } catch { return {}; }
};

export const setCustomVars = (vars) => {
  try { localStorage.setItem('mn_template_vars', JSON.stringify(vars)); } catch { /* storage não crítico */ }
};

export const applyTemplate = (rawText, d) => {
  if (!rawText) return '';
  const hour = new Date().getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const nomeMotorista = (!d.nome || d.nome === d.placa || d.nome === '—') ? 'o condutor' : d.nome;

  let text = rawText
    .replace(/(?:\{\{saudacao\}\}|\[SAUDACAO\]|\[SAUDAÇÃO\])/gi, saudacao)
    .replace(/(?:\{\{nome\}\}|\[NOME\])/gi, nomeMotorista)
    .replace(/(?:\{\{placa\}\}|\[PLACA\])/gi, d.placa || '—')
    .replace(/(?:\{\{transportadora\}\}|\[TRANSPORTADORA\]|\[EMPRESA\])/gi, d.transportadora || '—')
    .replace(/\[HORA\]/gi, new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));

  // Custom user-defined variables
  const customVars = getCustomVars();
  Object.entries(customVars).forEach(([key, val]) => {
    if (!key || val == null) return;
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`\\[${escapedKey}\\]`, 'gi'), val);
  });

  return text;
};

export const DriverListSkeleton = ({ count = 4 }) => (
  <div className="driver-list" aria-busy="true">
    {Array.from({ length: count }).map((_, i) => (
      <div className="driver-item" key={i}>
        <Skeleton circle width={40} height={40} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 12 }}>
          <Skeleton width="40%" height={13} />
          <Skeleton width="65%" height={11} />
        </div>
      </div>
    ))}
  </div>
);

// Escape RFC 4180: envolve em aspas duplas e dobra aspas internas.
function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export function exportCSV(rows) {
  const SEP = ';';
  const header = ['Data', 'Hora', 'Motorista', 'Placa', 'Transportadora', 'Tipo', 'Operador', 'Observação'];
  const lines = rows.map(r => [
    new Date(r.created_at).toLocaleDateString('pt-BR'),
    r.hora || '',
    r.motorista || '',
    r.placa || '',
    r.transportadora || '',
    { intervencao: 'Intervenção', reportar: 'Reportar', descarte: 'Descarte', limpeza: 'Limpeza' }[r.tipo] || r.tipo,
    r.operador || '',
    r.obs || '',
  ].map(csvEscape).join(SEP));
  const csv = [header.map(csvEscape).join(SEP), ...lines].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `atendimentos_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
