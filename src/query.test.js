import { describe, it } from 'vitest';
import { supabase } from './supabase.js';

describe('Inspect Real Database Classifications', () => {
  it('logs in and queries driver_events', async () => {
    try {
      const email = 'asraelz12123@gmail.com';
      const password = '481626481626Alfa..';

      console.log('Logging in...');
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authErr) {
        console.error('Login error:', authErr);
        return;
      }
      console.log('Login successful for user:', authData?.user?.id);

      const { data, error } = await supabase
        .from('driver_events')
        .select('platform_id, analise_ia_plataforma');
      
      console.log('--- DB DATA ---');
      console.log('Error:', error);
      if (data) {
        console.log('Total rows in DB:', data.length);
        const counts = {};
        for (const row of data) {
          const key = `${row.platform_id} : ${row.analise_ia_plataforma}`;
          counts[key] = (counts[key] || 0) + 1;
        }
        console.log('Counts:', counts);
      }
    } catch (e) {
      console.error('Catch error:', e);
    }
  });
});
