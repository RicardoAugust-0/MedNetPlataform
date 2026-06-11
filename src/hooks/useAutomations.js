import { useState, useEffect, useCallback, useRef, createContext, useContext, createElement } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useToast } from './useToast.jsx';

const AutomationsContext = createContext(null);

export function AutomationsProvider({ children }) {
  const toast = useToast();
  const [automations, setAutomations] = useState([]);
  const [logs, setLogs] = useState({}); // key: automation_id, value: array of log objects
  const [loading, setLoading] = useState(true);
  const [vpsHealth, setVpsHealth] = useState({ online: false, checking: true, error: null, data: null });
  const timers = useRef({});

  // Helper to map DB row to frontend automation model
  const toLocalAutomation = (row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    desc: row.description,
    active: row.active,
    endpoint: row.endpoint,
    trigger: row.trigger,
    schedule: row.schedule,
    eventType: row.event_type,
    token: row.token,
    position: row.position ?? 0,
  });

  // Helper to map DB log row to local log model
  const toLocalLog = (row) => ({
    id: row.id,
    automationId: row.automation_id,
    status: row.status,
    dur: row.duration,
    detail: row.detail,
    when: new Date(row.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    time: new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    date: row.created_at,
    logs: row.logs || [], // detailed array of { t, lvl, m }
  });

  // Fetch all automations and logs
  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    try {
      const [autosRes, logsRes] = await Promise.all([
        supabase.from('automations').select('*').order('position', { ascending: true }),
        supabase.from('automation_logs').select('*').order('created_at', { ascending: false }),
      ]);

      if (autosRes.error) throw autosRes.error;
      if (logsRes.error) throw logsRes.error;

      const autosList = (autosRes.data || []).map(toLocalAutomation);
      const logsMap = {};

      (logsRes.data || []).forEach(row => {
        const log = toLocalLog(row);
        if (!logsMap[log.automationId]) {
          logsMap[log.automationId] = [];
        }
        logsMap[log.automationId].push(log);
      });

      setAutomations(autosList);
      setLogs(logsMap);
    } catch (err) {
      console.error('[useAutomations] Error loading data:', err);
      toast('Erro ao carregar dados das automações', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // VPS health checking
  const checkVpsHealth = useCallback(async () => {
    // Find the first endpoint to extract host, default to mock VPS IP if none
    const firstAuto = automations.find(a => a.endpoint);
    let host = '168.231.94.0';
    if (firstAuto) {
      try {
        const url = new URL(firstAuto.endpoint);
        host = url.origin;
      } catch {
        // Fallback if not a valid URL
        host = 'https://168.231.94.0';
      }
    } else {
      host = 'https://168.231.94.0';
    }

    setVpsHealth(prev => ({ ...prev, checking: true }));
    const startTime = Date.now();

    try {
      // Attempt to fetch VPS health endpoint. If it does not exist/fails, it throws.
      const res = await fetch(`${host}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(4000) // 4s timeout
      });

      if (!res.ok) throw new Error(`Status ${res.status}`);

      const data = await res.json();
      // Expecting structure: { uptimeDays: number, cpu: number, ram: number }
      const latencyMs = Date.now() - startTime;

      setVpsHealth({
        online: true,
        checking: false,
        error: null,
        data: {
          label: host.replace(/^https?:\/\//, ''),
          host: host.replace(/^https?:\/\//, ''),
          region: data.region || 'São Paulo (BR)',
          uptimeDays: data.uptimeDays ?? 0,
          latencyMs,
          cpu: data.cpu ?? 0,
          ram: data.ram ?? 0,
        }
      });
    } catch (err) {
      // In case of error (SSL error, server offline, CORS, connection refused),
      // we show the error state rather than falling back to mocks.
      setVpsHealth({
        online: false,
        checking: false,
        error: 'Healthcheck inativo ou offline',
        data: null
      });
    }
  }, [automations]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ping health every 30s once automations load
  useEffect(() => {
    if (loading) return;
    checkVpsHealth();
    const id = setInterval(checkVpsHealth, 30000);
    return () => clearInterval(id);
  }, [loading, checkVpsHealth]);

  // Realtime handlers
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('automations-live-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automations' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_logs' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // CRUD actions
  const add = useCallback(async (data) => {
    const pos = automations.length > 0 ? Math.max(...automations.map(a => a.position)) + 1 : 0;
    const dbRow = {
      name: data.name,
      icon: data.icon,
      description: data.desc,
      active: data.active,
      endpoint: data.endpoint,
      trigger: data.trigger,
      schedule: data.schedule || null,
      event_type: data.eventType || null,
      token: data.token || null,
      position: pos,
    };

    const { data: inserted, error } = await supabase
      .from('automations')
      .insert(dbRow)
      .select()
      .single();

    if (error) {
      toast('Erro ao criar automação', 'error');
      console.error(error);
      return null;
    }

    toast('Automação adicionada', 'success');
    return toLocalAutomation(inserted);
  }, [automations, toast]);

  const update = useCallback(async (id, data) => {
    const dbRow = {
      name: data.name,
      icon: data.icon,
      description: data.desc,
      active: data.active,
      endpoint: data.endpoint,
      trigger: data.trigger,
      schedule: data.schedule || null,
      event_type: data.eventType || null,
      token: data.token || null,
    };

    const { data: updated, error } = await supabase
      .from('automations')
      .update(dbRow)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      toast('Erro ao atualizar automação', 'error');
      console.error(error);
      return false;
    }

    toast('Automação atualizada', 'success');
    return true;
  }, [toast]);

  const remove = useCallback(async (id) => {
    const { error } = await supabase
      .from('automations')
      .delete()
      .eq('id', id);

    if (error) {
      toast('Erro ao excluir automação', 'error');
      console.error(error);
      return false;
    }

    toast('Automação removida', 'success');
    return true;
  }, [toast]);

  // Execute an automation immediately
  const run = useCallback(async (id, operatorName) => {
    const auto = automations.find(a => a.id === id);
    if (!auto) return false;

    const startTime = Date.now();

    // Create a temporary log list for the run UI flow
    const stepLogs = [
      { t: new Date().toLocaleTimeString('pt-BR'), lvl: 'info', m: `Execução disparada manualmente por ${operatorName}` },
      { t: new Date().toLocaleTimeString('pt-BR'), lvl: 'info', m: `Chamando webhook VPS: ${auto.endpoint}` }
    ];

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (auto.token) {
        headers['Authorization'] = `Bearer ${auto.token}`;
      }

      // Call the VPS endpoint
      const res = await fetch(auto.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          trigger: 'manual',
          operator: operatorName,
          timestamp: new Date().toISOString()
        }),
        signal: AbortSignal.timeout(10000) // 10s timeout
      });

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const durationStr = `${durationSec} s`;

      if (!res.ok) {
        throw new Error(`Servidor respondeu com status ${res.status}`);
      }

      let data;
      try {
        data = await res.json();
      } catch {
        data = { message: 'Execução concluída com sucesso (sem corpo de resposta)' };
      }

      stepLogs.push({ t: new Date().toLocaleTimeString('pt-BR'), lvl: 'ok', m: data.message || 'Webhook executado com sucesso' });

      // Save success run log to Supabase
      await supabase.from('automation_logs').insert({
        automation_id: id,
        status: 'success',
        duration: durationStr,
        detail: data.detail || 'Execução concluída via webhook',
        logs: stepLogs
      });

      toast(`${auto.name} — execução concluída`, 'success');
      return true;
    } catch (err) {
      console.error(`[useAutomations] Error running hook ${id}:`, err);
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const durationStr = `${durationSec} s`;
      
      stepLogs.push({ t: new Date().toLocaleTimeString('pt-BR'), lvl: 'err', m: `Falha: ${err.message}` });

      // Save failure run log to Supabase
      await supabase.from('automation_logs').insert({
        automation_id: id,
        status: 'failure',
        duration: durationStr,
        detail: err.message || 'Erro de conexão com a VPS',
        logs: stepLogs
      });

      toast(`Falha ao executar ${auto.name}`, 'error');
      return false;
    }
  }, [automations, toast]);

  return createElement(
    AutomationsContext.Provider,
    { value: { automations, logs, loading, vpsHealth, checkVpsHealth, add, update, remove, run } },
    children
  );
}

export function useAutomations() {
  const context = useContext(AutomationsContext);
  if (!context) {
    throw new Error('useAutomations must be used within an AutomationsProvider');
  }
  return context;
}
