import * as XLSX from 'xlsx';
import { parseCSV, readHeaders, applyPlatformMap } from '../src/utils/fatigueParser.js';
import { uploadMiddleware, handleImportEvents } from './analytics-import.js';
import { clearAnalyticsCache } from './analytics-routes.js';
import { reconcilePendingHorizonTreatments, runAutoCrossCheck } from './auto-crosscheck.js';

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
const TREATMENT_RESOLVE_STATUSES = ['done', 'already_synced', 'error', 'no_horizon_match'];
const TREATMENT_CLAIM_LIMIT = 500;
const TREATMENT_LEASE_SECONDS = 30 * 60;

export function buildTreatmentResolutionUpdate(status, erro, tentativasAtuais = 0, now = new Date()) {
  const update = {
    status,
    claimed_at: null,
    lease_expires_at: null,
    updated_at: now.toISOString(),
  };
  if (status === 'done' || status === 'already_synced') {
    return { ...update, tentativas: 0, erro: null };
  }

  update.erro = erro || null;
  update.tentativas = tentativasAtuais + 1;
  if (status === 'error' && update.tentativas < 3) update.status = 'pending';
  return update;
}

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

export function inspectHorizonExport(file) {
  const isCsv = /\.csv$/i.test(file.originalname) || file.mimetype === 'text/csv';
  let aoa;
  if (isCsv) {
    aoa = parseCSV(file.buffer.toString('utf-8'));
  } else {
    const wb = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  }
  const { headers, dataRows } = readHeaders(aoa);
  const mapping = applyPlatformMap(headers, 'horizon', {});

  // Um export sem eventos ainda precisa ter o layout reconhecivel da Horizon.
  // Assim, uma planilha em branco/corrompida nao e confundida com uma conta
  // valida cuja grade simplesmente nao possui ocorrencias no periodo.
  const hasHorizonLayout = Boolean(mapping.datetime && mapping.plate);
  return {
    headers,
    dataRows,
    mapping,
    hasHorizonLayout,
    isValidEmpty: hasHorizonLayout && dataRows.length === 0,
  };
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

export function toTreatmentQueuePayload(row) {
  const { horizon_event: horizonEvent, ...item } = row;
  return {
    ...item,
    // O Playwright deve localizar o alvo pelos dados da propria Horizon. A
    // placa/horario MaxTrack continuam no payload para auditoria e fallback.
    horizon_placa: horizonEvent?.placa || item.placa,
    horizon_ocorrido_em: horizonEvent?.ocorrido_em || item.ocorrido_em,
  };
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
    const uploadedFiles = [...req.files];
    let emptyExports = [];
    let responseBody = null;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const enrichedBody = body?.success && emptyExports.length > 0
        ? {
            ...body,
            emptyExport: req.files.length === 0,
            emptyExportCount: emptyExports.length,
          }
        : body;
      responseBody = enrichedBody;
      return originalJson(enrichedBody);
    };

    try {
      const inspectedFiles = uploadedFiles.map((file) => ({
        file,
        ...inspectHorizonExport(file),
      }));
      emptyExports = inspectedFiles.filter((item) => item.isValidEmpty);

      // Ignora somente exports vazios cujo layout Horizon foi confirmado. Um
      // arquivo vazio desconhecido permanece no lote e continua sendo recusado
      // pelo importador, como protecao contra downloads quebrados.
      req.files = inspectedFiles
        .filter((item) => !item.isValidEmpty)
        .map((item) => item.file);

      if (req.files.length === 0) {
        res.status(200).json({
          success: true,
          message: emptyExports.length === 1
            ? 'Export Horizon valido, mas sem eventos para importar.'
            : `${emptyExports.length} exports Horizon validos, mas sem eventos para importar.`,
          stats: { lidas: 0, semData: 0, operador: 0, velocidade: 0, leves: 0, importadas: 0 },
          dupsFiltered: 0,
          uniqueSavedCount: 0,
        });
      } else {
        const firstImportable = inspectedFiles.find((item) => item.file === req.files[0]);
        req.body.platformId = 'horizon';
        req.body.mapping = JSON.stringify(firstImportable.mapping);
        req.body.operatorEmail = '';

        await handleImportEvents(supabase, req, res, clearAnalyticsCache);
      }

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
        const accounts = [...new Set(uploadedFiles.map(accountLabelFromFile))];
        const { error: extractionUpdateError } = await supabase
          .from('horizon_credentials')
          .update({ last_extracted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .in('label', accounts);
        if (extractionUpdateError) {
          console.error('[Horizon Ingest] Falha ao registrar horario da extracao:', extractionUpdateError);
        }

        const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const emptyOnly = responseBody.emptyExport === true;
        const emptySuffix = emptyExports.length > 0 && !emptyOnly
          ? `; ${emptyExports.length} export(s) sem eventos ignorado(s)`
          : '';
        try {
          const automationId = await resolveHorizonScrapingAutomationId(supabase);
          await supabase.from('automation_logs').insert({
            automation_id: automationId,
            status: 'success',
            duration: `${durationSec}s`,
            detail: emptyOnly
              ? `${accounts.join(', ')}: nenhum evento disponivel`
              : `${responseBody.uniqueSavedCount ?? 0} eventos importados${emptySuffix}`,
            logs: [{
              t: new Date().toLocaleTimeString('pt-BR'),
              lvl: emptyOnly ? 'info' : 'ok',
              m: emptyOnly
                ? 'Export Horizon valido e sem linhas de eventos; nenhuma importacao foi necessaria.'
                : `${responseBody.uniqueSavedCount ?? 0} eventos únicos importados de ${uploadedFiles.length} arquivo(s)${emptySuffix}`,
            }],
          });
        } catch (logErr) {
          console.error('[Horizon Ingest] Falha ao gravar automation_logs:', logErr);
        }

        if (!emptyOnly) {
          try {
            await runAutoCrossCheck(supabase, 'horizon');
          } catch (crossCheckErr) {
            console.error('[Horizon Ingest] Falha no Auto Cross-Check:', crossCheckErr);
          }
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
      const treatmentPurpose = req.query.purpose === 'treatment';
      const eligible = (data || []).filter((account) => {
        // O cooldown evita reextrair relatórios em disparos repetidos, mas o
        // tratamento precisa enxergar imediatamente a conta da empresa alvo.
        if (treatmentPurpose) return true;
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
      await reconcilePendingHorizonTreatments(supabase);

      // O claim acontece no Postgres com FOR UPDATE SKIP LOCKED. Enquanto o
      // lease estiver ativo, importacoes concorrentes nao podem apagar nem
      // reatribuir os IDs entregues ao Playwright.
      const { data: claimedRows, error: claimError } = await supabase.rpc(
        'claim_horizon_treatment_queue',
        {
          p_limit: TREATMENT_CLAIM_LIMIT,
          p_lease_seconds: TREATMENT_LEASE_SECONDS,
        },
      );
      if (claimError) throw claimError;

      const claimedIds = (claimedRows || [])
        .map((row) => row.queue_id)
        .filter(Boolean);
      if (!claimedIds.length) return res.status(200).json([]);

      const { data, error } = await supabase
        .from('horizon_treatment_queue')
        .select(`
          id,
          placa,
          nome,
          ocorrido_em,
          classificacao,
          empresa,
          motivo_raw,
          intervencao_sugerida,
          tentativas,
          claimed_at,
          lease_expires_at,
          horizon_driver_event_id,
          horizon_event:driver_events!horizon_treatment_queue_horizon_driver_event_id_fkey(
            placa,
            ocorrido_em
          )
        `)
        .in('id', claimedIds)
        .order('ocorrido_em', { ascending: true })
        .limit(TREATMENT_CLAIM_LIMIT);
      if (error) throw error;

      return res.status(200).json((data || []).map(toTreatmentQueuePayload));
    } catch (err) {
      console.error('[Horizon Treatment Queue] Erro ao listar:', err);
      return res.status(500).json({ error: err.message || String(err) });
    }
  });

  // POST /api/horizon/treatment-queue/:id/resolve — o robô reporta o
  // resultado de cada tentativa de tratativa na Horizon.
  app.post('/api/horizon/treatment-queue/:id/resolve', requireHorizonBotToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, erro } = req.body || {};
      if (!status || !TREATMENT_RESOLVE_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status deve ser um de: ${TREATMENT_RESOLVE_STATUSES.join(', ')}` });
      }

      const safeError = typeof erro === 'string' ? erro.trim().slice(0, 1000) : null;
      const { data, error } = await supabase.rpc('resolve_horizon_treatment_queue', {
        p_queue_id: id,
        p_requested_status: status,
        p_erro: safeError || null,
      });

      if (error?.code === 'P0002') {
        return res.status(404).json({
          error: 'Pendencia Horizon nao encontrada; o ID pode pertencer a uma execucao expirada.',
          code: 'HORIZON_QUEUE_ITEM_NOT_FOUND',
        });
      }
      if (error) throw error;

      const result = data?.[0];
      if (!result) {
        return res.status(404).json({
          error: 'Pendencia Horizon nao encontrada.',
          code: 'HORIZON_QUEUE_ITEM_NOT_FOUND',
        });
      }

      if (status === 'error') {
        console.warn('[Horizon Treatment Queue] Tentativa com erro:', {
          id,
          status: result.persisted_status,
          tentativas: result.persisted_tentativas,
          erro: safeError || 'Erro nao informado pelo robo',
        });
      }

      return res.status(200).json({
        success: true,
        status: result.persisted_status,
        tentativas: result.persisted_tentativas || 0,
        attempt_id: result.attempt_id || null,
        already_resolved: Boolean(result.already_resolved),
      });
    } catch (err) {
      console.error('[Horizon Treatment Queue] Erro ao resolver:', err);
      return res.status(500).json({ error: err.message || String(err) });
    }
  });
}
