import React from 'react';
import { AnimatedNumber } from '../../components/AnimatedNumber';

export default function MetricsGrid({ dispatches = [] }) {
  // Today metrics
  const todayDispatches = dispatches.filter(d => {
    const dDate = new Date(d.created_at);
    const today = new Date();
    return dDate.toDateString() === today.toDateString();
  });
  
  const totalToday = todayDispatches.length;
  const failedToday = todayDispatches.filter(d => d.status === 'failed').length;
  
  const successfulToday = todayDispatches.filter(d => d.status !== 'failed');
  const readToday = successfulToday.filter(d => d.status === 'read').length;
  const readRateToday = successfulToday.length > 0 
    ? Math.round((readToday / successfulToday.length) * 100)
    : 0;
    
  const costToday = todayDispatches.reduce((acc, d) => acc + Number(d.estimated_cost || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* Card 1: Enviados Hoje */}
      <div className="card group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px' }}>
        <div 
          style={{ 
            width: '40px', height: '40px', borderRadius: 'var(--radius-md)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontSize: '18px', flexShrink: 0,
            backgroundColor: 'var(--info-bg)', color: 'var(--info-500)' 
          }}
        >
          <i className="ti ti-send"></i>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--text-muted)', letterSpacing: '0.8px', display: 'block' }}>Enviados Hoje</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
            <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1 }}><AnimatedNumber value={totalToday} /></span>
          </div>
        </div>
      </div>

      {/* Card 2: Taxa de Leitura */}
      <div className="card group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px' }}>
        <div 
          style={{ 
            width: '40px', height: '40px', borderRadius: 'var(--radius-md)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontSize: '18px', flexShrink: 0,
            backgroundColor: 'var(--success-bg)', color: 'var(--success-600)' 
          }}
        >
          <i className="ti ti-mail-opened"></i>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--text-muted)', letterSpacing: '0.8px', display: 'block' }}>Taxa de Leitura</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
            <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1 }}><AnimatedNumber value={readRateToday} />%</span>
          </div>
        </div>
      </div>

      {/* Card 3: Falhas do Dia */}
      <div className="card group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px' }}>
        <div 
          style={{ 
            width: '40px', height: '40px', borderRadius: 'var(--radius-md)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontSize: '18px', flexShrink: 0,
            backgroundColor: 'var(--danger-bg)', color: 'var(--danger-600)' 
          }}
        >
          <i className="ti ti-alert-triangle"></i>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--text-muted)', letterSpacing: '0.8px', display: 'block' }}>Falhas do Dia</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
            <span style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1 }}><AnimatedNumber value={failedToday} /></span>
          </div>
        </div>
      </div>

      {/* Card 4: Custos Estimados */}
      <div className="card group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px' }}>
        <div 
          style={{ 
            width: '40px', height: '40px', borderRadius: 'var(--radius-md)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            fontSize: '18px', flexShrink: 0,
            backgroundColor: 'var(--warning-bg)', color: 'var(--warning-600)' 
          }}
        >
          <i className="ti ti-coin"></i>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--text-muted)', letterSpacing: '0.8px', display: 'block' }}>Custos (Hoje)</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
            <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1 }}>R$ <AnimatedNumber value={costToday} decimals={2} /></span>
          </div>
        </div>
      </div>

      {/* Tabela de Tarifas WhatsApp */}
      <div className="card mt-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)] pb-2 flex items-center gap-1.5">
          <i className="ti ti-info-circle text-xs" style={{ color: 'var(--accent-500)' }}></i> Tarifas Meta Brasil (DDI +55)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px', fontSize: '11px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--info-500)' }}></span> Marketing</span>
            <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>R$ 0,33</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success-500)' }}></span> Utilidade</span>
            <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>R$ 0,18</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-500)' }}></span> Autenticação</span>
            <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>R$ 0,15</span>
          </div>
        </div>
      </div>
    </div>
  );
}
