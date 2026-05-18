import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';

const CACHE_KEY = 'mn_drivers_queue';

// ── Field mapping ──────────────────────────────────────────────
function toLocal(row) {
  return {
    _id:                  row.id,
    placa:                row.placa,
    _platformId:          row.platform_id,
    nome:                 row.nome,
    transportadora:       row.transportadora,
    frota:                row.frota,
    turno:                row.turno,
    alertas:              row.alertas ?? 0,
    tipos:                row.tipos ?? [],
    ultimoEvento:         row.ultimo_evento,
    reportaveis:          row.reportaveis ?? 0,
    tiposReportar:        row.tipos_reportar ?? [],
    ultimoEventoReportar: row.ultimo_evento_reportar,
    tecnicos:             row.tecnicos ?? 0,
    tiposTecnico:         row.tipos_tecnico ?? {},
    eventosDetalhados:    row.eventos_detalhados ?? [],
    severidade:           row.severidade,
    _loadedAt:            row.loaded_at,
  };
}

function toDb(d, { userId } = {}) {
  return {
    placa:                  d.placa,
    platform_id:            d._platformId || null,
    nome:                   d.nome ?? null,
    transportadora:         d.transportadora ?? null,
    frota:                  d.frota ?? null,
    turno:                  d.turno ?? null,
    alertas:                d.alertas ?? 0,
    tipos:                  d.tipos ?? [],
    ultimo_evento:          d.ultimoEvento || null,
    reportaveis:            d.reportaveis ?? 0,
    tipos_reportar:         d.tiposReportar ?? [],
    ultimo_evento_reportar: d.ultimoEventoReportar || null,
    tecnicos:               d.tecnicos ?? 0,
    tipos_tecnico:          d.tiposTecnico ?? {},
    eventos_detalhados:     d.eventosDetalhados ?? [],
    severidade:             d.severidade ?? null,
    loaded_at:              d._loadedAt || new Date().toISOString(),
    updated_by:             userId || null,
  };
}

function camelToSnakePatch(patch) {
  const map = {
    nome: 'nome', placa: 'placa', transportadora: 'transportadora',
    frota: 'frota', turno: 'turno', alertas: 'alertas', tipos: 'tipos',
    ultimoEvento: 'ultimo_evento', reportaveis: 'reportaveis',
    tiposReportar: 'tipos_reportar', ultimoEventoReportar: 'ultimo_evento_reportar',
    tecnicos: 'tecnicos', tiposTecnico: 'tipos_tecnico',
    eventosDetalhados: 'eventos_detalhados', severidade: 'severidade',
  };
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    const dk = map[k];
    if (dk) out[dk] = v;
  }
  return out;
}

