import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const email = process.env.MAXTRACK_EMAIL;
const password = process.env.MAXTRACK_PASSWORD;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Erro] Configure SUPABASE_URL e SUPABASE_SERVICE_KEY no seu arquivo .env');
  process.exit(1);
}

if (!email || !password) {
  console.error('[Erro] Configure MAXTRACK_EMAIL e MAXTRACK_PASSWORD no seu arquivo .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('[Seed] Verificando e cadastrando credenciais na tabela rpa_credentials...');

  // 1. Tentar salvar a credencial na tabela
  const { error } = await supabase
    .from('rpa_credentials')
    .upsert({
      platform_id: 'maxtrack',
      email: email,
      password: password,
      updated_at: new Date().toISOString()
    }, { onConflict: 'platform_id' });

  if (error) {
    if (error.code === 'PGRST116' || error.message.includes('relation "public.rpa_credentials" does not exist')) {
      console.log('\n[ATENÇÃO] A tabela "rpa_credentials" NÃO existe no seu banco de dados Supabase!');
      console.log('Para criá-la, vá no painel do Supabase -> SQL Editor e execute o seguinte comando:\n');
      console.log(`
CREATE TABLE IF NOT EXISTS rpa_credentials (
  platform_id  text        PRIMARY KEY,
  email        text        NOT NULL,
  password     text        NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid
);

ALTER TABLE rpa_credentials ENABLE ROW LEVEL SECURITY;
      `);
      console.log('\nDepois de executar no SQL Editor do Supabase, rode este script de seed novamente.');
    } else {
      console.error('[Erro] Falha ao cadastrar credencial:', error.message);
    }
  } else {
    console.log('[Sucesso] Credenciais gravadas no Supabase!');
    console.log(`Plataforma: maxtrack`);
    console.log(`E-mail: ${email}`);
  }
}

seed();
