import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { NAV_ITEMS, ROLE_LEVEL } from '../data.js';
import Modal from '../components/Modal.jsx';

const CommandPaletteContext = createContext(null);

// Palette global (Ctrl+K/Cmd+K de qualquer tela, sidebar expandida ou não —
// diferente da busca antiga do Sidebar, que só existia com ele montado).
// V1: busca sobre páginas (NAV_ITEMS) e motoristas. Sem ações profundas ainda
// (abrir modais de outros módulos) — fica pra uma fase futura.
export function CommandPaletteProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const { drivers } = useApp();
  const { profile } = useAuth();

  const openPalette = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
  }, []);
  const closePalette = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) closePalette();
        else openPalette();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, openPalette, closePalette]);

  const myLevel = ROLE_LEVEL[profile?.role] ?? 0;
  const canSee = useCallback((item) => !item.minRole || myLevel >= ROLE_LEVEL[item.minRole], [myLevel]);

  const navResults = useMemo(() => {
    const visible = NAV_ITEMS.filter(canSee);
    if (!query) return visible.slice(0, 8);
    const q = query.toLowerCase();
    return visible.filter((i) => i.label.toLowerCase().includes(q));
  }, [query, canSee]);

  const driverResults = useMemo(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    return (drivers || [])
      .filter((d) => d.nome.toLowerCase().includes(q) || (d.placa || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, drivers]);

  const results = useMemo(() => [
    ...navResults.map((i) => ({
      key: 'nav-' + i.id,
      icon: i.icon,
      label: i.label,
      sub: null,
      action: () => navigate(i.path),
    })),
    ...driverResults.map((d) => ({
      key: 'drv-' + d.placa,
      icon: 'ti-truck',
      label: d.nome,
      sub: d.placa,
      action: () => navigate('/monitor/intervencao'),
    })),
  ], [navResults, driverResults, navigate]);

  // Clampa em vez de resetar via efeito: a lista muda a cada tecla digitada,
  // então o índice ativo pode sobrar do resultado anterior (maior que o novo
  // tamanho) — corrigido aqui, no render, sem precisar de useEffect.
  const clampedIndex = Math.min(activeIndex, Math.max(results.length - 1, 0));

  const runResult = useCallback((r) => {
    if (!r) return;
    r.action();
    closePalette();
  }, [closePalette]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runResult(results[clampedIndex]);
    }
  };

  return (
    <CommandPaletteContext.Provider value={{ open: openPalette }}>
      {children}
      <Modal open={open} onClose={closePalette} width={560} labelledBy="cmdk-input">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <i className="ti ti-search" style={{ fontSize: 16, color: 'var(--text-muted)' }}></i>
          <input
            id="cmdk-input"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar páginas, motoristas…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'inherit' }}
          />
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>ESC</span>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '6px 0' }}>
          {results.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhum resultado para "{query}"
            </div>
          ) : (
            results.map((r, i) => (
              <div
                key={r.key}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => runResult(r)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 16px',
                  cursor: 'pointer',
                  background: i === clampedIndex ? 'var(--surface-1)' : 'transparent',
                  fontSize: 13.5,
                }}
              >
                <i className={`ti ${r.icon}`} style={{ color: r.sub ? 'var(--text-muted)' : 'var(--accent-500, #9E1A45)', fontSize: 15 }}></i>
                <span style={{ color: 'var(--text-primary)' }}>{r.label}</span>
                {r.sub && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{r.sub}</span>}
              </div>
            ))
          )}
        </div>
      </Modal>
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) throw new Error('useCommandPalette deve ser usado dentro de um CommandPaletteProvider');
  return context;
}
