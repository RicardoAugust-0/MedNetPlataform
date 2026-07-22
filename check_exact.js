import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)\s*$/);
  if (match) env[match[1]] = match[2].trim();
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkExact() {
  const { data, error } = await supabase
    .from('driver_events')
    .select('id, operador, ocorrido_em, fim_tratativa')
    .eq('platform_id', 'maxtrack')
    .not('fim_tratativa', 'is', null)
    .gte('fim_tratativa', '2026-07-22T00:00:00Z')
    .order('fim_tratativa', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  console.log('Latest 10 MaxTrack rows by fim_tratativa:');
  for (const r of data || []) {
    const oUtc = new Date(r.ocorrido_em);
    const fUtc = new Date(r.fim_tratativa);
    console.log(`Operador: ${r.operador}`);
    console.log(`  ocorrido_em:   ${r.ocorrido_em} (SP: ${oUtc.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`);
    console.log(`  fim_tratativa: ${r.fim_tratativa} (SP: ${fUtc.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`);
    console.log(`  diff (fUtc - oUtc): ${(fUtc - oUtc) / 3600000} hours\n`);
  }
}

checkExact().catch(console.error);
