import { describe, it } from 'vitest';
import { supabase } from './supabase.js';

describe('Read Aliases', () => {
  it('reads all app_settings keys', async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value');
      
      console.log('--- ALL APP SETTINGS ---');
      console.log('Error:', error);
      console.log('Data:', data);
    } catch (e) {
      console.error('Catch error:', e);
    }
  });
});
