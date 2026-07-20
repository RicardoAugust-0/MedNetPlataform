import { applyPlatformMap } from '../src/utils/fatigueParser.js';
import { uploadMiddleware, handleImportEvents, readUploadHeaders } from './analytics-import.js';
import { clearAnalyticsCache } from './analytics-routes.js';
import { requireHorizonBotToken } from './horizon-routes.js';
import { getHorizonTreatmentQueueSummary, runAutoCrossCheck } from './auto-crosscheck.js';

// Mesmo id semeado em 20260702120000_maxtrack_ingest_automation.sql para Bot_MaxtrackScraping.
const BOT_MAXTRACK_SCRAPING_AUTOMATION_ID = 'a1b94e82-e3e7-4c74-bfd4-3a56df93df28';

// Export da MaxTrack sempre vem em CSV (`;`-delimitado) — sem o branch XLSX
// que o horizon-routes.js tem, porque a MaxTrack não exporta nesse formato.
function timeLabel() {
  return new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo',
  });
}

async function writeMaxtrackExecutionLog(supabase, req, payload) {
  const activityLogId = req.get('x-automation-log-id');
  if (activityLogId) {
    const { data: current, error: readError } = await supabase
      .from('automation_logs')
      .select('logs')
      .eq('id', activityLogId)
      .eq('automation_id', BOT_MAXTRACK_SCRAPING_AUTOMATION_ID)
      .maybeSingle();
    if (readError) throw readError;
    if (current) {
      const previousLines = Array.isArray(current.logs) ? current.logs : [];
      const { error } = await supabase
        .from('automation_logs')
        .update({ ...payload, logs: [...previousLines, ...(payload.logs || [])].slice(-20) })
        .eq('id', activityLogId)
        .eq('automation_id', BOT_MAXTRACK_SCRAPING_AUTOMATION_ID);
      if (error) throw error;
      return;
    }
  }

  const { error } = await supabase.from('automation_logs').insert({
    automation_id: BOT_MAXTRACK_SCRAPING_AUTOMATION_ID,
    ...payload,
  });
  if (error) throw error;
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
      const headers = await readUploadHeaders(req.files[0]);
      req.body.platformId = 'maxtrack';
      req.body.mapping = JSON.stringify(applyPlatformMap(headers, 'maxtrack', {}));
      req.body.operatorEmail = '';

      await handleImportEvents(supabase, req, res, clearAnalyticsCache);

      if (responseBody?.success) {
        const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
        let queueSummary = null;
        let crossCheckError = null;
        try {
          await runAutoCrossCheck(supabase, 'maxtrack');
          queueSummary = await getHorizonTreatmentQueueSummary(supabase);
        } catch (crossCheckErr) {
          crossCheckError = crossCheckErr;
          console.error('[Maxtrack Ingest] Falha no Auto Cross-Check:', crossCheckErr);
        }

        const imported = responseBody.uniqueSavedCount ?? 0;
        const queueDetail = queueSummary
          ? ` · fila Horizon: ${queueSummary.pending} pendente(s), ${queueSummary.processing} em tratamento, ${queueSummary.error} erro(s)`
          : '';
        const lines = [{
          t: timeLabel(),
          lvl: 'ok',
          m: `${imported} eventos únicos importados de ${req.files.length} arquivo(s)`,
        }];
        if (queueSummary) {
          lines.push({
            t: timeLabel(),
            lvl: queueSummary.error > 0 ? 'warn' : 'info',
            m: `Fila Horizon: ${queueSummary.pending} pendente(s), ${queueSummary.processing} em tratamento, ${queueSummary.done} tratado(s), ${queueSummary.no_horizon_match} sem correspondência, ${queueSummary.error} erro(s)`,
          });
        } else if (crossCheckError) {
          lines.push({ t: timeLabel(), lvl: 'warn', m: `Cross-check não confirmado: ${crossCheckError.message || crossCheckError}` });
        }

        try {
          await writeMaxtrackExecutionLog(supabase, req, {
            status: crossCheckError ? 'failure' : 'success',
            duration: `${durationSec}s`,
            detail: crossCheckError
              ? `${imported} eventos importados, mas o cross-check Horizon falhou`
              : `${imported} eventos importados${queueDetail}`,
            logs: lines,
          });
        } catch (logErr) {
          console.error('[Maxtrack Ingest] Falha ao gravar automation_logs:', logErr);
        }
      } else if (responseBody) {
        try {
          await writeMaxtrackExecutionLog(supabase, req, {
            status: 'failure',
            duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
            detail: responseBody.error || 'Importação MaxTrack recusada pelo MedNet',
            logs: [{
              t: timeLabel(),
              lvl: 'err',
              m: responseBody.error || 'O arquivo exportado não foi importado.',
            }],
          });
        } catch (logErr) {
          console.error('[Maxtrack Ingest] Falha ao registrar importação recusada:', logErr);
        }
      }
    } catch (err) {
      console.error('[Maxtrack Ingest] Erro ao processar importação:', err);
      try {
        await writeMaxtrackExecutionLog(supabase, req, {
          status: 'failure',
          duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
          detail: err.message || 'Falha ao importar relatório MaxTrack',
          logs: [{ t: timeLabel(), lvl: 'err', m: err.message || String(err) }],
        });
      } catch (logErr) {
        console.error('[Maxtrack Ingest] Falha ao registrar erro:', logErr);
      }
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || String(err) });
      }
    }
  });
}
