import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../lib/analyticsApi.js';
import { useApp } from '../../context.jsx';

// Sub-components
import AiChatSidebar from './ai-chat/AiChatSidebar.jsx';
import AiChatLanding from './ai-chat/AiChatLanding.jsx';
import AiMessageBubble from './ai-chat/AiMessageBubble.jsx';
import AiChatInput from './ai-chat/AiChatInput.jsx';
import AiReportsDrawer from './ai-chat/AiReportsDrawer.jsx';
import AiReportModal from './ai-chat/AiReportModal.jsx';
import RobotIcon from './ai-chat/RobotIcon.jsx';

// Styles
import '../../styles/ai-chat.css';

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  text: 'Olá! Sou o MedBot, seu Assistente IA MedNet. Tenho acesso administrativo completo para configurar a plataforma, gerenciar motoristas ou analisar e gerar relatórios executivos. Como posso ajudar você hoje?'
};

export default function AiChatTab() {
  const { theme, setTheme } = useApp();
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Reports / Artifacts
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  const messagesEndRef = useRef(null);

  // ── Fetch threads ──
  const fetchThreads = async (selectFirst = false) => {
    try {
      const res = await apiFetch('/api/ai/chat/threads');
      if (res.ok) {
        const data = await res.json();
        setThreads(data);
        if (selectFirst && data.length > 0) {
          handleSelectThread(data[0].id);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar tópicos:', err);
    }
  };

  // ── Select thread ──
  const handleSelectThread = async (threadId) => {
    setActiveThreadId(threadId);
    setLoadingHistory(true);
    try {
      const res = await apiFetch(`/api/ai/chat/history?thread_id=${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.length > 0 ? data : [WELCOME_MESSAGE]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // ── Fetch reports ──
  const fetchReports = async () => {
    setLoadingReports(true);
    try {
      const res = await apiFetch('/api/ai/reports');
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReports(false);
    }
  };

  // ── Init ──
  useEffect(() => {
    fetchThreads(true);
    fetchReports();
  }, []);

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── New chat ──
  const handleNewChat = () => {
    setActiveThreadId(null);
    setMessages([WELCOME_MESSAGE]);
  };

  // ── Send message ──
  const handleSend = async (e, directText = null) => {
    if (e) e.preventDefault();
    const textToSend = directText || input;
    if (!textToSend.trim() || loading) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: textToSend
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await apiFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.text,
          thread_id: activeThreadId
        })
      });

      if (!response.ok) {
        throw new Error('Falha na comunicação com o servidor de IA.');
      }

      const data = await response.json();

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: data.text,
        chart: data.chart
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Se uma nova thread foi criada, selecionar e atualizar lista
      if (!activeThreadId && data.thread_id) {
        setActiveThreadId(data.thread_id);
      }

      // Sempre atualizar a lista de threads para refletir título e ordenação
      fetchThreads();
      fetchReports();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `⚠️ Erro: ${err.message || 'Falha ao processar comando.'}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ── Delete thread ──
  const handleDeleteThread = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Deseja excluir esta conversa permanentemente?')) return;
    try {
      const res = await apiFetch(`/api/ai/chat/threads/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchThreads();
        if (activeThreadId === id) {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ── Save report manually ──
  const handleSaveReportManually = async (msg) => {
    const title = prompt('Digite o título para este relatório:', `Relatório MedBot - ${new Date().toLocaleDateString()}`);
    if (!title) return;

    try {
      const res = await apiFetch('/api/ai/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: msg.text,
          chart_payload: msg.chart
        })
      });
      if (res.ok) {
        alert('Relatório salvo na galeria lateral!');
        fetchReports();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ── Delete report ──
  const handleDeleteReport = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Excluir este relatório permanentemente?')) return;
    try {
      const res = await apiFetch(`/api/ai/reports/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchReports();
        if (selectedReport?.id === id) {
          setSelectedReport(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="ai-chat-layout">

      {/* 1. Sidebar Esquerda — Histórico de Threads */}
      <AiChatSidebar
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onDeleteThread={handleDeleteThread}
        onNewChat={handleNewChat}
      />

      {/* 2. Área Central do Chat + Gaveta de Relatórios */}
      <div className="ai-chat-center">

        {/* Chat Principal */}
        <div className="ai-chat-main">

          {/* Header */}
          <div className="ai-chat-header">
            <div className="ai-chat-header-left">
              <div className="ai-chat-avatar">
                <RobotIcon size={18} />
              </div>
              <div className="ai-chat-header-info">
                <span className="name">MedBot</span>
                <span className="sub">Assistente IA MedNet</span>
              </div>
            </div>

            <div className="ai-chat-header-actions">
              <button
                className={`btn-reports-toggle ${showArtifacts ? 'active' : ''}`}
                onClick={() => setShowArtifacts(!showArtifacts)}
              >
                <i className="ti ti-archive" style={{ fontSize: 14 }} />
                Relatórios Salvos
                {reports.length > 0 && (
                  <span className="count">{reports.length}</span>
                )}
              </button>
              <button
                className="ai-chat-theme-btn"
                title="Alternar tema"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              >
                <i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`} />
              </button>
            </div>
          </div>

          {/* Message List */}
          <div className="ai-message-list ai-custom-scroll">
            {loadingHistory ? (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 8, fontSize: 13 }}>
                <i className="ti ti-loader-2 fz-spin" style={{ fontSize: 18 }} /> Carregando conversa…
              </div>
            ) : messages.length <= 1 ? (
              <AiChatLanding
                welcomeText={WELCOME_MESSAGE.text}
                onSend={handleSend}
              />
            ) : (
              messages.map((m) => {
                if (m.id === 'welcome') return null;
                return (
                  <AiMessageBubble
                    key={m.id}
                    message={m}
                    onSaveReport={m.role === 'assistant' ? handleSaveReportManually : null}
                  />
                );
              })
            )}

            {/* Loading Bubble */}
            {loading && (
              <div className="ai-loading-row">
                <div className="ai-msg-avatar bot ai-loading-avatar">
                  <RobotIcon size={20} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '75%' }}>
                  <div className="ai-bubble-assistant ai-loading-dots">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <AiChatInput
            input={input}
            setInput={setInput}
            loading={loading}
            loadingHistory={loadingHistory}
            onSubmit={handleSend}
          />
        </div>

        {/* 3. Gaveta Lateral Direita — Relatórios */}
        <AiReportsDrawer
          show={showArtifacts}
          reports={reports}
          loadingReports={loadingReports}
          onClose={() => setShowArtifacts(false)}
          onSelectReport={setSelectedReport}
          onDeleteReport={handleDeleteReport}
        />
      </div>

      {/* Modal de Detalhe do Relatório */}
      <AiReportModal
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
}
