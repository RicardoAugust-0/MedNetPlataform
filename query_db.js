import { createClient } from '@supabase/supabase-js';

const url = 'https://jvqlxrixzqlbwmmdwcob.supabase.co';
const key = 'sb_publishable__Q7HjPr88XdzLTebRh_9nA_9NZdGFak';
const supabase = createClient(url, key);

async function check() {
  console.log('Querying 200 random driver_events without sorting...');
  
  const { data, error } = await supabase
    .from('driver_events')
    .select('platform_id, analise_ia_plataforma, ocorrido_em, descricao')
    .limit(200);
    
  if (error) {
    console.error(error);
    return;
  }
  
  console.log('Sample of 10 rows:');
  console.log(data.slice(0, 10));
  
  const counts = {};
  for (const r of data) {
    const key = `${r.platform_id} | ${r.analise_ia_plataforma}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  
  console.log('200 counts by platform and classification:', counts);
}

check();
