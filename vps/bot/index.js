/**
 * index.js — ponto de entrada do robô RPA.
 *
 * Pré-requisitos:
 *   1. cp .env.example .env && vim .env  (preencher SUPABASE_URL + SERVICE_KEY)
 *   2. npm install
 *   3. npx playwright install chromium
 *   4. Implementar os seletores em maxtrack.js
 *   5. node bot/index.js
 */

import 'dotenv/config'; // carrega .env
import { start } from './scheduler.js';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missing  = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('[Boot] Variáveis de ambiente ausentes:', missing.join(', '));
  console.error('[Boot] Copie .env.example para .env e preencha os valores.');
  process.exit(1);
}

start().catch(err => {
  console.error('[Boot] Falha fatal:', err);
  process.exit(1);
});
