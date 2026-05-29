import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../hooks/useToast.jsx';

// Colunas visíveis na planilha embutida
const COLUMNS = [
  { key: 'data', label: 'Data', type: 'date', editable: true },
  { key: 'empresa', label: 'Empresa', type: 'text', editable: true },
  { key: 'sistema', label: 'Sistema', type: 'select', options: ['SASCAR', 'MAXTRACK', 'HORIZON', 'TRIMBLE'], editable: true },
  { key: 'colaborador', label: 'Colaborador', type: 'text', editable: true },
  { key: 'placa', label: 'Placa', type: 'text', editable: true },
  { key: 'frota', label: 'Frota', type: 'text', editable: true },
  { key: 'criticidade', label: 'Criticidade', type: 'select', options: ['NORMAL', 'GRAVE', 'GRAVÍSSIMO'], editable: true },
  { key: 'classificacao', label: 'Classificação', type: 'text', editable: true },
  { key: 'realizado', label: 'Realizado?', type: 'select', options: ['SIM', 'NÃO'], editable: true },
  { key: 'motivo', label: 'Motivo', type: 'text', editable: true },
  { key: 'solicitado_por', label: 'Solicitado Por', type: 'text', editable: true },
  { key: 'hora_solicitacao', label: 'Hora Sol.', type: 'text', editable: true },
  { key: 'realizado_por', label: 'Realizado Por', type: 'text', editable: true },
  { key: 'hora_realizacao', label: 'Hora Realiz.', type: 'text', editable: true },
  { key: 'justificativa', label: 'Justificativa', type: 'text', editable: true },
];

// Variable cache for silent import throttling to prevent redundant edge function calls on tab switching
let lastImportTime = 0;

// Chave de deduplicação por registro (placa + data + colaborador), normalizada
// campo a campo para resistir a diferenças de caixa/espaços entre Sheets e banco.
const norm = (v) => (v ?? '').toString().trim().toLowerCase();
const makeKey = (placa, data, colaborador) => `${norm(placa)}|${norm(data)}|${norm(colaborador)}`;

