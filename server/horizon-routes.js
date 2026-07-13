import * as XLSX from 'xlsx';
import { parseCSV, readHeaders, applyPlatformMap } from '../src/utils/fatigueParser.js';
import { uploadMiddleware, handleImportEvents } from './analytics-import.js';
import { clearAnalyticsCache } from './analytics-routes.js';
import { runAutoCrossCheck } from './auto-crosscheck.js';

// ID legado semeado em migration_automations.sql para Bot_HorizonScraping.
// A automação pode ter sido renomeada/recriada na operação; por isso o log
// resolve o registro atual antes de gravar, mantendo compatibilidade com o ID
// original para instalações que ainda o utilizam.
const LEGACY_HORIZON_SCRAPING_AUTOMATION_ID = 'c1b94e82-e3e7-4c74-bfd4-3a56df93df24';
const HORIZON_SCRAPING_AUTOMATION_NAMES = [
  'Bot_HorizonScraping',
  'BOT_HorizonExport2Captcha',
  'BOT_HorizonRelat\u00f3rios',
  'BOT_HorizonRelatórios',
];

const CREDENTIAL_STATUSES = ['ok', 'credential_error', 'session_expired'];
const ACTIVITY_PHASES = { started: 'running', progress: 'running', success: 'success', failure: 'failure' };
const HORIZON_EXTRACTION_COOLDOWN_MS = 15 * 60 * 1000;

// Autenticação máquina-a-máquina para o robô Playwright/N8N na VPS — mesmo
// espírito do gate em server/ai-chat-routes.js (POST /api/ai/internal/generate-pdf),
// comparando um segredo fixo via header Authorization: Bearer.
// Exportado porque server/maxtrack-routes.js reusa o mesmo segredo: é o
// mesmo robô/VPS confiável (bots_playwright) autenticando em qualquer rota
// de ingestão do MedNet, não um segredo exclusivo da Horizon apesar do nome.
export function requireHorizonBotToken(req, res, next) {
  const expected = process.env.HORIZON_BOT_TOKEN;
  const header = req.headers.authorization || '';
  const incoming = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!expected || incoming !== expected) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  next();
}

function readFirstFileHeaders(file) {
  const isCsv = /\.csv$/i.test(file.originalname) || file.mimetype === 'text/csv';
  let aoa;
  if (isCsv) {
    aoa = parseCSV(file.buffer.toString('utf-8'));
  } else {
    const wb = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  }
  const { headers } = readHeaders(aoa);
  return headers;
}

async function resolveHorizonScrapingAutomationId(supabase) {
  const { data, error } = await supabase
    .from('automations')
    .select('id')
    .in('name', HORIZON_SCRAPING_AUTOMATION_NAMES)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id || LEGACY_HORIZON_SCRAPING_AUTOMATION_ID;
}

function accountLabelFromFile(file) {
  const match = file?.originalname?.match(/^dados_(.+?)_\d{4}-\d{2}-\d{2}\.(xlsx|csv)$/i);
  return match?.[1] || 'Horizon';
}

async function writeHorizonLog(supabase, { status, detail, message, level, duration = null }) {
  const automationId = await resolveHorizonScrapingAutomationId(supabase);
  const { error } = await supabase.from('automation_logs').insert({
    automation_id: automationId,
    status,
    duration,
    detail,
    logs: [{ t: new Date().toLocaleTimeString('pt-BR'), lvl: level, m: message }],
  });
  if (error) throw error;
}