// ── Hook ───────────────────────────────────────────────────────
export function useDriversQueue() {
  const { profile } = useAuth();
  const [drivers, setDriversState] = useState(() => {
    try { const v = localStorage.getItem(CACHE_KEY); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);
  const [lastChangeAt, setLastChangeAt] = useState(null);
  const driversRef = useRef(drivers);
  const profileRef = useRef(profile);
  const touchChange = useCallback(() => setLastChangeAt(new Date().toISOString()), []);

  // Keep refs + localStorage in sync
  useEffect(() => {
    driversRef.current = drivers;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(drivers)); } catch { /* quota */ }
  }, [drivers]);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  // Initial load
  // Importante: se a query SUCESSO mas vier vazia E o cache local tiver dados,
  // NÃO sobrescreve. Caso típico: migration aplicada mas DB ainda sem registros,
  // ou upload anterior falhou silenciosamente no upsert. Refresh não pode
  // apagar o que o operador acabou de carregar. Em vez disso, faz backfill
  // (sobe o cache local pro DB) pra reconciliar.
  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('drivers_queue')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      console.warn('[useDriversQueue] load:', error.message);
      setLoading(false);
      return;
    }
    const fromDb = (data || []).map(toLocal);
    if (fromDb.length > 0) {
      // DB é fonte de verdade — substitui local
      setDriversState(fromDb);
      const ts = new Date().toISOString();
      setLoadedAt(ts);
      setLastChangeAt(ts);
    } else if (driversRef.current.length > 0) {
      // DB vazio + cache local com dados → backfill (upsert local pro DB)
      const userId = profileRef.current?.id || null;
      const rows = driversRef.current.map(d => toDb(d, { userId }));
      const { error: upErr } = await supabase
        .from('drivers_queue')
        .upsert(rows, { onConflict: 'placa' });
      if (upErr) {
        console.warn('[useDriversQueue] backfill upsert:', upErr.message);
        // Mantém cache local mesmo sem conseguir gravar
      } else {
        const ts = new Date().toISOString();
        setLoadedAt(ts);
        setLastChangeAt(ts);
      }
    } else {
      // Ambos vazios: tudo certo
      setLoadedAt(new Date().toISOString());
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channelName = `drivers-queue-live-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'drivers_queue' }, ({ new: row }) => {
        setDriversState(prev => {
          if (prev.some(d => d._id === row.id)) return prev;
          return [toLocal(row), ...prev];
        });
        touchChange();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers_queue' }, ({ new: row }) => {
        setDriversState(prev => prev.map(d => d._id === row.id ? toLocal(row) : d));
        touchChange();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'drivers_queue' }, ({ old: row }) => {
        // replica identity full → row tem id e placa
        setDriversState(prev => prev.filter(d => d._id !== row.id && d.placa !== row.placa));
        touchChange();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [touchChange]);

  // ── Mutations ────────────────────────────────────────────────
  // Substitui a fila de uma plataforma específica: upsert todos do batch,
  // depois remove os que sumiram (mesmo platform_id, placa não está no batch).
  const replaceAll = useCallback(async (newList, platformId) => {
    const stamped = newList.map(d => ({ ...d, _platformId: d._platformId || platformId }));
    setDriversState(prev => {
      const newPlacas = new Set(stamped.map(d => d.placa));
      return [...prev.filter(d => !newPlacas.has(d.placa)), ...stamped];
    });
    if (!isSupabaseConfigured) return;
    const userId = profile?.id || null;
    const rows = stamped.map(d => toDb(d, { userId }));
    if (rows.length > 0) {
      const { error } = await supabase
        .from('drivers_queue')
        .upsert(rows, { onConflict: 'placa' });
      if (error) console.warn('[useDriversQueue] replaceAll upsert:', error.message);
    }
    // Remove placas que sumiram dessa plataforma
    if (platformId) {
      const keepPlacas = stamped.map(d => d.placa);
      let q = supabase.from('drivers_queue').delete().eq('platform_id', platformId);
      if (keepPlacas.length > 0) q = q.not('placa', 'in', `(${keepPlacas.map(p => `"${p}"`).join(',')})`);
      const { error } = await q;
      if (error) console.warn('[useDriversQueue] replaceAll delete:', error.message);
    }
  }, [profile]);

  // Patch parcial em uma placa específica
  const updateOne = useCallback(async (placa, patch) => {
    setDriversState(prev => prev.map(d => d.placa === placa ? { ...d, ...patch } : d));
    if (!isSupabaseConfigured) return;
    const dbPatch = camelToSnakePatch(patch);
    if (Object.keys(dbPatch).length === 0) return;
    const { error } = await supabase
      .from('drivers_queue')
      .update(dbPatch)
      .eq('placa', placa);
    if (error) console.warn('[useDriversQueue] updateOne:', error.message);
  }, []);

  // Bulk patch em várias placas com o mesmo patch
  const bulkUpdate = useCallback(async (placas, patch) => {
    const placaSet = new Set(placas);
    setDriversState(prev => prev.map(d => placaSet.has(d.placa) ? { ...d, ...patch } : d));
    if (!isSupabaseConfigured || placas.length === 0) return;
    const dbPatch = camelToSnakePatch(patch);
    if (Object.keys(dbPatch).length === 0) return;
    const { error } = await supabase
      .from('drivers_queue')
      .update(dbPatch)
      .in('placa', placas);
    if (error) console.warn('[useDriversQueue] bulkUpdate:', error.message);
  }, []);

  // Limpa toda a fila (apaga tudo)
  const clearAll = useCallback(async () => {
    setDriversState([]);
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.from('drivers_queue').delete().neq('placa', '');
    if (error) console.warn('[useDriversQueue] clearAll:', error.message);
  }, []);

  return { drivers, loading, loadedAt, lastChangeAt, replaceAll, updateOne, bulkUpdate, clearAll, reload: load };
}
