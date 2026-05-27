import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read env
const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;

console.log('URL:', url);

const supabase = createClient(url, key);

async function run() {
  const { data: profiles, error: err1 } = await supabase.from('profiles').select('*');
  if (err1) {
    console.error('Error fetching profiles:', err1);
  } else {
    console.log('Profiles in DB:', profiles.map(p => ({ id: p.id, nome: p.nome, role: p.role })));
  }

  const { data: atendimentos, error: err2 } = await supabase.from('atendimentos').select('*');
  if (err2) {
    console.error('Error fetching atendimentos:', err2);
  } else {
    console.log('Unique operadores in atendimentos:', [...new Set(atendimentos.map(a => a.operador || a.operador_nome))]);
  }
}

run();
