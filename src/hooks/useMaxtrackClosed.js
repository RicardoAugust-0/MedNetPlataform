import { useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';

export function useMaxtrackClosed() {
  const { session } = useAuth();
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);

  const buscar = useCallback(async () => {
    if (!session?.access_token) {
      setError('Sessão não autenticada.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pull-maxtrack-closed`;
      const res = await window.fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setEvents(data.events || []);
      setFetchedAt(new Date().toISOString());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  return { events, loading, error, fetchedAt, buscar };
}
