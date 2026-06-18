import { describe, it } from 'vitest';
import { supabase } from './supabase.js';

describe('Login and Query Test', () => {
  it('attempts login and queries data', async () => {
    try {
      const email = 'asraelz12123@gmail.com';
      const password = '481626481626Alfa..';

      console.log('Attempting sign in...');
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      console.log('Auth result:');
      console.log('Error:', authErr);
      console.log('User ID:', authData?.user?.id);

      if (authData?.user) {
        // Query counts
        const { count, error: countErr } = await supabase
          .from('driver_events')
          .select('*', { count: 'exact', head: true })
          .eq('platform_id', 'sascar');
        
        console.log('Sascar Count in DB:', count, 'Error:', countErr);

        // Fetch pages
        const limit = 5000;
        const numPages = Math.ceil((count || 0) / limit);
        console.log('Num pages to fetch:', numPages);

        for (let pageIdx = 0; pageIdx < numPages; pageIdx++) {
          const pageFrom = pageIdx * limit;
          const pageTo = pageFrom + limit - 1;

          const { data, error } = await supabase
            .from('driver_events')
            .select('platform_id, ocorrido_em')
            .eq('platform_id', 'sascar')
            .order('ocorrido_em', { ascending: false })
            .range(pageFrom, pageTo);
          
          console.log(`Page ${pageIdx} (${pageFrom} to ${pageTo}) returned: ${data?.length} rows. Error:`, error);
        }
      }
    } catch (e) {
      console.error('Catch error:', e);
    }
  });
});
