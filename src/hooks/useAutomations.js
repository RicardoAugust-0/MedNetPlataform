import { useState, useEffect, useCallback, useRef, createContext, useContext, createElement } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useToast } from './useToast.jsx';
import { apiFetch } from '../lib/analyticsApi.js';
import { useNotifications } from './useNotifications.jsx';

const AutomationsContext = createContext(null);
const AUTOMATION_COLUMNS = 'id, name, icon, description, active, endpoint, trigger, schedule, schedule_type, schedule_interval_minutes, schedule_time, schedule_days, schedule_timezone, next_run_at, last_run_at, last_schedule_status, last_schedule_error, event_type, position';

export function mergeOptimisticAutomationLogs(logsMap, optimisticRuns) {
  const merged = { ...logsMap };
  const remaining = {};

  Object.entries(optimisticRuns).forEach(([automationId, optimistic]) => {
    const databaseLogs = merged[automationId] || [];
    const optimisticAt = new Date(optimistic.date).getTime();
    const hasDatabaseReplacement = databaseLogs.some((log) => (
      !String(log.id).startsWith('optimistic-')
      && new Date(log.date).getTime() >= optimisticAt - 2000
    ));

    if (!hasDatabaseReplacement) {
      merged[automationId] = [
        optimistic,
        ...databaseLogs.filter((log) => log.id !== optimistic.id),
      ];
      remaining[automationId] = optimistic;
    }
  });

  return { logs: merged, optimisticRuns: remaining };
}

export function getAutomationPollingDelay(baseMs, consecutiveFailures, maxMs = 120000) {
  const failures = Math.max(0, Math.min(Number(consecutiveFailures) || 0, 8));
  return Math.min(baseMs * (2 ** failures), maxMs);
}

