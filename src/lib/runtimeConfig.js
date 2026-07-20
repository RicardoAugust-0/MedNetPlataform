const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim();

// Em desenvolvimento, manter a conveniência do backend local. Em produção,
// ausência de configuração usa same-origin: isso falha de forma segura, sem
// enviar o bearer token para um processo arbitrário em localhost.
export const API_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/$/, '')
  : (import.meta.env.DEV ? 'http://localhost:3000' : '');
