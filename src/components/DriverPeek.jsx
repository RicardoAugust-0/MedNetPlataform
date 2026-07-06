import { useState, useRef, useEffect } from 'react';
import Sparkline from './Sparkline';
import { iniciais } from '../utils';

// Agrega os eventos já carregados do motorista (d.eventosDetalhados) em
// contagem por dia, últimos N dias — sem requisição nova, só reagrupa o que
// o Monitor já buscou.
function buildDailyCounts(eventos, days) {
  const buckets = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(d.toDateString(), 0);
  }
  (eventos || []).forEach((e) => {
    if (!e.ts) return;
    const d = new Date(e.ts);
    d.setHours(0, 0, 0, 0);
    const key = d.toDateString();
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  });
  return Array.from(buckets.values());
}

// Popover por CLIQUE (não hover — melhor pra touch/teclado). Ancorado via
// position:absolute relativo a este próprio wrapper — de propósito, não usa
// position:fixed (ver bug de containing-block corrigido no page-transition).
export default function DriverPeek({ driver, sheetsEntry, children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const handleEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const toggle = (e) => {
    e.stopPropagation();
    setOpen((v) => !v);
  };

  const eventos = driver.eventosDetalhados || [];
  const spark = buildDailyCounts(eventos, 7);
  const hasSpark = spark.some((v) => v > 0);
  const ultimoEvento = driver.ultimoEvento || driver.ultimoEventoReportar || null;

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } }}
        style={{ cursor: 'pointer' }}
        title="Ver detalhes"
      >
        {children}
      </span>

      {open && (
        <div
          role="dialog"
          aria-label={`Detalhes de ${driver.nome}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 300, marginTop: 6,
            width: 260, background: 'var(--surface-0)', border: '1px solid var(--border-md, var(--border))',
            borderRadius: 'var(--radius-lg, 12px)', boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(15,25,35,0.18))',
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-500, #9E1A45)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {iniciais(driver.nome)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {driver.nome}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{driver.placa} · {driver.transportadora}</div>
            </div>
          </div>

          {hasSpark && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
                Eventos · últimos 7 dias
              </div>
              <Sparkline data={spark} color="#9E1A45" height={26} />
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div>
              <i className="ti ti-alert-triangle" style={{ marginRight: 5, color: 'var(--text-muted)' }}></i>
              {eventos.length || driver.alertas || driver.reportaveis || 0} evento(s) · {driver.severidade || '—'}
            </div>
            {ultimoEvento && (
              <div>
                <i className="ti ti-clock-hour-4" style={{ marginRight: 5, color: 'var(--text-muted)' }}></i>
                Último em {new Date(ultimoEvento).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            {sheetsEntry?.realizadoPor?.trim() && (
              <div>
                <i className="ti ti-user-check" style={{ marginRight: 5, color: 'var(--success-500)' }}></i>
                Tratado por {sheetsEntry.realizadoPor}
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