export function AutomationsProvider({ children, enabled = true, active = true }) {
  const toast = useToast();
  const { notify } = useNotifications();
  const [automations, setAutomations] = useState([]);
  const [logs, setLogs] = useState({}); // key: automation_id, value: array of log objects
  const [horizonQueueStatus, setHorizonQueueStatus] = useState({
    pending: 0,
    processing: 0,
    doneToday: 0,
    error: 0,
    noMatch: 0,
    loading: true,
  });
  const [loading, setLoading] = useState(true);
  const [vpsHealth, setVpsHealth] = useState({ online: false, checking: true, error: null, data: null });
  const [healthUrl, setHealthUrl] = useState('https://botsplaywright.duckdns.org/health');
  const timers = useRef({});
  const automationsRef = useRef([]);
  const logsRef = useRef({});
  const optimisticRunsRef = useRef({});
  const liveRefreshUntilRef = useRef(0);
  const logRefreshErrorRef = useRef(false);

  useEffect(() => {
    automationsRef.current = automations;
  }, [automations]);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  // Helper to map DB row to frontend automation model
  const toLocalAutomation = useCallback((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    desc: row.description,
    active: row.active,
    endpoint: row.endpoint,
    trigger: row.trigger,
    schedule: row.schedule,
    scheduleType: row.schedule_type,
    scheduleIntervalMinutes: row.schedule_interval_minutes,
    scheduleTime: row.schedule_time?.slice(0, 5) || null,
    scheduleDays: row.schedule_days || [],
    scheduleTimezone: row.schedule_timezone || 'America/Sao_Paulo',
    nextRunAt: row.next_run_at,
    lastScheduledRunAt: row.last_run_at,
    lastScheduleStatus: row.last_schedule_status,
    lastScheduleError: row.last_schedule_error,
    eventType: row.event_type,
    position: row.position ?? 0,
  }), []);

  // Helper to map DB log row to local log model
  const toLocalLog = useCallback((row) => {
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

    // Trata tarefas zumbis. Os robôs reais podem levar mais de 20 minutos em
    // contas com captcha, então a margem precisa ser maior que o timeout normal.
    let status = row.status;
    let detail = row.detail;
    let dur = row.duration;
    if (status === 'running') {
      const createdAt = new Date(row.created_at).getTime();
      const now = Date.now();
      const diffMinutes = (now - createdAt) / (1000 * 60);
      if (diffMinutes > 35) {
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
  }, []);

  // Fetch all automations and logs
  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured || !enabled) {
      setAutomations([]);
      setLogs({});
      optimisticRunsRef.current = {};
      setHorizonQueueStatus({
        pending: 0,
        processing: 0,
        doneToday: 0,
        error: 0,
        noMatch: 0,
        loading: false,
      });
      setVpsHealth({ online: false, checking: false, error: null, data: null });
      setLoading(false);
      return;
    }

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const queuePromise = active
        ? Promise.all([
            supabase.from('horizon_treatment_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending').retry(false),
            supabase.from('horizon_treatment_queue').select('id', { count: 'exact', head: true }).eq('status', 'processing').retry(false),
            supabase.from('horizon_treatment_queue').select('id', { count: 'exact', head: true }).in('status', ['done', 'already_synced']).gte('updated_at', todayStart.toISOString()).retry(false),
            supabase.from('horizon_treatment_queue').select('id', { count: 'exact', head: true }).eq('status', 'error').retry(false),
            supabase.from('horizon_treatment_queue').select('id', { count: 'exact', head: true }).eq('status', 'no_horizon_match').retry(false),
          ])
        : Promise.resolve([]);

      const logsPromise = active
        ? supabase
            .from('automation_logs')
            .select('id, automation_id, status, duration, detail, logs, created_at')
            .order('created_at', { ascending: false })
            .limit(500)
            .retry(false)
        : Promise.resolve({ data: [], error: null });

      const settingsPromise = active
        ? supabase.from('app_settings').select('value').eq('key', 'vps_config').maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const [autosRes, logsRes, settingsRes, queueResults] = await Promise.all([
        supabase
          .from('automations')
          .select(AUTOMATION_COLUMNS)
          .order('position', { ascending: true }),
        logsPromise,
        settingsPromise,
        queuePromise,
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
      const merged = mergeOptimisticAutomationLogs(
        logsMap,
        optimisticRunsRef.current,
      );
      optimisticRunsRef.current = merged.optimisticRuns;
      setLogs(merged.logs);

      if (active && queueResults.every(result => !result.error)) {
        setHorizonQueueStatus({
          pending: queueResults[0].count || 0,
          processing: queueResults[1].count || 0,
          doneToday: queueResults[2].count || 0,
          error: queueResults[3].count || 0,
          noMatch: queueResults[4].count || 0,
          loading: false,
        });
      } else if (active) {
        console.error('[useAutomations] Error loading Horizon queue:', queueResults.find(result => result.error)?.error);
        setHorizonQueueStatus(current => ({ ...current, loading: false }));
      } else {
        setHorizonQueueStatus(current => ({ ...current, loading: false }));
      }

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
      if (active) toast('Erro ao carregar dados das automações', 'error');
    } finally {
      setLoading(false);
    }
  }, [active, enabled, toast, toLocalAutomation, toLocalLog]);

  const refreshLogs = useCallback(async () => {
    if (!isSupabaseConfigured || !enabled || !active) return true;

    const { data, error } = await supabase
      .from('automation_logs')
      .select('id, automation_id, status, duration, detail, logs, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
      // O polling abaixo possui backoff proprio; quatro retries internos por
      // tentativa apenas multiplicariam o congestionamento e o ruido do console.
      .retry(false);

    if (error) {
      if (!logRefreshErrorRef.current) {
        console.warn('[useAutomations] Logs indisponiveis; polling em backoff:', error.message);
      }
      logRefreshErrorRef.current = true;
      return false;
    }

    if (logRefreshErrorRef.current) {
      console.info('[useAutomations] Conexao de logs restabelecida.');
    }
    logRefreshErrorRef.current = false;

    const logsMap = {};
    (data || []).forEach((row) => {
      const log = toLocalLog(row);
      if (!logsMap[log.automationId]) logsMap[log.automationId] = [];
      logsMap[log.automationId].push(log);
    });

    const merged = mergeOptimisticAutomationLogs(
      logsMap,
      optimisticRunsRef.current,
    );
    optimisticRunsRef.current = merged.optimisticRuns;
    setLogs(merged.logs);
    return true;
  }, [active, enabled, toLocalLog]);

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
      return true;
    } catch {
      // In case of error (SSL error, server offline, CORS, connection refused),
      // we show the error state rather than falling back to mocks.
      setVpsHealth({
        online: false,
        checking: false,
        error: 'Healthcheck inativo ou offline',
        data: null
      });
      return false;
    }
  }, [healthUrl]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime é o caminho principal. Este polling adaptativo garante a mesma
  // experiência quando o websocket estiver reconectando ou bloqueado:
  // 2s durante execuções e 15s quando a tela está ociosa/visível. Falhas
  // consecutivas aplicam backoff exponencial ate dois minutos.
  useEffect(() => {
    if (!isSupabaseConfigured || !enabled || !active) return;

    let inFlight = false;
    let lastRefreshAt = 0;
    let consecutiveFailures = 0;

    const tick = async (force = false) => {
      if (document.visibilityState !== 'visible' || inFlight) return;
      const hasRunningLog = Object.values(logsRef.current).some((items) => (
        items.some((item) => item.status === 'running')
      ));
      const liveWindow = Date.now() < liveRefreshUntilRef.current;
      const baseIntervalMs = hasRunningLog || liveWindow ? 2000 : 15000;
      const intervalMs = getAutomationPollingDelay(baseIntervalMs, consecutiveFailures);
      if (!force && Date.now() - lastRefreshAt < intervalMs) return;

      inFlight = true;
      try {
        const succeeded = await refreshLogs();
        consecutiveFailures = succeeded ? 0 : consecutiveFailures + 1;
      } finally {
        lastRefreshAt = Date.now();
        inFlight = false;
      }
    };

    const intervalId = setInterval(tick, 2000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick(true);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [active, enabled, refreshLogs]);

  // Healthcheck somente na tela de Automacoes. Quando a VPS estiver offline,
  // recue progressivamente em vez de manter requisicoes a cada 30 segundos.
  useEffect(() => {
    if (loading || !enabled || !active) return;

    let cancelled = false;
    let inFlight = false;
    let timeoutId = null;
    let consecutiveFailures = 0;

    const schedule = (delayMs) => {
      if (cancelled) return;
      timeoutId = setTimeout(tick, delayMs);
    };

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (document.visibilityState !== 'visible') {
        schedule(30000);
        return;
      }

      inFlight = true;
      const succeeded = await checkVpsHealth();
      inFlight = false;
      consecutiveFailures = succeeded ? 0 : consecutiveFailures + 1;
      schedule(getAutomationPollingDelay(30000, consecutiveFailures, 240000));
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || inFlight) return;
      clearTimeout(timeoutId);
      void tick();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [active, enabled, loading, checkVpsHealth]);

  // Realtime handlers
  useEffect(() => {
    if (!isSupabaseConfigured || !enabled) return;
    const timerStore = timers.current;

    const channel = supabase
      .channel('automations-live-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automations' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_logs' }, (payload) => {
        if (active) {
          clearTimeout(timerStore.logsRefresh);
          timerStore.logsRefresh = setTimeout(refreshLogs, 100);
        }
        if (payload.eventType === 'UPDATE' && payload.new?.status === 'running') return;
        const changedRow = payload.new || payload.old;
        const automation = automationsRef.current.find((item) => item.id === changedRow?.automation_id);
        if (!automation || !/(horizon|maxtrack)/i.test(automation.name || '')) return;

        const failed = changedRow.status === 'failure';
        const succeeded = changedRow.status === 'success';
        const platform = /maxtrack/i.test(automation.name || '') ? 'MaxTrack' : 'Horizon';
        const body = changedRow.detail || `Novo evento do robô ${platform}.`;
        notify({
          title: failed ? `${platform} precisa de atenção` : `Atualização do robô ${platform}`,
          body,
          kind: failed ? 'error' : (succeeded ? 'success' : 'info'),
          link: '/automacoes',
        });
        if (failed) toast(body, 'error');
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'horizon_treatment_queue' }, () => {
        if (!active) return;
        clearTimeout(timerStore.queueRefresh);
        timerStore.queueRefresh = setTimeout(loadData, 500);
      })
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          console.warn('[useAutomations] Realtime ' + status + '; polling de segurança ativo.');
        }
      });

    return () => {
      clearTimeout(timerStore.logsRefresh);
      clearTimeout(timerStore.queueRefresh);
      supabase.removeChannel(channel);
    };
  }, [active, enabled, loadData, notify, refreshLogs, toast]);

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
      schedule_type: data.scheduleType || null,
      schedule_interval_minutes: data.scheduleIntervalMinutes || null,
      schedule_time: data.scheduleTime || null,
      schedule_days: data.scheduleDays?.length ? data.scheduleDays : null,
      schedule_timezone: data.scheduleTimezone || 'America/Sao_Paulo',
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
    const automation = toLocalAutomation(inserted);
    // O Realtime mantém outras abas sincronizadas, mas a aba que acabou de
    // salvar não deve depender dele para refletir a alteração.
    setAutomations(current => [...current, automation]);
    return automation;
  }, [automations, toast, toLocalAutomation]);

  const update = useCallback(async (id, data, options = {}) => {
    const dbRow = {};
    if (data.name !== undefined) dbRow.name = data.name;
    if (data.icon !== undefined) dbRow.icon = data.icon;
    if (data.desc !== undefined) dbRow.description = data.desc;
    if (data.active !== undefined) dbRow.active = data.active;
    if (data.endpoint !== undefined) dbRow.endpoint = data.endpoint;
    if (data.trigger !== undefined) dbRow.trigger = data.trigger;
    if (data.schedule !== undefined) dbRow.schedule = data.schedule || null;
    if (data.scheduleType !== undefined) dbRow.schedule_type = data.scheduleType || null;
    if (data.scheduleIntervalMinutes !== undefined) dbRow.schedule_interval_minutes = data.scheduleIntervalMinutes || null;
    if (data.scheduleTime !== undefined) dbRow.schedule_time = data.scheduleTime || null;
    if (data.scheduleDays !== undefined) dbRow.schedule_days = data.scheduleDays?.length ? data.scheduleDays : null;
    if (data.scheduleTimezone !== undefined) dbRow.schedule_timezone = data.scheduleTimezone || 'America/Sao_Paulo';
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

    // Atualiza o estado desta aba imediatamente. Sem isso, um clique em
    // "Executar" logo após salvar ainda usaria o endpoint anterior até
    // chegar o evento Realtime (ou até um F5).
    const automation = toLocalAutomation(updated);
    setAutomations(current => current.map(item => item.id === id ? automation : item));

    if (options.toastMessage) {
      toast(options.toastMessage, 'success');
    } else if (!options.quiet) {
      toast('Automação atualizada', 'success');
    }
    return true;
  }, [toast, toLocalAutomation]);

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

    setAutomations(current => current.filter(item => item.id !== id));
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
    const optimisticDate = new Date(startTime).toISOString();
    const optimisticLog = {
      id: `optimistic-${id}-${startTime}`,
      automationId: id,
      status: 'running',
      dur: null,
      detail: 'Solicitando execução ao robô...',
      when: new Date(startTime).toLocaleDateString('pt-BR') + ' '
        + new Date(startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      time: new Date(startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: optimisticDate,
      logs: stepLogs,
    };

    optimisticRunsRef.current[id] = optimisticLog;
    liveRefreshUntilRef.current = Math.max(
      liveRefreshUntilRef.current,
      Date.now() + 90_000,
    );
    setLogs((current) => ({
      ...current,
      [id]: [
        optimisticLog,
        ...(current[id] || []).filter((log) => log.id !== optimisticLog.id),
      ],
    }));

    try {
      // O backend encaminha a chamada para a VPS/n8n. Isso mantém tokens fora
      // do browser e evita bloqueios de CORS de endpoints externos.
      const res = await apiFetch(`/api/automations/${id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: operatorName }),
        signal: AbortSignal.timeout(20000) // backend aguarda o webhook por até 15s
      });

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const durationStr = `${durationSec} s`;

      let data;
      try {
        data = await res.json();
      } catch {
        data = { message: 'Execução concluída com sucesso (sem corpo de resposta)' };
      }

      if (!res.ok) {
        throw new Error(data.error || data.detail || `Servidor respondeu com status ${res.status}`);
      }

      stepLogs.push({ t: new Date().toLocaleTimeString('pt-BR'), lvl: 'ok', m: data.message || 'Webhook executado com sucesso' });

      const reportsOwnActivity = (() => {
        try {
          const url = new URL(auto.endpoint);
          return url.hostname === 'botsplaywright.duckdns.org' && url.pathname.startsWith('/automacoes/');
        } catch {
          return false;
        }
      })();

      // Para Playwright, o HTTP 200 só aceita a tarefa. O log verdadeiro será
      // enviado pelo robô quando começar e quando terminar no portal.
      if (!reportsOwnActivity) {
        await supabase.from('automation_logs').insert({
          automation_id: id,
          status: 'success',
          duration: durationStr,
          detail: data.detail || 'Execução concluída via webhook',
          logs: stepLogs
        });
      }

      await refreshLogs();
      toast(
        reportsOwnActivity
          ? `${auto.name} — tarefa enviada; aguardando confirmação do robô`
          : `${auto.name} — execução concluída`,
        reportsOwnActivity ? 'info' : 'success',
      );
      return true;
    } catch (err) {
      console.error(`[useAutomations] Error running hook ${id}:`, err);
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const durationStr = `${durationSec} s`;
      
      stepLogs.push({ t: new Date().toLocaleTimeString('pt-BR'), lvl: 'err', m: `Falha: ${err.message}` });

      // Save failure run log to Supabase
      const { error: logError } = await supabase.from('automation_logs').insert({
        automation_id: id,
        status: 'failure',
        duration: durationStr,
        detail: err.message || 'Erro de conexão com a VPS',
        logs: stepLogs
      });

      if (logError) {
        const failedOptimistic = {
          ...optimisticLog,
          status: 'failure',
          dur: durationStr,
          detail: err.message || 'Erro de conexão com a VPS',
          logs: stepLogs,
        };
        optimisticRunsRef.current[id] = failedOptimistic;
        setLogs((current) => ({
          ...current,
          [id]: [
            failedOptimistic,
            ...(current[id] || []).filter((log) => log.id !== optimisticLog.id),
          ],
        }));
      } else {
        delete optimisticRunsRef.current[id];
        await refreshLogs();
      }

      toast(`Falha ao executar ${auto.name}`, 'error');
      return false;
    }
  }, [automations, refreshLogs, toast]);

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
      const taskQuery = new URLSearchParams({
        bot_name: botName,
        active_only: 'true',
        limit: '50',
      });
      const res = await fetch(`${apiBase}/tasks?${taskQuery.toString()}`);
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
    // Os callbacks acessam refs apenas depois de ações/eventos, nunca durante render.
    // eslint-disable-next-line react-hooks/refs
    { value: { automations, logs, horizonQueueStatus, loading, vpsHealth, checkVpsHealth, add, update, remove, run, stopAutomationTasks } },
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