export function registerHorizonRoutes(app, supabase) {
  // POST /api/horizon/ingest — chamado pelo Bot_HorizonScraping (VPS) de hora
  // em hora com os relatórios exportados das contas Horizon. Reaproveita o
  // mesmo motor de upsert em driver_events usado pelo ImportModal manual.
  app.post('/api/horizon/ingest', requireHorizonBotToken, uploadMiddleware, async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado para importação.' });
    }

    const startTime = Date.now();
    let responseBody = null;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      responseBody = body;
      return originalJson(body);
    };

    try {
      const headers = readFirstFileHeaders(req.files[0]);
      req.body.platformId = 'horizon';
      req.body.mapping = JSON.stringify(applyPlatformMap(headers, 'horizon', {}));
      req.body.operatorEmail = '';

      await handleImportEvents(supabase, req, res, clearAnalyticsCache);

      if (responseBody && !responseBody.success) {
        try {
          const account = accountLabelFromFile(req.files[0]);
          await writeHorizonLog(supabase, {
            status: 'failure',
            detail: `${account}: importacao recusada`,
            level: 'err',
            message: responseBody.error || 'O arquivo foi recusado pela importacao.',
          });
        } catch (logErr) {
          console.error('[Horizon Ingest] Falha ao registrar erro de importacao:', logErr);
        }
      }

      if (responseBody?.success) {
        const account = accountLabelFromFile(req.files[0]);
        const { error: extractionUpdateError } = await supabase
          .from('horizon_credentials')
          .update({ last_extracted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('label', account);
        if (extractionUpdateError) {
          console.error('[Horizon Ingest] Falha ao registrar horario da extracao:', extractionUpdateError);
        }

        const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
        try {
          const automationId = await resolveHorizonScrapingAutomationId(supabase);
          await supabase.from('automation_logs').insert({
            automation_id: automationId,
            status: 'success',
            duration: `${durationSec}s`,
            detail: `${responseBody.uniqueSavedCount ?? 0} eventos importados`,
            logs: [{
              t: new Date().toLocaleTimeString('pt-BR'),
              lvl: 'ok',
              m: `${responseBody.uniqueSavedCount ?? 0} eventos únicos importados de ${req.files.length} arquivo(s)`,
            }],
          });
        } catch (logErr) {
          console.error('[Horizon Ingest] Falha ao gravar automation_logs:', logErr);
        }

        try {
          await runAutoCrossCheck(supabase, 'horizon');
        } catch (crossCheckErr) {
          console.error('[Horizon Ingest] Falha no Auto Cross-Check:', crossCheckErr);
        }
      }
    } catch (err) {
      console.error('[Horizon Ingest] Erro ao processar importação:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || String(err) });
      }
    }
  });

  // POST /api/horizon/credential-status — o robô reporta o resultado do
  // login (sucesso, senha rotacionada que funcionou, ou erro de credencial).
  app.post('/api/horizon/credential-status', requireHorizonBotToken, async (req, res) => {
    try {
      const { email, status, error: loginError, workingPassword } = req.body || {};
      if (!email || !status || !CREDENTIAL_STATUSES.includes(status)) {
        return res.status(400).json({ error: 'email e status (ok|credential_error|session_expired) são obrigatórios.' });
      }

      const update = { updated_at: new Date().toISOString() };
      if (workingPassword) {
        // Uma senha candidata funcionou: promove-a a senha primária do próximo ciclo.
        update.password = workingPassword;
        update.status = 'ok';
        update.last_login_at = new Date().toISOString();
        update.last_error = null;
      } else if (status === 'credential_error') {
        update.status = status;
        update.last_error = loginError || 'Falha de autenticação — nenhuma senha candidata funcionou';
      } else {
        update.status = status;
        if (status === 'ok') update.last_login_at = new Date().toISOString();
      }

      const { data: account, error } = await supabase
        .from('horizon_credentials')
        .update(update)
        .eq('email', email)
        .select('label')
        .maybeSingle();
      if (error) throw error;

      try {
        const label = account?.label || 'Conta Horizon';
        const failed = status !== 'ok';
        await writeHorizonLog(supabase, {
          status: failed ? 'failure' : 'success',
          detail: failed ? `${label}: login requer atencao` : `${label}: login confirmado`,
          level: failed ? 'err' : 'ok',
          message: failed ? (loginError || 'O robo nao concluiu o login.') : 'Login validado pelo robo.',
        });
      } catch (logErr) {
        console.error('[Horizon Credential Status] Falha ao gravar activity log:', logErr);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[Horizon Credential Status] Erro:', err);
      return res.status(500).json({ error: err.message || String(err) });
    }
  });

  // GET /api/horizon/credentials — o robô lê as contas elegíveis (exclui as
  // com erro de credencial confirmado) para saber qual senha tentar primeiro.
  // POST /api/horizon/activity — progresso detalhado enviado pelo robô.
  // Os eventos surgem em tempo real na tela de Automações e no sino.
  app.post('/api/horizon/activity', requireHorizonBotToken, async (req, res) => {
    try {
      const { phase, account, message, duration } = req.body || {};
      const status = ACTIVITY_PHASES[phase];
      const safeAccount = typeof account === 'string' ? account.trim().slice(0, 80) : 'Horizon';
      const safeMessage = typeof message === 'string' ? message.trim().slice(0, 500) : '';
      if (!status || !safeMessage) {
        return res.status(400).json({ error: 'phase e message sao obrigatorios.' });
      }

      await writeHorizonLog(supabase, {
        status,
        duration: typeof duration === 'string' ? duration.slice(0, 40) : null,
        detail: `${safeAccount}: ${safeMessage}`,
        level: status === 'failure' ? 'err' : (status === 'success' ? 'ok' : 'info'),
        message: safeMessage,
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[Horizon Activity] Erro:', err);
      return res.status(500).json({ error: err.message || String(err) });
    }
  });

  app.get('/api/horizon/credentials', requireHorizonBotToken, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('horizon_credentials')
        .select('email, password, password_candidates, label, last_extracted_at')
        .neq('status', 'credential_error');
      if (error) throw error;

      const cutoff = Date.now() - HORIZON_EXTRACTION_COOLDOWN_MS;
      const eligible = (data || []).filter((account) => {
        if (!account.last_extracted_at) return true;
        return new Date(account.last_extracted_at).getTime() < cutoff;
      }).map(({ last_extracted_at, ...account }) => account);

      return res.status(200).json(eligible);
    } catch (err) {
      console.error('[Horizon Credentials] Erro:', err);
      return res.status(500).json({ error: err.message || String(err) });
    }
  });

  // GET /api/horizon/treatment-queue — o Bot_HorizonTreatment (B3) lê as
  // pendências geradas pelo Auto Cross-Check (server/auto-crosscheck.js)
  // para replicar o mesmo veredito do MaxTrack na Horizon.
  app.get('/api/horizon/treatment-queue', requireHorizonBotToken, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('horizon_treatment_queue')
        .select('id, placa, nome, ocorrido_em, classificacao, motivo_raw, intervencao_sugerida, tentativas')
        .eq('status', 'pending')
        .order('ocorrido_em', { ascending: true })
        .limit(500);
      if (error) throw error;

      return res.status(200).json(data || []);
    } catch (err) {
      console.error('[Horizon Treatment Queue] Erro ao listar:', err);
      return res.status(500).json({ error: err.message || String(err) });
    }
  });

  // POST /api/horizon/treatment-queue/:id/resolve — o robô reporta o
  // resultado de cada tentativa de tratativa na Horizon.
  const TREATMENT_RESOLVE_STATUSES = ['done', 'error', 'no_horizon_match'];
  app.post('/api/horizon/treatment-queue/:id/resolve', requireHorizonBotToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, erro } = req.body || {};
      if (!status || !TREATMENT_RESOLVE_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status deve ser um de: ${TREATMENT_RESOLVE_STATUSES.join(', ')}` });
      }

      const update = { status, updated_at: new Date().toISOString() };
      if (status === 'done') {
        update.erro = null;
      } else {
        update.erro = erro || null;
        const { data: atual, error: errAtual } = await supabase
          .from('horizon_treatment_queue')
          .select('tentativas')
          .eq('id', id)
          .single();
        if (errAtual) throw errAtual;
        update.tentativas = (atual?.tentativas || 0) + 1;
        // Falhas transitórias de seletor, captcha ou rede voltam para a fila.
        // Após três tentativas, mantemos "error" para intervenção manual.
        if (status === 'error' && update.tentativas < 3) update.status = 'pending';
      }

      const { error } = await supabase.from('horizon_treatment_queue').update(update).eq('id', id);
      if (error) throw error;

      return res.status(200).json({ success: true, status: update.status, tentativas: update.tentativas || 0 });
    } catch (err) {
      console.error('[Horizon Treatment Queue] Erro ao resolver:', err);
      return res.status(500).json({ error: err.message || String(err) });
    }
  });
}
