import React, { useState, useEffect } from 'react';
import { useAutomations } from '../hooks/useAutomations';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../hooks/useToast.jsx';
import '../styles/automacoes.css';
import { HooksTab, VncModal } from './automacoes/HooksTab.jsx';
import DisparosTab from './automacoes/DisparosTab.jsx';
import ChatTab from './automacoes/ChatTab.jsx';

export default function Automacoes() {
  const [tab, setTab] = useState('hooks');
  const { automations, logs, loading, vpsHealth, vncUrl, add, update, remove, run, stopRunningTasks, stopAutomationTasks } = useAutomations();
  const confirm = useConfirm();
  const [showVnc, setShowVnc] = useState(false);
  const [initialChatParams, setInitialChatParams] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phone = params.get('phone');
    const name = params.get('name');
    if (phone || name) {
      setInitialChatParams({ phone, name });
      setTab('chat');
    }
  }, []);

  const handleToggle = async (id, patch) => {
    const message = patch.active ? 'Automação ativada' : 'Automação desativada';
    const success = await update(id, patch, { toastMessage: message });
    if (success && !patch.active) {
      await stopAutomationTasks(id);
    }
  };

  const handleSave = async (id, data) => {
    if (id) {
      await update(id, data);
    } else {
      await add(data);
    }
  };

  const handleDelete = async (id) => {
    const auto = automations.find(a => a.id === id);
    if (!auto) return;

    if (await confirm({ 
      title: 'Excluir automação', 
      message: `Tem certeza que deseja excluir a automação "${auto.name}"? Esta ação não pode ser desfeita.`, 
      danger: true 
    })) {
      await remove(id);
    }
  };

  if (loading) {
    return (
      <div className="empty-state" style={{ padding: '70px 20px' }}>
        <i className="ti ti-loader-2" style={{ fontSize: 32, animation: 'spin 1s linear infinite', display: 'block', marginBottom: 12, color: 'var(--accent-50)' }}></i>
        Carregando automações...
      </div>
    );
  }

  return (
    <div className="auto-page">
      <nav className="tabs" aria-label="Abas de Automações">
        <div 
          className={`tab ${tab === 'hooks' ? 'active' : ''}`} 
          onClick={() => setTab('hooks')} 
          role="button" 
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setTab('hooks');
            }
          }}
          style={{ cursor: 'pointer' }}
          aria-selected={tab === 'hooks'}
        >
          <i className="ti ti-webhook"></i> Integrações & Webhooks
        </div>

        <div 
          className={`tab ${tab === 'disparos' ? 'active' : ''}`} 
          onClick={() => setTab('disparos')} 
          role="button" 
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setTab('disparos');
            }
          }}
          style={{ cursor: 'pointer' }}
          aria-selected={tab === 'disparos'}
        >
          <i className="ti ti-brand-whatsapp"></i> Disparos
        </div>
        <div 
          className={`tab ${tab === 'chat' ? 'active' : ''}`} 
          onClick={() => setTab('chat')} 
          role="button" 
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setTab('chat');
            }
          }}
          style={{ cursor: 'pointer' }}
          aria-selected={tab === 'chat'}
        >
          <i className="ti ti-message-circle"></i> Chat WhatsApp
        </div>
      </nav>
      
      {tab === 'hooks' ? (
        <HooksTab 
          automations={automations} 
          logs={logs} 
          vpsHealth={vpsHealth} 
          vncUrl={vncUrl}
          onOpenVnc={() => setShowVnc(true)}
          onRun={run} 
          onToggle={handleToggle} 
          onSave={handleSave} 
          onDelete={handleDelete} 
        />
      ) : tab === 'chat' ? (
        <ChatTab initialParams={initialChatParams} clearInitialParams={() => setInitialChatParams(null)} />
      ) : (
        <DisparosTab />
      )}
      
      {showVnc && vncUrl && (
        <VncModal 
          vncUrl={vncUrl} 
          onStopBot={async () => {
            const confirmed = await confirm({
              title: 'Encerrar Robô',
              message: 'Deseja realmente forçar o encerramento do robô na VPS? O navegador será fechado e os recursos da máquina serão liberados.',
              danger: true
            });
            if (confirmed) {
              await stopRunningTasks();
              setShowVnc(false);
            }
          }}
          onClose={() => setShowVnc(false)} 
        />
      )}
    </div>
  );
}
