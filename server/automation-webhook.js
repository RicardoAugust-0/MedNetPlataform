const PLAYWRIGHT_BOT_HOST = 'botsplaywright.duckdns.org';

export function buildAutomationWebhookBody(endpoint, metadata) {
  try {
    const url = new URL(endpoint);
    // O orquestrador FastAPI repassa cada chave do JSON como argumento de
    // run_automation(). Os robôs atuais têm assinaturas estritas e são
    // disparados sem parâmetros; metadados causariam "unexpected keyword".
    if (url.hostname === PLAYWRIGHT_BOT_HOST && url.pathname.startsWith('/automacoes/')) {
      return {};
    }
  } catch {
    // A validação do endpoint acontece antes; mantém payload padrão caso uma
    // integração use uma URL não convencional aceita pelo runtime.
  }
  return metadata;
}
