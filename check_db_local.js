import { createClient } from '@supabase/supabase-js';

const url = 'https://jvqlxrixzqlbwmmdwcob.supabase.co';
const key = 'sb_publishable__Q7HjPr88XdzLTebRh_9nA_9NZdGFak';
const supabase = createClient(url, key);

async function check() {
  try {
    const { count, error } = await supabase
      .from('driver_events')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('Error getting count:', error);
      return;
    }
    console.log('Total count in DB:', count);

    // Get counts per platform
    for (const p of ['sascar', 'maxtrack']) {
      const { count: pCount, error: pErr } = await supabase
        .from('driver_events')
        .select('*', { count: 'exact', head: true })
        .eq('platform_id', p);
      console.log(`Platform ${p} count:`, pCount, pErr);
    }

    // Try a range query
    const { data: rangeData, error: rangeErr } = await supabase
      .from('driver_events')
      .select('platform_id, ocorrido_em')
      .eq('platform_id', 'sascar')
      .order('ocorrido_em', { ascending: false })
      .range(0, 4);
    
    console.log('Range 0-4 data:', rangeData?.length, rangeErr);
    if (rangeData && rangeData.length > 0) {
      console.log('First record date:', rangeData[0].ocorrido_em);
      console.log('Last record date:', rangeData[rangeData.length - 1].ocorrido_em);
    }

  } catch (e) {
    console.error('Execution error:', e);
  }
}

check();
