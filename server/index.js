import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { registerAnalyticsRoutes } from './analytics-routes.js';
import { registerWhatsappRoutes } from './whatsapp-routes.js';

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

app.listen(PORT, () => {
  console.log(`[MedNet Backend] Servidor rodando na porta ${PORT}`);
});
