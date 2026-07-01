import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { registerAnalyticsRoutes } from './analytics-routes.js';
import { registerWhatsappRoutes } from './whatsapp-routes.js';
import { registerAiChatRoutes } from './ai-chat-routes.js';
import { registerHorizonRoutes } from './horizon-routes.js';

// Load env variables from root and server directory
dotenv.config({ path: '../.env' });
dotenv.config();

const app = express();
// CORS: por padrão permissivo (compat). Defina CORS_ORIGIN (lista separada por
// vírgula) para travar a API à(s) origem(ns) do front em produção. A proteção
// real das rotas é o middleware de auth/role — CORS é só defesa-em-profundidade.
const corsAllowed = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : null;
app.use(cors(corsAllowed ? { origin: corsAllowed } : {}));
app.use(express.json());

const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[MedNet Backend] ERRO: Credenciais do Supabase não configuradas.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log(`[MedNet Backend] Conectado ao Supabase: ${supabaseUrl}`);

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'MedNet Analytics API' });
});

// Register modular routes
registerAnalyticsRoutes(app, supabase);
registerWhatsappRoutes(app, supabase);
registerAiChatRoutes(app, supabase);
registerHorizonRoutes(app, supabase);

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
