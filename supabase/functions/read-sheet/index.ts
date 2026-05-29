import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SPREADSHEET_ID = "1Zk8iMPnTw-GkjcK3tHvR4oMFrzqXFaUocF6VWn0yC7s";

const MESES = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

const MES_NUM: Record<string, number> = Object.fromEntries(
  MESES.map((m, i) => [m, i + 1]),
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getMesLabel(date: Date): string {
  return `${MESES[date.getMonth()]} ${date.getFullYear()}`;
}

async function getAccessToken(sa: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const signingInput = `${b64url(header)}.${b64url(claim)}`;

  const pemContent = sa.private_key
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryDer = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token)
    throw new Error(`Google token error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

// Detecta se a linha é um cabeçalho (valores como "DATA", "EMPRESA" etc.)
function isHeaderRow(row: string[]): boolean {
  const first = (row[0] || "").trim().toUpperCase();
  return first === "DATA" || first === "DIA" || first === "DATE";
}

// Limpa valores de célula: remove erros de fórmula e normaliza undefined/null.
// Erros do Sheets chegam como strings (#N/A, #VALOR!, #REF!, etc.).
const FORMULA_ERRORS = new Set([
  "#N/A",
  "#VALOR!",
  "#VALUE!",
  "#REF!",
  "#DIV/0!",
  "#NUM!",
  "#NOME?",
  "#NAME?",
  "#NULO!",
  "#NULL!",
  "#CALC!",
]);
function cell(row: string[], index: number): string {
  const v = row[index];
  if (v === undefined || v === null) return "";
  const s = String(v).trim();
  if (FORMULA_ERRORS.has(s.toUpperCase())) return "";
  return s;
}

// Converte "dd/mm" + "JANEIRO 2025" em timestamp para ordenação
function rowTimestamp(data: string, mes: string): number {
  const [dStr, mStr] = data.split("/");
  const year = parseInt(mes.split(" ")[1] || "0");
  const month = parseInt(mStr || "0") || MES_NUM[mes.split(" ")[0]] || 1;
  const day = parseInt(dStr || "1");
  return new Date(year, month - 1, day).getTime();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    // Autenticação do usuário
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "Não autorizado" }, 401);

    // Quais abas ler (padrão: mês atual + anterior)
    const url = new URL(req.url);
    const mesParam = url.searchParams.get("meses");
    const now = new Date();
    const meses: string[] = mesParam
      ? mesParam
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean)
      : [
          getMesLabel(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
          getMesLabel(now),
        ];

    // Carregar service account e obter token
    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT");
    if (!saJson)
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT não configurado nos secrets do Supabase",
      );
    const sa = JSON.parse(saJson);
    const token = await getAccessToken(sa);

    // Ler cada aba
    type SheetRow = Record<string, string>;
    const allRows: SheetRow[] = [];

    for (const mes of meses) {
      // A:P — inclui a coluna P (ID_PLATAFORMA) para vincular cada linha ao seu id no banco.
      const range = `${mes}!A:P`;
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();

      if (data.error) {
        // Aba não existe (mês futuro ou sem dados)
        console.warn(
          `[read-sheet] Aba "${mes}" não encontrada:`,
          data.error.message,
        );
        continue;
      }

      const rows: string[][] = data.values || [];

      // Coleta as linhas válidas da aba e inverte: última linha = mais recente = primeira.
      const monthRows: SheetRow[] = [];
      const firstDataRow = rows.length > 0 && isHeaderRow(rows[0]) ? 1 : 0;

      for (let i = firstDataRow; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        // Detecta linhas sem dados reais pelos campos de identificação.
        // Não usar r.every() pois a coluna I pode ter fórmula =SE(...) em linhas vazias.
        const colaborador = cell(r, 3);
        const placa = cell(r, 4);
        const empresa = cell(r, 1);
        if (!colaborador && !placa && !empresa) continue;

        monthRows.push({
          data: cell(r, 0),
          empresa: cell(r, 1),
          sistema: cell(r, 2),
          colaborador: cell(r, 3),
          placa: cell(r, 4),
          frota: cell(r, 5),
          criticidade: cell(r, 6),
          classificacao: cell(r, 7),
          realizado: cell(r, 8),
          motivo: cell(r, 9),
          solicitadoPor: cell(r, 10),
          horaSolicitacao: cell(r, 11),
          realizadoPor: cell(r, 12),
          horaRealizacao: cell(r, 13),
          justificativa: cell(r, 14),
          idPlataforma: cell(r, 15), // Coluna P: id já gravado pela plataforma (se houver)
          _row: String(i + 1),       // Número 1-based da linha na aba (para vínculo posicional)
          _mes: mes,
        });
      }

      // Inverte para que o último item inserido na aba apareça primeiro.
      monthRows.reverse();
      allRows.push(...monthRows);
    }

    // Ordena por data descendente entre meses; dentro do mesmo dia preserva a ordem invertida acima.
    allRows.sort(
      (a, b) => rowTimestamp(b.data, b._mes) - rowTimestamp(a.data, a._mes),
    );

    return json({ ok: true, rows: allRows, meses });
  } catch (err) {
    console.error("[read-sheet]", err);
    return json({ error: (err as Error).message }, 500);
  }
});