export default function EmbeddedSheet() {
  const { profile } = useAuth();
  const toast = useToast();
  
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [filterText, setFilterText] = useState('');
  
  // Estado para controle de edição de célula
  const [activeCell, setActiveCell] = useState(null); // { rowIndex, colKey }
  const [editValue, setEditValue] = useState('');
  
  const cellRefs = useRef({}); // Para gerenciar o foco das células

  // Carregar dados locais da tabela (últimas 150 intervenções)
  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('intervencoes_sheet')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150);
      if (error) throw error;
      
      setRows(data || []);
    } catch (err) {
      toast('Erro ao carregar dados da planilha embutida', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Importar dados históricos do Google Sheets (apenas do dia de hoje) com deduplicação
  const handleImportFromSheets = useCallback(async (isSilent = false) => {
    if (isSilent && lastImportTime && (Date.now() - lastImportTime < 60000)) {
      // Já sincronizou silenciosamente nos últimos 60 segundos, ignora para poupar chamadas de rede/edge-function
      return;
    }
    if (!isSilent) setLoading(true);
    else setIsBackgroundSyncing(true);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      if (!isSilent) toast('Sincronizando intervenções do dia...', 'info');
      
      // Invoca a Edge Function existente read-sheet (carrega abas do mês atual e anterior)
      const { data: sheetData, error: fnErr } = await supabase.functions.invoke('read-sheet', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (fnErr) throw fnErr;
      if (!sheetData?.ok) throw new Error(sheetData?.error || 'Erro na leitura do Sheets');

      if (!sheetData.rows || sheetData.rows.length === 0) {
        if (!isSilent) toast('Nenhum dado encontrado na planilha Google Sheets.', 'info');
        return;
      }

      // ── Filtragem de Data: Apenas registros de HOJE ──
      const today = new Date();
      const day = String(today.getDate()).padStart(2, '0');
      const month = String(today.getMonth() + 1).padStart(2, '0');
      
      const todayShort = `${day}/${month}`;                    // ex: "28/05"
      const todayLong = `${day}/${month}/${today.getFullYear()}`; // ex: "28/05/2026"
      const todayYearShort = `${day}/${month}/${String(today.getFullYear()).slice(-2)}`; // ex: "28/05/26"

      const isDateToday = (dateStr) => {
        if (!dateStr) return false;
        const trimmed = dateStr.trim();
        return trimmed === todayShort || trimmed === todayLong || trimmed === todayYearShort;
      };

      const todayRows = sheetData.rows.filter(r => isDateToday(r.data));

      if (todayRows.length === 0) {
        if (!isSilent) toast('Nenhuma intervenção registrada hoje na planilha externa.', 'info');
        loadData();
        return;
      }

      // Buscar registros locais de HOJE para evitar duplicados e identificar deletados.
      // Escopar por data no servidor é essencial: sem filtro, o SELECT esbarra no
      // limite padrão de 1000 linhas do PostgREST e, com a tabela grande, não
      // retorna as linhas de hoje — o que quebrava a deduplicação (reinseria tudo).
      const { data: dbExisting, error: dbErr } = await supabase
        .from('intervencoes_sheet')
        .select('id, placa, data, colaborador, status_sync')
        .in('data', [todayShort, todayLong, todayYearShort]);

      if (dbErr) throw dbErr;

      const dbToday = dbExisting || [];
      const sheetKeys = new Set(todayRows.map(r => makeKey(r.placa, r.data, r.colaborador)));

      // 1. Identificar e remover registros que foram deletados da planilha original do Sheets
      const rowsToDelete = dbToday.filter(r =>
        r.status_sync === 'sincronizado' &&
        !sheetKeys.has(makeKey(r.placa, r.data, r.colaborador))
      );

      let deletedCount = 0;
      if (rowsToDelete.length > 0) {
        const idsToDelete = rowsToDelete.map(r => r.id);
        const { error: deleteErr } = await supabase
          .from('intervencoes_sheet')
          .delete()
          .in('id', idsToDelete);
        
        if (deleteErr) throw deleteErr;
        
        deletedCount = idsToDelete.length;
        setRows((prev) => prev.filter((r) => !idsToDelete.includes(r.id)));
      }

      // 2. Mapear e filtrar novas linhas do dia de hoje para importação
      const dbExistingKeys = new Set(dbToday.map(r => makeKey(r.placa, r.data, r.colaborador)));

      const mappedRows = todayRows
        .map(r => ({
          data: r.data || '',
          empresa: r.empresa || '',
          sistema: r.sistema || '',
          colaborador: r.colaborador || '',
          placa: r.placa || '',
          frota: r.frota || '',
          criticidade: (r.criticidade || 'NORMAL').toUpperCase().trim(),
          classificacao: r.classificacao || '',
          realizado: (r.realizado || 'NÃO').toUpperCase().trim(),
          motivo: r.motivo || '',
          solicitado_por: r.solicitadoPor || '',
          hora_solicitacao: r.horaSolicitacao || '',
          realizado_por: r.realizadoPor || '',
          hora_realizacao: r.horaRealizacao || '',
          justificativa: r.justificativa || '',
          status_sync: 'sincronizado', // Importante: marca como sincronizado para pular o trigger pg_net
          linha_sheet: `${r._mes || 'Importado'}!A:P`
        }))
        .filter(r => !dbExistingKeys.has(makeKey(r.placa, r.data, r.colaborador)));

      let insertedCount = 0;
      if (mappedRows.length > 0) {
        const { data: inserted, error: insertErr } = await supabase
          .from('intervencoes_sheet')
          .insert(mappedRows)
          .select();

        if (insertErr) throw insertErr;
        insertedCount = inserted.length;
        setRows((prev) => [...inserted, ...prev]);
      }

      // 3. Notificar usuário sobre o resultado da reconciliação
      if (insertedCount > 0 || deletedCount > 0) {
        let msg = 'Sincronização concluída:';
        if (insertedCount > 0) msg += ` ${insertedCount} importado(s)`;
        if (deletedCount > 0) msg += `${insertedCount > 0 ? ',' : ''} ${deletedCount} removido(s)`;
        toast(msg, 'success');
      } else {
        if (!isSilent) toast('Tudo atualizado! Nenhuma alteração pendente com o Sheets.', 'success');
      }
      lastImportTime = Date.now();
    } catch (err) {
      if (!isSilent) toast(`Falha na importação: ${err.message}`, 'error');
      console.error(err);
    } finally {
      if (!isSilent) setLoading(false);
      else setIsBackgroundSyncing(false);
    }
  }, [toast, loadData]);

  // Carregar dados e disparar importação silenciosa das linhas de hoje no mount
  useEffect(() => {
    loadData().then(() => {
      handleImportFromSheets(true);
    });
  }, [loadData, handleImportFromSheets]);

  // Escutar atualizações via Supabase Realtime
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channelName = `intervencoes-live-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'intervencoes_sheet' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setRows((prev) => {
              if (prev.some((r) => r.id === payload.new.id)) return prev;
              return [payload.new, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setRows((prev) =>
              prev.map((r) => (r.id === payload.new.id ? payload.new : r))
            );
          } else if (payload.eventType === 'DELETE') {
            setRows((prev) => prev.filter((r) => r.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Adicionar uma nova linha vazia
  const handleAddNewRow = async () => {
    if (!profile) return;
    const today = new Date().toISOString().split('T')[0];
    const newRecord = {
      data: today,
      empresa: 'Nova Transportadora',
      sistema: 'SASCAR',
      colaborador: 'Novo Colaborador',
      placa: 'AAA-0000',
      frota: '',
      criticidade: 'NORMAL',
      classificacao: 'Fadiga',
      realizado: 'NÃO',
      solicitado_por: profile.nome,
      hora_solicitacao: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      status_sync: 'pendente',
      tentativas_sync: 0,
    };

    // Atualização otimista local
    const tempId = crypto.randomUUID();
    const optimisticRow = { ...newRecord, id: tempId, _optimistic: true };
    setRows((prev) => [optimisticRow, ...prev]);

    try {
      const { data, error } = await supabase
        .from('intervencoes_sheet')
        .insert(newRecord)
        .select()
        .single();

      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === tempId ? data : r)));
      toast('Nova linha criada e enfileirada para o Sheets!', 'success');
    } catch (err) {
      setRows((prev) => prev.filter((r) => r.id !== tempId));
      toast('Erro ao criar linha no banco de dados', 'error');
      console.error(err);
    }
  };

  // Forçar redispari de sincronização manual para linhas com erro
  const handleRetrySync = async (row) => {
    try {
      toast('Iniciando re-sincronização...', 'info');
      
      const { error } = await supabase
        .from('intervencoes_sheet')
        .update({
          status_sync: 'pendente',
          tentativas_sync: 0,
          ultimo_erro_sync: null
        })
        .eq('id', row.id);

      if (error) throw error;
    } catch (err) {
      toast('Erro ao solicitar sincronização', 'error');
      console.error(err);
    }
  };

  // Salvar a alteração de uma célula
  const saveCellEdit = async (rowIndex, colKey, originalRow) => {
    if (!activeCell) return;
    const value = editValue.trim();
    setActiveCell(null);

    // Se o valor não mudou, cancela
    if (originalRow[colKey] === value) return;

    // Atualização local imediata
    setRows((prev) =>
      prev.map((r, i) => (i === rowIndex ? { ...r, [colKey]: value, status_sync: 'pendente' } : r))
    );

    try {
      const { error } = await supabase
        .from('intervencoes_sheet')
        .update({ 
          [colKey]: value,
          status_sync: 'pendente' 
        })
        .eq('id', originalRow.id);

      if (error) throw error;
    } catch (err) {
      toast('Erro ao atualizar registro', 'error');
      loadData();
      console.error(err);
    }
  };

  // Entrar no modo de edição da célula
  const startCellEdit = (rowIndex, colKey, value) => {
    setActiveCell({ rowIndex, colKey });
    setEditValue(value || '');
  };

  // Atalhos de teclado para navegação de planilha
  const handleKeyDown = (e, rowIndex, colIndex, colKey, row) => {
    if (activeCell) {
      if (e.key === 'Enter') {
        saveCellEdit(rowIndex, colKey, row);
        const nextCellRef = cellRefs.current[`${rowIndex + 1}-${colIndex}`];
        if (nextCellRef) nextCellRef.focus();
      } else if (e.key === 'Escape') {
        setActiveCell(null);
        cellRefs.current[`${rowIndex}-${colIndex}`]?.focus();
      }
    } else {
      let nextRowIndex = rowIndex;
      let nextColIndex = colIndex;

      switch (e.key) {
        case 'ArrowUp':
          nextRowIndex = Math.max(0, rowIndex - 1);
          e.preventDefault();
          break;
        case 'ArrowDown':
          nextRowIndex = Math.min(rows.length - 1, rowIndex + 1);
          e.preventDefault();
          break;
        case 'ArrowLeft':
          nextColIndex = Math.max(0, colIndex - 1);
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'Tab':
          if (e.shiftKey) {
            nextColIndex = Math.max(0, colIndex - 1);
          } else {
            nextColIndex = Math.min(COLUMNS.length - 1, colIndex + 1);
          }
          e.preventDefault();
          break;
        case 'Enter':
          startCellEdit(rowIndex, colKey, row[colKey]);
          e.preventDefault();
          break;
        default:
          return;
      }

      const nextCellRef = cellRefs.current[`${nextRowIndex}-${nextColIndex}`];
      if (nextCellRef) {
        nextCellRef.focus();
      }
    }
  };

  // Filtro de pesquisa
  const filteredRows = useMemo(() => {
    if (!filterText) return rows;
    const query = filterText.toLowerCase();
    return rows.filter((r) =>
      (r.colaborador || '').toLowerCase().includes(query) ||
      (r.placa || '').toLowerCase().includes(query) ||
      (r.empresa || '').toLowerCase().includes(query)
    );
  }, [rows, filterText]);

  // Estatísticas de sincronização rápida
  const syncStats = useMemo(() => {
    const total = rows.length;
    const sincronizados = rows.filter((r) => r.status_sync === 'sincronizado').length;
    const pendentes = rows.filter((r) => r.status_sync === 'pendente').length;
    const erros = rows.filter((r) => r.status_sync === 'erro').length;
    return { total, sincronizados, pendentes, erros };
  }, [rows]);

  return (
    <div className="sheet-container">
      
      {/* Cabeçalho / Barra de Ferramentas */}
      <div className="sheet-header">
        <div className="sheet-title-area">
          <h2>
            <i className="ti ti-table-alias" style={{ color: 'var(--mednet-orange)' }}></i> Planilha Embutida
          </h2>
          <p> Edição de dados em tempo real espelhada diretamente no Google Sheets. </p>
        </div>

        {/* Estatísticas de Sincronização */}
        <div className="sheet-stats-area">
          <div className="sheet-stat-box">
            <span className="stat-lbl">Sincronizados</span>
            <span className="stat-val" style={{ color: 'var(--success-500)' }}>{syncStats.sincronizados}</span>
          </div>
          <div className="sheet-stat-box">
            <span className="stat-lbl">Pendentes</span>
            <span className="stat-val" style={{ color: syncStats.pendentes > 0 ? 'var(--warning-500)' : 'var(--text-secondary)' }}>
              {syncStats.pendentes}
            </span>
          </div>
          <div className="sheet-stat-box">
            <span className="stat-lbl">Falhas</span>
            <span className="stat-val" style={{ color: syncStats.erros > 0 ? 'var(--danger-500)' : 'var(--text-secondary)' }}>
              {syncStats.erros}
            </span>
          </div>
        </div>

        {/* Ações e Filtros */}
        <div className="sheet-actions">
          <div className="sheet-search-wrapper">
            <i className="ti ti-search"></i>
            <input
              type="text"
              placeholder="Buscar colaborador, placa..."
              className="sheet-search-input"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>

          {/* Botão de Sincronização manual (apenas registros de hoje) */}
          <button
            onClick={() => handleImportFromSheets(false)}
            className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={loading || isBackgroundSyncing}
            title="Importar dados de hoje do Google Sheets"
          >
            <i className="ti ti-download"></i> Sincronizar Hoje
          </button>

          <button
            onClick={handleAddNewRow}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={loading || isBackgroundSyncing}
          >
            <i className="ti ti-plus"></i> Inserir Linha
          </button>
        </div>
      </div>

      {/* Grid Principal (Planilha) */}
      <div className="sheet-grid-wrapper">
        {loading ? (
          <div className="sheet-loading-wrapper">
            <div className="sheet-spinner"></div>
            <span>Carregando dados da planilha...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="sheet-empty-state">
            <span>Nenhum registro encontrado hoje. Use "Sincronizar Hoje" ou adicione uma nova linha.</span>
          </div>
        ) : (
          <table className="sheet-table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th className="col-status">Status Sync</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className={`col-${col.key}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, rowIndex) => (
                <tr key={row.id}>
                  {/* Número da Linha */}
                  <td className="col-num">
                    {rowIndex + 1}
                  </td>

                  {/* Coluna de Status da Sincronização */}
                  <td className="col-status">
                    {row.status_sync === 'sincronizado' && (
                      <span className="sheet-badge sheet-badge-success">
                        <i className="ti ti-circle-check"></i> Sincronizado
                      </span>
                    )}
                    {row.status_sync === 'pendente' && (
                      <span className="sheet-badge sheet-badge-pending">
                        <i className="ti ti-loader"></i> Enviando...
                      </span>
                    )}
                    {row.status_sync === 'erro' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          title={row.ultimo_erro_sync}
                          className="sheet-badge sheet-badge-danger"
                          style={{ cursor: 'help' }}
                        >
                          <i className="ti ti-circle-x"></i> Falhou
                        </span>
                        <button
                          onClick={() => handleRetrySync(row)}
                          className="sheet-retry-btn"
                          title="Tentar sincronizar novamente"
                        >
                          <i className="ti ti-refresh"></i>
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Renderização Dinâmica das Células Editáveis */}
                  {COLUMNS.map((col, colIndex) => {
                    const isEditing = activeCell?.rowIndex === rowIndex && activeCell?.colKey === col.key;
                    const val = row[col.key] || '';
                    
                    return (
                      <td
                        key={col.key}
                        ref={(el) => (cellRefs.current[`${rowIndex}-${colIndex}`] = el)}
                        tabIndex={0}
                        onDoubleClick={() => startCellEdit(rowIndex, col.key, val)}
                        onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex, col.key, row)}
                        style={{ padding: isEditing ? '0' : undefined }}
                        className={`col-${col.key}`}
                      >
                        {isEditing ? (
                          col.type === 'select' ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveCellEdit(rowIndex, col.key, row)}
                              className="sheet-cell-edit-select"
                              autoFocus
                            >
                              {col.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={col.type}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => saveCellEdit(rowIndex, col.key, row)}
                              className="sheet-cell-edit-input"
                              autoFocus
                            />
                          )
                        ) : (
                          // Renderização normal de texto com destaque de criticidade
                          <span className={col.key === 'criticidade' ? (val === 'GRAVÍSSIMO' ? 'criticidade-gravissimo' : val === 'GRAVE' ? 'criticidade-grave' : '') : ''}>
                            {val}
                          </span>
                        )}

                        {/* Indicador discreto de edição (Lápis) no hover */}
                        {!isEditing && col.editable && (
                          <i className="ti ti-pencil sheet-cell-edit-icon"></i>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Rodapé Informativo */}
      <div className="sheet-footer">
        <div>
          <span>Dica: Use <b>Duplo Clique</b> ou <b>Enter</b> para editar. Navegue usando as <b>Setas Direcionais</b> ou <b>Tab</b>. Pressione <b>Esc</b> para cancelar.</span>
        </div>
        <div className="sheet-realtime-status">
          {isBackgroundSyncing ? (
            <>
              <div className="sheet-spinner" style={{ width: '12px', height: '12px', borderWidth: '2px', marginRight: '6px' }}></div>
              <span style={{ color: 'var(--text-secondary)' }}>Sincronizando planilha...</span>
            </>
          ) : (
            <>
              <span className="sheet-ping-dot"></span>
              <span style={{ color: 'var(--text-secondary)' }}>Conexão realtime ativa</span>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
