const PLAYWRIGHT_BOT_HOST = 'botsplaywright.duckdns.org';

export function isPlaywrightAutomationEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.hostname === PLAYWRIGHT_BOT_HOST && url.pathname.startsWith('/automacoes/');
  } catch {
    return false;
  }
}

export function buildAutomationWebhookBody(endpoint, metadata) {
  // O orquestrador FastAPI repassa cada chave do JSON como argumento de
  // run_automation(). Os robôs atuais têm assinaturas estritas e são
  // disparados sem parâmetros; metadados causariam "unexpected keyword".
  if (isPlaywrightAutomationEndpoint(endpoint)) return {};
  return metadata;
}
