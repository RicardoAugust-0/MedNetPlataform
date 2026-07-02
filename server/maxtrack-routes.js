import { parseCSV, readHeaders, applyPlatformMap } from '../src/utils/fatigueParser.js';
import { uploadMiddleware, handleImportEvents } from './analytics-import.js';
import { clearAnalyticsCache } from './analytics-routes.js';
import { requireHorizonBotToken } from './horizon-routes.js';
import { runAutoCrossCheck } from './auto-crosscheck.js';

// Mesmo id semeado em 20260702120000_maxtrack_ingest_automation.sql para Bot_MaxtrackScraping.
const BOT_MAXTRACK_SCRAPING_AUTOMATION_ID = 'a1b94e82-e3e7-4c74-bfd4-3a56df93df28';

// Export da MaxTrack sempre vem em CSV (`;`-delimitado) — sem o branch XLSX
// que o horizon-routes.js tem, porque a MaxTrack não exporta nesse formato.
function readFirstFileHeaders(file) {
  const { headers } = readHeaders(parseCSV(file.buffer.toString('utf-8')));
  return headers;
}

export function registerMaxtrackRoutes(app, supabase) {
  // POST /api/maxtrack/ingest — chamado pelo Bot_MaxtrackScraping (VPS) de
  // hora em hora com o export "Fechados" da Central de Eventos MaxTrack.
  // Reaproveita o mesmo motor de upsert em driver_events usado pelo
  // ImportModal manual e pelo /api/horizon/ingest (mesmo handleImportEvents,
  // só muda platformId).
  app.post('/api/maxtrack/ingest', requireHorizonBotToken, uploadMiddleware, async (req, res) => {
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
      req.body.platformId = 'maxtrack';
      req.body.mapping = JSON.stringify(applyPlatformMap(headers, 'maxtrack', {}));
      req.body.operatorEmail = '';

      await handleImportEvents(supabase, req, res, clearAnalyticsCache);

      if (responseBody?.success) {
        const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
        try {
          await supabase.from('automation_logs').insert({
            automation_id: BOT_MAXTRACK_SCRAPING_AUTOMATION_ID,
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
          console.error('[Maxtrack Ingest] Falha ao gravar automation_logs:', logErr);
        }

        try {
          await runAutoCrossCheck(supabase, 'maxtrack');
        } catch (crossCheckErr) {
          console.error('[Maxtrack Ingest] Falha no Auto Cross-Check:', crossCheckErr);
        }
      }
    } catch (err) {
      console.error('[Maxtrack Ingest] Erro ao processar importação:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || String(err) });
      }
    }
  });
}
