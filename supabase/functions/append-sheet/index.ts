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
function normalizeDate(dStr: string): string {
  if (!dStr) return '';
  const trimmed = dStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    return `${d}/${m}`;
  }
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})/);
  if (match) {
    const d = match[1].padStart(2, '0');
    const m = match[2].padStart(2, '0');
    return `${d}/${m}`;
  }
  return trimmed.toLowerCase();
}

function normalizePlaca(pStr: string): string {
  if (!pStr) return '';
  return pStr.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function normalizeName(nStr: string): string {
  if (!nStr) return '';
  return nStr.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  let record: any = null;

  try {
    // 1. Validar Autenticação (Service Role, local trigger, ou sessão de operador)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autorizado' }, 401);

    const tokenStr = authHeader.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    const triggerSecret = Deno.env.get('TRIGGER_SECRET');

    let isAuthorized = false;
    if (tokenStr === serviceRoleKey) {
      // Chamada com a service_role key (scripts internos / jobs)
      isAuthorized = true;
    } else if (triggerSecret && tokenStr === triggerSecret) {
      // Caminho seguro: trigger do banco autenticada com o secret compartilhado
      isAuthorized = true;
    } else if (!triggerSecret && tokenStr === 'SYSTEM_TRIGGER') {
      // COMPATIBILIDADE: aceita o literal legado APENAS enquanto TRIGGER_SECRET
      // não estiver configurado. Configure o secret (env da função + Vault) para
      // fechar a brecha — ver migration *_secure_append_sheet_trigger.sql.
      console.warn('[append-sheet] Token legado SYSTEM_TRIGGER aceito. Configure TRIGGER_SECRET para encerrar o modo de compatibilidade.');
      isAuthorized = true;
    } else {
      // Valida sessão de operador logado
      const userClient = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (user) isAuthorized = true;
    }

    if (!isAuthorized) return json({ error: 'Não autorizado' }, 401);

    // 2. Extrair registro e tipo de evento (suporta payload direto ou webhook do postgres)
    const body = await req.json();
    const isWebhook = body.type && body.record;
    record = isWebhook ? body.record : body;

    if (!record || !record.id) {
      throw new Error('Payload inválido: campo ID do registro não encontrado');
    }

    // 3. Autenticação na Google Sheets API
    const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT');
    if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT não configurado nos secrets');
    const sa = JSON.parse(saJson);
    const gToken = await getAccessToken(sa);

    const aba = getMesAtual();

    // 4. Mapear os dados para as colunas da planilha (A até P - 16 colunas)
    // A: DATA | B: EMPRESA | C: SISTEMA | D: COLABORADOR | E: PLACA | F: FROTA
    // G: CRITICIDADE | H: CLASSIFICAÇÃO | I: REALIZADO? | J: MOTIVO
    // K: SOLICITADO POR | L: HORA SOLICITAÇÃO | M: REALIZADO POR
    // N: HORA REALIZAÇÃO | O: JUSTIFICATIVA | P: ID_PLATAFORMA
    const valuesRow = [
      record.data || '',
      record.empresa || '',
      record.sistema || '',
      record.colaborador || '',
      record.placa || '',
      record.frota || '',
      record.criticidade || '',
      record.classificacao || '',
      record.realizado || 'NÃO',
      record.motivo || '',
      record.solicitado_por || record.solicitadoPor || '',
      record.hora_solicitacao || record.horaSolicitacao || '',
      record.realizado_por || record.realizadoPor || '',
      record.hora_realizacao || record.horaRealizacao || '',
      record.justificativa || '',
      record.id, // P: ID_PLATAFORMA para garantir a idempotência
    ];

    // 5. Verificar se o registro já existe na planilha (A:P)
    const searchRange = `${aba}!A:P`;
    const searchRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(searchRange)}`,
      { headers: { 'Authorization': `Bearer ${gToken}` } }
    );
    
    const searchData = await searchRes.json();
    const existingRows = searchData.values || [];
    
    let rowIndex = -1;
    
    // 1ª tentativa: Buscar por ID na Coluna P (índice 15)
    for (let i = 0; i < existingRows.length; i++) {
      const row = existingRows[i];
      if (row && row.length > 15 && row[15] === record.id) {
        rowIndex = i + 1; // Conversão para índice 1-based do Google Sheets
        console.log(`[append-sheet] Registro encontrado pelo ID na linha ${rowIndex}`);
        break;
      }
    }
    
    // 1.5ª tentativa: posição exata informada em linha_sheet (ex.: "MAIO 2026!A12:P12"),
    // verificando placa + colaborador para não atualizar a linha errada caso a planilha
    // tenha sido deslocada. Resolve o caso das linhas importadas (sem id na Coluna P).
    if (rowIndex === -1 && record.linha_sheet) {
      const posMatch = String(record.linha_sheet).match(/!A(\d+):P\d+\s*$/i);
      if (posMatch) {
        const n = parseInt(posMatch[1], 10);
        const row = existingRows[n - 1];
        if (row && row.length >= 5) {
          const placaOk = normalizePlaca(row[4]) === normalizePlaca(record.placa);
          const colabRow = normalizeName(row[3]);
          const colabRec = normalizeName(record.colaborador);
          const colabOk  = colabRow === colabRec || !colabRow || !colabRec;
          if (placaOk && colabOk) {
            rowIndex = n;
            console.log(`[append-sheet] Linha localizada por posição (linha_sheet) e verificada: ${rowIndex}`);
          }
        }
      }
    }

    // 2ª tentativa (Fallback): Buscar por correspondência de dados operacionais (Data, Placa, Colaborador)
    if (rowIndex === -1 && existingRows.length > 0) {
      const targetDate = normalizeDate(record.data);
      const targetPlaca = normalizePlaca(record.placa);
      const targetColab = normalizeName(record.colaborador);
      
      console.log(`[append-sheet] ID não encontrado na Coluna P. Buscando por correspondência operacional: Data=${targetDate}, Placa=${targetPlaca}, Colaborador=${targetColab}`);
      
      for (let i = 0; i < existingRows.length; i++) {
        const row = existingRows[i];
        if (row && row.length >= 5) {
          const rowDate = normalizeDate(row[0]);
          const rowColab = normalizeName(row[3]);
          const rowPlaca = normalizePlaca(row[4]);
          
          if (rowDate === targetDate && rowPlaca === targetPlaca && rowColab === targetColab) {
            rowIndex = i + 1;
            console.log(`[append-sheet] Correspondência operacional encontrada de fallback na linha ${rowIndex}!`);
            break;
          }
        }
      }
    }

    let updatedRange = '';

    if (rowIndex !== -1) {
      // REGISTRO EXISTE -> UPDATE (atualizar apenas a linha encontrada de A a P)
      const updateRange = `${aba}!A${rowIndex}:P${rowIndex}`;
      const updateRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${gToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [valuesRow] }),
        }
      );
      const updateResult = await updateRes.json();
      if (updateResult.error) throw new Error(`Google Sheets Update Error: ${updateResult.error.message}`);
      updatedRange = updateResult.updatedRange || updateRange;
      console.log(`[append-sheet] Linha atualizada com sucesso no Sheets: ${updatedRange}`);
    } else {
      // REGISTRO NÃO EXISTE -> INSERT (Determina a primeira linha livre nas colunas A-H e faz PUT)
      let lastActiveRowIndex = 0;
      for (let i = 0; i < existingRows.length; i++) {
        const row = existingRows[i];
        const hasData = row && row.slice(0, 8).some((cell: any) => cell && String(cell).trim() !== '');
        if (hasData) {
          lastActiveRowIndex = i + 1; // Índice 1-based
        }
      }
      
      const nextRowIndex = lastActiveRowIndex > 0 ? lastActiveRowIndex + 1 : 2;
      const insertRange = `${aba}!A${nextRowIndex}:P${nextRowIndex}`;
      
      const insertRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(insertRange)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${gToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [valuesRow] }),
        }
      );
      const insertResult = await insertRes.json();
      if (insertResult.error) throw new Error(`Google Sheets Insert Error: ${insertResult.error.message}`);
      updatedRange = insertResult.updatedRange || insertRange;
      console.log(`[append-sheet] Nova linha inserida no Sheets (PUT): ${updatedRange}`);
    }

    // 6. Atualizar status de sucesso no banco de dados do Supabase
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { error: dbErr } = await supabaseAdmin
      .from('intervencoes_sheet')
      .update({
        status_sync: 'sincronizado',
        linha_sheet: updatedRange,
        ultimo_erro_sync: null
      })
      .eq('id', record.id);

    if (dbErr) {
      console.error('[append-sheet] Erro ao gravar status de sucesso no Supabase:', dbErr.message);
    }

    return json({ ok: true, aba, linha: updatedRange });

  } catch (err) {
    const errMsg = (err as Error).message;
    console.error('[append-sheet] Erro crítico no fluxo de espelhamento:', errMsg);

    // Gravar o status de erro e incrementar tentativas no Supabase se houver ID
    if (record && record.id) {
      try {
        const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const { data: recData } = await supabaseAdmin
          .from('intervencoes_sheet')
          .select('tentativas_sync')
          .eq('id', record.id)
          .single();

        const tentativas = (recData?.tentativas_sync || 0) + 1;

        await supabaseAdmin
          .from('intervencoes_sheet')
          .update({
            status_sync: 'erro',
            tentativas_sync: tentativas,
            ultimo_erro_sync: errMsg
          })
          .eq('id', record.id);
      } catch (dbErr) {
        console.error('[append-sheet] Falha ao registrar status de erro no banco:', (dbErr as Error).message);
      }
    }

    return json({ error: errMsg }, 500);
  }
});
