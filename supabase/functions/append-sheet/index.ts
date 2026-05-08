import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SPREADSHEET_ID = '1Zk8iMPnTw-GkjcK3tHvR4oMFrzqXFaUocF6VWn0yC7s';
const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
               'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getMesAtual() {
  const now = new Date();
  return `${MESES[now.getMonth()]} ${now.getFullYear()}`;
}

async function getAccessToken(sa: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const header  = { alg: 'RS256', typ: 'JWT' };
  const claim   = {
    iss:  sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:  'https://oauth2.googleapis.com/token',
    exp:  now + 3600,
    iat:  now,
  };

  const signingInput = `${b64url(header)}.${b64url(claim)}`;

  const pemContent = sa.private_key
    .replace(/\\n/g, '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`Google token error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    // Verificar usuário autenticado
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autorizado' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Não autorizado' }, 401);

    // Carregar payload
    const payload = await req.json();

    // Carregar service account
    const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT');
    if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT não configurado nos secrets do Supabase');
    const sa = JSON.parse(saJson);

    // Obter access token
    const token = await getAccessToken(sa);

    // Aba do mês atual
    const aba = getMesAtual();
    const range = `${aba}!A:P`;

    // Linha a inserir (16 colunas — A até P)
    const values = [[
      payload.data            || '',   // A: DATA
      payload.empresa         || '',   // B: EMPRESA
      payload.sistema         || '',   // C: SISTEMA
      payload.colaborador     || '',   // D: COLABORADOR
      payload.placa           || '',   // E: PLACA
      payload.frota           || '',   // F: FROTA
      payload.criticidade     || '',   // G: CRITICIDADE
      payload.classificacao   || '',   // H: CLASSIFICAÇÃO
      '',                              // I: REALIZADO? (operador preenche)
      payload.motivo          || '',   // J: MOTIVO
      '',                              // K: (vazia)
      payload.solicitadoPor   || '',   // L: SOLICITADO POR
      payload.horaSolicitacao || '',   // M: DE SOLICITAÇÃO
      '',                              // N: REALIZADO POR (operador preenche)
      '',                              // O: DE REALIZAÇÃO (operador preenche)
      '',                              // P: JUSTIFICATIVA (operador preenche)
    ]];

    const sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      },
    );

    const result = await sheetsRes.json();
    if (result.error) throw new Error(result.error.message);

    return json({ ok: true, aba, linha: result.updates?.updatedRange });

  } catch (err) {
    console.error('[append-sheet]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
