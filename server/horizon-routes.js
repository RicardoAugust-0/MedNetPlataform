import * as XLSX from 'xlsx';
import { parseCSV, readHeaders, applyPlatformMap } from '../src/utils/fatigueParser.js';
import { uploadMiddleware, handleImportEvents } from './analytics-import.js';
import { clearAnalyticsCache } from './analytics-routes.js';

// Mesmo id semeado em migration_automations.sql para Bot_HorizonScraping.
const BOT_HORIZON_SCRAPING_AUTOMATION_ID = 'c1b94e82-e3e7-4c74-bfd4-3a56df93df24';

const CREDENTIAL_STATUSES = ['ok', 'credential_error', 'session_expired'];

// Autenticação máquina-a-máquina para o robô Playwright/N8N na VPS — mesmo
// espírito do gate em server/ai-chat-routes.js (POST /api/ai/internal/generate-pdf),
// comparando um segredo fixo via header Authorization: Bearer.
function requireHorizonBotToken(req, res, next) {
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

      if (responseBody?.success) {
        const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
        try {
          await supabase.from('automation_logs').insert({
            automation_id: BOT_HORIZON_SCRAPING_AUTOMATION_ID,
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

      const { error } = await supabase.from('horizon_credentials').update(update).eq('email', email);
      if (error) throw error;

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[Horizon Credential Status] Erro:', err);
      return res.status(500).json({ error: err.message || String(err) });
    }
  });

  // GET /api/horizon/credentials — o robô lê as contas elegíveis (exclui as
  // com erro de credencial confirmado) para saber qual senha tentar primeiro.
  app.get('/api/horizon/credentials', requireHorizonBotToken, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('horizon_credentials')
        .select('email, password, password_candidates, label')
        .neq('status', 'credential_error');
      if (error) throw error;

      return res.status(200).json(data || []);
    } catch (err) {
      console.error('[Horizon Credentials] Erro:', err);
      return res.status(500).json({ error: err.message || String(err) });
    }
  });
}
