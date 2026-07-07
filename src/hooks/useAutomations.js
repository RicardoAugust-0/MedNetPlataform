import { useState, useEffect, useCallback, useRef, createContext, useContext, createElement } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useToast } from './useToast.jsx';

const AutomationsContext = createContext(null);
const AUTOMATION_COLUMNS = 'id, name, icon, description, active, endpoint, trigger, schedule, event_type, token, position';

export function AutomationsProvider({ children }) {
  const toast = useToast();
  const [automations, setAutomations] = useState([]);
  const [logs, setLogs] = useState({}); // key: automation_id, value: array of log objects
  const [loading, setLoading] = useState(true);
  const [vpsHealth, setVpsHealth] = useState({ online: false, checking: true, error: null, data: null });
  const [healthUrl, setHealthUrl] = useState('https://botsplaywright.duckdns.org/health');
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
  const toLocalLog = (row) => {
    let parsedLogs = [];
    if (row.logs) {
      if (Array.isArray(row.logs)) {
        parsedLogs = row.logs;
      } else if (typeof row.logs === 'string') {
        try {
          parsedLogs = JSON.parse(row.logs);
        } catch (e) {
          console.error('[toLocalLog] Failed to parse logs string:', e);
        }
      }
    }

    // Trata "tarefas zumbis" que ficaram presas como 'running' por mais de 20 minutos no banco
    let status = row.status;
    let detail = row.detail;
    let dur = row.duration;
    if (status === 'running') {
      const createdAt = new Date(row.created_at).getTime();
      const now = Date.now();
      const diffMinutes = (now - createdAt) / (1000 * 60);
      if (diffMinutes > 20) {
        status = 'failure';
        detail = 'Execução interrompida por inatividade (Timeout)';
        dur = 'Excedido';
      }
    }

    return {
      id: row.id,
      automationId: row.automation_id,
      status,
      dur,
      detail,
      when: new Date(row.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      time: new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: row.created_at,
      logs: Array.isArray(parsedLogs) ? parsedLogs : [],
    };
  };

  // Fetch all automations and logs
  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    try {
      const [autosRes, logsRes, settingsRes] = await Promise.all([
        supabase
          .from('automations')
          .select(AUTOMATION_COLUMNS)
          .order('position', { ascending: true }),
        supabase
          .from('automation_logs')
          .select('id, automation_id, status, duration, detail, logs, created_at')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('app_settings').select('value').eq('key', 'vps_config').maybeSingle()
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

      // Set healthcheck URL from Supabase config or dynamic fallback
      if (settingsRes.data?.value?.health_url) {
        setHealthUrl(settingsRes.data.value.health_url);
      } else if (autosList.length > 0 && autosList[0].endpoint) {
        try {
          const url = new URL(autosList[0].endpoint);
          const host = url.origin;
          if (autosList[0].endpoint.includes('/webhook/')) {
            setHealthUrl(`${host}/webhook/health`);
          } else if (autosList[0].endpoint.includes('/webhook-test/')) {
            setHealthUrl(`${host}/webhook-test/health`);
          } else {
            setHealthUrl(`${host}/health`);
          }
        } catch {
          // Keep default
        }
      }
    } catch (err) {
      console.error('[useAutomations] Error loading data:', err);
      toast('Erro ao carregar dados das automações', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // VPS health checking
  const checkVpsHealth = useCallback(async () => {
    setVpsHealth(prev => ({ ...prev, checking: true }));
    const startTime = Date.now();

    try {
      // Attempt to fetch VPS health endpoint. If it does not exist/fails, it throws.
      const res = await fetch(healthUrl, { 
        method: 'GET',
        signal: AbortSignal.timeout(4000) // 4s timeout
      });

      if (!res.ok) throw new Error(`Status ${res.status}`);

      const data = await res.json();
      // Expecting structure: { uptimeDays: number, cpu: number, ram: number }
      const latencyMs = Date.now() - startTime;

      let hostname = 'VPS';
      try {
        hostname = new URL(healthUrl).hostname;
      } catch {
        // Keep fallback
      }

      setVpsHealth({
        online: true,
        checking: false,
        error: null,
        data: {
          label: 'VPS',
          host: hostname,
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
  }, [healthUrl]);

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
      .select(AUTOMATION_COLUMNS)
      .single();

    if (error) {
      toast('Erro ao criar automação', 'error');
      console.error(error);
      return null;
    }

    toast('Automação adicionada', 'success');
    return toLocalAutomation(inserted);
  }, [automations, toast]);

  const update = useCallback(async (id, data, options = {}) => {
    const dbRow = {};
    if (data.name !== undefined) dbRow.name = data.name;
    if (data.icon !== undefined) dbRow.icon = data.icon;
    if (data.desc !== undefined) dbRow.description = data.desc;
    if (data.active !== undefined) dbRow.active = data.active;
    if (data.endpoint !== undefined) dbRow.endpoint = data.endpoint;
    if (data.trigger !== undefined) dbRow.trigger = data.trigger;
    if (data.schedule !== undefined) dbRow.schedule = data.schedule || null;
    if (data.eventType !== undefined) dbRow.event_type = data.eventType || null;
    if (data.token !== undefined) dbRow.token = data.token || null;

    const { data: updated, error } = await supabase
      .from('automations')
      .update(dbRow)
      .eq('id', id)
      .select(AUTOMATION_COLUMNS)
      .single();

    if (error) {
      toast('Erro ao atualizar automação', 'error');
      console.error(error);
      return false;
    }

    if (options.toastMessage) {
      toast(options.toastMessage, 'success');
    } else if (!options.quiet) {
      toast('Automação atualizada', 'success');
    }
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
          timestamp: new Date().toISOString(),
          automation_id: auto.id,
          automation_name: auto.name
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

  const stopRunningTasks = useCallback(async () => {
    try {
      const apiBase = healthUrl.replace(/\/health$/, '');
      const res = await fetch(`${apiBase}/tasks`);
      if (!res.ok) throw new Error();
      const tasksList = await res.json();
      
      const runningTasks = tasksList.filter(t => t.status === 'running' || t.status === 'pending');
      
      if (runningTasks.length === 0) {
        toast('Nenhum robô ativo em execução na VPS.', 'info');
        return false;
      }
      
      await Promise.all(runningTasks.map(async (t) => {
        await fetch(`${apiBase}/tasks/${t.id}/stop`, { method: 'POST' });
      }));
      
      toast('Comando de encerramento enviado para a VPS.', 'success');
      return true;
    } catch (err) {
      console.error('[useAutomations] Error stopping tasks:', err);
      toast('Falha ao tentar encerrar execuções na VPS.', 'error');
      return false;
    }
  }, [healthUrl, toast]);

  const stopAutomationTasks = useCallback(async (id) => {
    try {
      const auto = automations.find(a => a.id === id);
      if (!auto) return false;

      // Extract bot name from the endpoint URL
      let botName = null;
      try {
        const url = new URL(auto.endpoint);
        const pathParts = url.pathname.split('/');
        botName = pathParts[pathParts.length - 1]; // e.g. bot_HorizonScraping
      } catch (err) {
        console.error('[useAutomations] Failed to parse botName from endpoint:', err);
      }

      if (!botName) return false;

      const apiBase = healthUrl.replace(/\/health$/, '');
      const res = await fetch(`${apiBase}/tasks`);
      if (!res.ok) throw new Error('Falha ao obter lista de tarefas da VPS');
      const tasksList = await res.json();
      
      const runningTasks = tasksList.filter(t => 
        (t.status === 'running' || t.status === 'pending') && 
        t.bot_name === botName
      );
      
      if (runningTasks.length > 0) {
        await Promise.all(runningTasks.map(async (t) => {
          await fetch(`${apiBase}/tasks/${t.id}/stop`, { method: 'POST' });
        }));
        toast(`Processo da automação "${auto.name}" encerrado na VPS.`, 'success');
      }

      // Also update any 'running' logs in Supabase for this automation to 'failure'
      const { error: logError } = await supabase
        .from('automation_logs')
        .update({ 
          status: 'failure',
          detail: 'Execução encerrada ao desativar a automação'
        })
        .eq('automation_id', id)
        .eq('status', 'running');

      if (logError) {
        console.error('[useAutomations] Error updating logs on stop:', logError);
      }

      return true;
    } catch (err) {
      console.error('[useAutomations] Error stopping automation tasks:', err);
      toast('Erro ao encerrar processo na VPS.', 'error');
      return false;
    }
  }, [automations, healthUrl, toast]);

  return createElement(
    AutomationsContext.Provider,
    { value: { automations, logs, loading, vpsHealth, checkVpsHealth, add, update, remove, run, stopRunningTasks, stopAutomationTasks } },
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
