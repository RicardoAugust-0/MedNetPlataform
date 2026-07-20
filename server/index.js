import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { registerAnalyticsRoutes } from './analytics-routes.js';
import { registerWhatsappRoutes } from './whatsapp-routes.js';
import { registerAiChatRoutes } from './ai-chat-routes.js';
import { registerHorizonRoutes } from './horizon-routes.js';
import { registerMaxtrackRoutes } from './maxtrack-routes.js';
import { registerAutomationRoutes } from './automation-routes.js';
import { startAutomationScheduler } from './automation-scheduler.js';
import { buildCorsOptions, loadRuntimeConfig, registerHealthRoutes } from './runtime-config.js';
import { createRateLimitMiddleware, createSecurityHeadersMiddleware } from './security.js';

// Load env variables from root and server directory
dotenv.config({ path: '../.env' });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
let runtime;
try {
  runtime = loadRuntimeConfig();
} catch (error) {
  console.error('[MedNet Backend] ERRO de configuracao:', error.message);
  process.exit(1);
}

app.disable('x-powered-by');
app.set('trust proxy', runtime.trustProxyHops);
app.use(createSecurityHeadersMiddleware({
  production: runtime.production,
  ...runtime.securityHeaders,
}));
app.use(cors(buildCorsOptions(runtime.corsAllowedOrigins, { production: runtime.production })));
app.use(createRateLimitMiddleware(runtime.rateLimit));
app.use(express.json({
  limit: runtime.jsonBodyLimit,
  verify(req, res, buffer) {
    if (req.method === 'POST' && req.originalUrl?.startsWith('/api/whatsapp/webhook')) {
      req.rawBody = Buffer.from(buffer);
    }
  },
}));

const supabase = createClient(runtime.supabaseUrl, runtime.supabaseKey);
console.log(`[MedNet Backend] Runtime Node: ${process.version}`);
console.log(`[MedNet Backend] Conectado ao Supabase: ${runtime.supabaseUrl}`);
registerHealthRoutes(app, supabase, { readinessTimeoutMs: runtime.readinessTimeoutMs });

// Register modular routes
registerAnalyticsRoutes(app, supabase);
registerWhatsappRoutes(app, supabase);
registerAiChatRoutes(app, supabase);
registerHorizonRoutes(app, supabase);
registerMaxtrackRoutes(app, supabase);
registerAutomationRoutes(app, supabase);

// O banco coordena as reivindicações, portanto múltiplas instâncias do
// backend podem manter este executor ativo sem disparar o mesmo horário duas
// vezes. A service role é obrigatória para acessar as RPCs internas.
startAutomationScheduler(supabase, {
  enabled: Boolean(runtime.serviceRoleKey),
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Corpo da requisicao acima do limite.' });
  }
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'JSON invalido.' });
  }
  if (error?.status === 403) return res.status(403).json({ error: 'Origem nao permitida.' });
  console.error('[MedNet Backend] Erro nao tratado:', error?.message || error);
  return res.status(500).json({ error: 'Erro interno.' });
});

const server = app.listen(PORT, () => {
  console.log(`[MedNet Backend] Servidor rodando na porta ${PORT}`);
});

// Os endpoints de IA fazem várias chamadas sequenciais ao provedor (loop de
// ferramentas) e podem levar minutos — sobretudo geração de PDF/dossiê.
// Por padrão o Node fecha conexões keep-alive em 5s; quando esse valor é menor
// que o idle do proxy (Coolify/Traefik), o proxy reusa uma conexão que o Node
// está fechando e o front recebe "Failed to fetch". Alinhamos as janelas para
// aguentar respostas longas. headersTimeout DEVE ser > keepAliveTimeout.
server.keepAliveTimeout = 120000; // 120s
server.headersTimeout = 125000;   // 125s
server.requestTimeout = 300000;   // 5 min de teto por requisição
