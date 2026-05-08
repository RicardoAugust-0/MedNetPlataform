import { useState, useEffect } from 'react';

export function ElapsedTimer({ since }) {
  const [mins, setMins] = useState(() => since ? Math.floor((Date.now() - new Date(since)) / 60000) : 0);
  
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setMins(Math.floor((Date.now() - new Date(since)) / 60000)), 30000);
    return () => clearInterval(id);
  }, [since]);
  
  if (!since || mins < 2) return null;
  const color = mins >= 20 ? 'var(--danger-500)' : mins >= 8 ? 'var(--warning-500)' : 'var(--text-muted)';
  const label = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}min` : ''}` : `${mins}min`;
  
  return (
    <span style={{ fontSize: 10.5, color, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>
      <i className="ti ti-clock" style={{ fontSize: 9, marginRight: 2 }}></i>{label} na fila
    </span>
  );
}

export const sevClass = (d) => d.severidade === 'Gravíssimo' ? 'danger' : d.severidade === 'Grave' ? 'warning' : 'ok';

export const TiposBadge = ({ tipos }) =>
  tipos?.length > 0 ? <div className="d-tags">{tipos.map((t, i) => <span key={i} className="d-tag">{t}</span>)}</div> : null;

export const applyTemplate = (rawText, d) => {
  if (!rawText) return '';
  const hour = new Date().getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  
  const nomeMotorista = (!d.nome || d.nome === d.placa || d.nome === '—') ? 'o condutor' : d.nome;
  
  return rawText
    .replace(/(?:\{\{saudacao\}\}|\[SAUDACAO\]|\[SAUDAÇÃO\])/gi, saudacao)
    .replace(/(?:\{\{nome\}\}|\[NOME\])/gi, nomeMotorista)
    .replace(/(?:\{\{placa\}\}|\[PLACA\])/gi, d.placa || '—')
    .replace(/(?:\{\{transportadora\}\}|\[TRANSPORTADORA\]|\[EMPRESA\])/gi, d.transportadora || '—')
    .replace(/\[HORA\]/gi, new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
};

export const EmptyState = ({ icon, msg, sub }) => (
  <div className="empty-state">
    <i className={`ti ${icon}`}></i>{msg}
    {sub && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>{sub}</div>}
  </div>
);

export function exportCSV(rows) {
  const header = ['Data', 'Hora', 'Motorista', 'Placa', 'Transportadora', 'Tipo', 'Operador', 'Observação'];
  const lines = rows.map(r => [
    new Date(r.created_at).toLocaleDateString('pt-BR'),
    r.hora || '',
    r.motorista || '',
    r.placa || '',
    r.transportadora || '',
    { intervencao: 'Intervenção', reportar: 'Reportar', descarte: 'Descarte', limpeza: 'Limpeza' }[r.tipo] || r.tipo,
    r.operador || '',
    (r.obs || '').replace(/,/g, ';'),
  ].map(v => `"${v}"`).join(','));
  const csv = [header.join(','), ...lines].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `atendimentos_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}
