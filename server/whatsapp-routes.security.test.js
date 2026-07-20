import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerWhatsappRoutes } from './whatsapp-routes.js';

function captureRoutes(supabase = {}) {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); },
  };
  registerWhatsappRoutes(app, supabase);
  return routes;
}

function responseMock() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
    sendStatus: vi.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.sendStatus.mockReturnValue(res);
  return res;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('WhatsApp route security', () => {
  it('falha fechado quando o verify token nao esta configurado', () => {
    vi.stubEnv('WHATSAPP_WEBHOOK_VERIFY_TOKEN', '');
    const handler = captureRoutes().get('GET /api/whatsapp/webhook').at(-1);
    const res = responseMock();
    handler({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('falha fechado sem app secret e rejeita HMAC invalido', async () => {
    const rawBody = Buffer.from('{"entry":[]}');
    const req = {
      body: { entry: [] },
      rawBody,
      get: vi.fn(() => 'sha256=invalido'),
    };

    vi.stubEnv('WHATSAPP_APP_SECRET', '');
    let handler = captureRoutes().get('POST /api/whatsapp/webhook').at(-1);
    let res = responseMock();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);

    vi.stubEnv('WHATSAPP_APP_SECRET', 'app-secret');
    handler = captureRoutes().get('POST /api/whatsapp/webhook').at(-1);
    res = responseMock();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('aceita payload assinado e processa com a RPC', async () => {
    vi.stubEnv('WHATSAPP_APP_SECRET', 'app-secret');
    const rawBody = Buffer.from(JSON.stringify({ entry: [] }));
    const signature = `sha256=${createHmac('sha256', 'app-secret').update(rawBody).digest('hex')}`;
    const supabase = { rpc: vi.fn() };
    const handler = captureRoutes(supabase).get('POST /api/whatsapp/webhook').at(-1);
    const res = responseMock();
    await handler({ body: { entry: [] }, rawBody, get: () => signature }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      received: true,
      messagesProcessed: 0,
      statusesProcessed: 0,
      ignored: 0,
    });
  });

  it('ignora userId do corpo em endpoint autenticado', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          order: () => ({
            limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }),
        insert,
      })),
    };
    const handler = captureRoutes(supabase).get('POST /api/whatsapp/credentials').at(-1);
    const res = responseMock();
    await handler({
      authUser: { id: 'sessao-real' },
      body: {
        token: 'token-seguro',
        phone_number_id: '12345',
        whatsapp_business_account_id: '67890',
        userId: 'atacante',
      },
    }, res);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ updated_by: 'sessao-real' }));
    expect(insert).not.toHaveBeenCalledWith(expect.objectContaining({ updated_by: 'atacante' }));
  });
});
