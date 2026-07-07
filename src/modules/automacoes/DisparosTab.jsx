import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { supabase } from '../../supabase.js';

// Sub-components import
import MetricsGrid from './MetricsGrid.jsx';
import DispatchesTable from './DispatchesTable.jsx';

export default function DisparosTab() {
  const { profile } = useAuth();
  
  // Dispatches state
  const [dispatches, setDispatches] = useState([]);
  const [loadingDispatches, setLoadingDispatches] = useState(false);
  
  const fetchDispatches = async () => {
    setLoadingDispatches(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_dispatches')
        .select('id, recipient_name, recipient_phone, template_name, category, estimated_cost, status, variables, error_message, meta_message_id, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
        
      if (error) throw error;
      setDispatches(data || []);
    } catch (err) {
      console.error('Erro ao buscar histórico de disparos:', err);
    } finally {
      setLoadingDispatches(false);
    }
  };

  useEffect(() => {
    fetchDispatches();
    
    const sub = supabase
      .channel('whatsapp_dispatches_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_dispatches' }, (payload) => {
        fetchDispatches();
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  return (
    <div className="text-[var(--text-primary)]" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="disparos-split-layout">
        {/* Left Side: Logs Table (75% width) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
          <DispatchesTable 
            dispatches={dispatches} 
            loadingDispatches={loadingDispatches} 
            fetchDispatches={fetchDispatches} 
          />
        </div>

        {/* Right Side: Metrics Sidebar (25% width) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
          <MetricsGrid dispatches={dispatches} />
        </div>
      </div>
    </div>
  );
}
