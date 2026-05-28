/**
 * maxtrack.js — Playwright automation para download do relatório Maxtrack.
 *
 * TODO (implementar quando a VPS estiver ativa):
 *   1. Instalar dependências: npm install && npx playwright install chromium
 *   2. Preencher PORTAL_URL e os seletores CSS corretos após inspecionar o portal.
 *   3. Testar com `node bot/maxtrack.js --dry-run` antes de ativar o scheduler.
 *
 * Fluxo esperado:
 *   a) Abre https://go.maxtrack.com.br/#event/Event
 *   b) Faz login com as credenciais lidas de rpa_credentials (email + password)
 *   c) Aplica filtro temporal: hoje (00:00 → agora)
 *   d) Exporta o relatório em CSV
 *   e) Retorna o conteúdo do arquivo como string
 */

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import fs from 'fs';

const PORTAL_URL = 'https://go.maxtrack.com.br/#event/Event';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

/**
 * Lê as credenciais RPA da tabela rpa_credentials.
 * Requer service_role (bypassa RLS).
 */
async function loadCredentials() {
  const { data, error } = await supabase
    .from('rpa_credentials')
    .select('email, password')
    .eq('platform_id', 'maxtrack')
    .single();

  if (error || !data) throw new Error('Credenciais Maxtrack não configuradas. Acesse Admin → Automação RPA.');
  return data;
}

/**
 * Executa o robô e retorna o conteúdo do CSV baixado.
 *
 * @returns {Promise<string>} conteúdo CSV (ponto-e-vírgula)
 */
export async function downloadReport(tipo = 'abertos') {
  console.log('[Maxtrack] Carregando credenciais do banco...');
  const { email, password } = await loadCredentials();

  console.log('[Maxtrack] Iniciando navegador em modo headless...');
  const browser = await chromium.launch({ 
    headless: true, // true para rodar silenciosamente no terminal (e na VPS)
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`[Maxtrack] Navegando para ${PORTAL_URL}...`);
    await page.goto(PORTAL_URL);

    // 1. Efetuar Login
    console.log('[Maxtrack] Inserindo credenciais e efetuando login...');
    await page.locator('input[type="text"]').click();
    await page.locator('input[type="text"]').fill(email);
    
    await page.locator('input[type="password"]').click();
    await page.locator('input[type="password"]').fill(password);
    
    await page.getByRole('button', { name: 'ENTRAR' }).click();

    // Aguarda o painel carregar (esperando o botão de Exportar ficar visível)
    console.log('[Maxtrack] Aguardando carregamento do painel principal...');
    await page.waitForSelector('[title="Exportar"]', { timeout: 45000 });

    // Seleciona os filtros corretos com base no parâmetro
    if (tipo === 'todos') {
      console.log('[Maxtrack] Filtrando por: Superior = Todos, Inferior = Todos...');
      await page.locator('.badge-action').filter({ hasText: 'Todos' }).first().click();
      await page.getByText('Todos').nth(1).click();
    } else if (tipo === 'fechados') {
      console.log('[Maxtrack] Filtrando por: Superior = Fechados, Inferior = Todos...');
      await page.locator('.badge-action').filter({ hasText: 'Fechados' }).click();
      await page.getByText('Todos').nth(1).click();
    } else {
      // Padrão 'abertos'
      console.log('[Maxtrack] Filtrando por: Superior = Abertos, Inferior = Todos...');
      await page.locator('.badge-action').filter({ hasText: 'Abertos' }).click();
      await page.getByText('Todos').nth(1).click();
    }

    // 2. Abrir menu de Exportação
    console.log('[Maxtrack] Abrindo menu de exportação...');
    await page.getByTitle('Exportar').click();
    await page.getByTitle('Exportar em formato CSV').click();

    // 3. Aguardar disparar o popup e o download
    console.log('[Maxtrack] Solicitando download do arquivo CSV...');
    
    // Aguarda o botão ficar disponível antes de clicar (útil se a Maxtrack demorar para processar o CSV)
    console.log('[Maxtrack] Aguardando o botão "Baixar arquivo processado" ficar disponível...');
    await page.waitForSelector('[title="Baixar arquivo processado"]', { state: 'visible', timeout: 60000 });

    const [page1, download] = await Promise.all([
      page.waitForEvent('popup', { timeout: 60000 }),
      page.waitForEvent('download', { timeout: 60000 }),
      page.getByTitle('Baixar arquivo processado').first().click()
    ]);

    // Fechar o popup gerado para liberar memória
    if (page1) {
      await page1.close();
    }

    console.log('[Maxtrack] Download concluído. Lendo conteúdo do arquivo...');
    const filePath = await download.path();
    const csvContent = await fs.promises.readFile(filePath, 'utf8');

    return csvContent;
  } finally {
    console.log('[Maxtrack] Fechando navegador...');
    await browser.close();
  }
}
