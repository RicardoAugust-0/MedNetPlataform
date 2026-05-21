import { useState, useMemo } from 'react';
import { EmptyState } from './utils';

const SEV_COLOR = {
  'Gravíssimo': 'var(--danger-500)',
  'Grave':      'var(--warning-500)',
  'Médio':      'var(--accent-500)',
  'Leve':       'var(--text-muted)',
};

const PAGE_SIZE = 15;

function fmtTs(seconds) {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day:      '2-digit',
    month:    '2-digit',
    hour:     '2-digit',
    minute:   '2-digit',
  });
}

function fmtAge(fetchedAt) {
  if (!fetchedAt) return null;
  const min = Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 60000);
  if (min === 0) return 'agora';
  if (min < 60)  return `${min} min atrás`;
  return `${Math.floor(min / 60)}h${min % 60 > 0 ? ` ${min % 60}min` : ''} atrás`;
}

export default function MaxtrackClosedTab({ events, loading, error, fetchedAt, buscar }) {
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);

  const normalizado = (s) =>
    String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

  const filtered = useMemo(() => {
    const q = normalizado(search).trim();
    if (!q) return events;
    return events.filter(ev =>
      normalizado(ev.driverName).includes(q)   ||
      normalizado(ev.identifier).includes(q)   ||
      normalizado(ev.companyName).includes(q)  ||
      normalizado(ev.eventName).includes(q)    ||
      normalizado(ev.fechadoPor).includes(q)
    );
  }, [events, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = (v) => { setSearch(v); setPage(1); };

  const age = fmtAge(fetchedAt);

  return (
    <div>
      {/* Barra de ações */}
      <div className="filter-bar" style={{ marginBottom: 8 }}>
        <button
          className="btn btn-sm btn-primary"
          onClick={buscar}
          disabled={loading}
          title="Buscar eventos fechados hoje na Maxtrack"
        >
          <i className={`ti ${loading ? 'ti-loader-2' : 'ti-refresh'}`}
             style={loading ? { animation: 'spin 1s linear infinite' } : {}}
          ></i>
          {loading ? ' Buscando…' : ' Buscar encerrados'}
        </button>

        {fetchedAt && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {events.length} evento(s) · atualizado {age}
          </span>
        )}

        {events.length > 0 && (
          <div className="filter-group" style={{ flex: 1, marginLeft: 'auto' }}>
            <input
              style={{
                padding: '4px 8px', fontSize: 12, width: '100%',
                border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)',
                background: 'var(--surface-0)', color: 'var(--text-primary)',
              }}
              placeholder="Buscar motorista, placa, transportadora, tipo…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Estado de erro */}
      {error && (
        <div className="empty-state" style={{ color: 'var(--danger-500)' }}>
          <i className="ti ti-alert-circle"></i> {error}
        </div>
      )}

      {/* Estado vazio (nunca buscou) */}
      {!loading && !error && !fetchedAt && (
        <EmptyState
          icon="ti-circle-check"
          msg="Alertas encerrados na Maxtrack"
          sub="Clique em 'Buscar encerrados' para carregar os eventos fechados hoje"
        />
      )}

      {/* Estado vazio (buscou mas não achou) */}
      {!loading && !error && fetchedAt && filtered.length === 0 && (
        <EmptyState
          icon="ti-mood-smile"
          msg={search ? 'Nenhum evento corresponde à busca' : 'Nenhum evento encerrado hoje'}
        />
      )}

      {/* Tabela de resultados */}
      {!loading && filtered.length > 0 && (
        <>
          <div className="driver-list">
            {paginated.map(ev => {
              const sevColor = SEV_COLOR[ev.criticalityName] || 'var(--text-muted)';
              return (
                <div key={ev._id} className="history-item">
                  {/* Ícone */}
                  <div className="h-avatar" style={{ background: 'rgba(34,197,94,0.10)' }}>
                    <i className="ti ti-circle-check" style={{ fontSize: 13, color: 'var(--success-500, #22c55e)' }}></i>
                  </div>

                  {/* Dados principais */}
                  <div className="h-info">
                    <div className="h-name">
                      {ev.driverName || ev.identifier || '—'}
                      {ev.identifier && ev.driverName && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                          {ev.identifier}
                        </span>
                      )}
                      {ev.companyName && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                          · {ev.companyName}
                        </span>
                      )}
                    </div>
                    <div className="h-meta">
                      <span style={{ marginRight: 6 }}>{ev.eventName || '—'}</span>
                      {ev.fechadoPor && (
                        <span>· Fechado por <strong>{ev.fechadoPor}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Timestamps e badge de severidade */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <div className="h-time" title="Horário de fechamento">
                      {ev.fechadoEm ? fmtTs(ev.fechadoEm) : fmtTs(ev.startDate)}
                    </div>
                    {ev.criticalityName && (
                      <span
                        className="badge"
                        style={{ fontSize: 9.5, background: sevColor, color: '#fff' }}
                      >
                        {ev.criticalityName}
                      </span>
                    )}
                    {ev.startDate && ev.fechadoEm && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }} title="Início do alerta">
                        início {fmtTs(ev.startDate)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <i className="ti ti-chevron-left"></i>
              </button>
              <span style={{ fontSize: 13, alignSelf: 'center', color: 'var(--text-muted)' }}>
                Página {page} de {totalPages} · {filtered.length} eventos
              </span>
              <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                <i className="ti ti-chevron-right"></i>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
