import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../lib/analyticsApi.js';
import { useApp } from '../../context.jsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie
} from 'recharts';

function RobotIcon({ size = 20, style }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      width={size} 
      height={size} 
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      <rect x="46" y="10" width="8" height="15" rx="4" fill="#F26931" />
      <rect x="0" y="45" width="10" height="30" rx="5" fill="#F26931" />
      <rect x="90" y="45" width="10" height="30" rx="5" fill="#F26931" />
      <rect x="15" y="25" width="70" height="60" rx="15" fill="#F26931" />
      <circle cx="35" cy="50" r="8" fill="#FFFFFF" />
      <circle cx="65" cy="50" r="8" fill="#FFFFFF" />
      <rect x="30" y="70" width="10" height="5" rx="1" fill="#FFFFFF" />
      <rect x="45" y="70" width="10" height="5" rx="1" fill="#FFFFFF" />
      <rect x="60" y="70" width="10" height="5" rx="1" fill="#FFFFFF" />
    </svg>
  );
}

// Converte markdown simples em HTML, incluindo tabelas
function renderMarkdown(md) {
  if (!md) return '';
  
  // Escapar HTML básico
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Quebrar em linhas e processar tabelas
  const lines = html.split('\n');
  let inTable = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Processar Tabelas Markdown
    if (line.startsWith('|') && line.endsWith('|')) {
      // Se for a linha separadora (ex: |---|---|)
      if (line.match(/^\|[\s-|-]*\|$/)) {
        lines[i] = ''; // Remove a linha separadora
        continue;
      }
      
      const cols = line.split('|').slice(1, -1).map(c => c.trim());
      let rowHtml = '';
      
      if (!inTable) {
        inTable = true;
        rowHtml += '<table class="markdown-table"><thead><tr>';
        cols.forEach(c => rowHtml += `<th>${c}</th>`);
        rowHtml += '</tr></thead><tbody>';
      } else {
        rowHtml += '<tr>';
        cols.forEach(c => rowHtml += `<td>${c}</td>`);
        rowHtml += '</tr>';
      }
      lines[i] = rowHtml;
    } else {
      if (inTable) {
        inTable = false;
        lines[i] = '</tbody></table>' + lines[i];
      }
    }
  }
  
  html = lines.join('\n');

  // Headers
  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Negrito e Itálico
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>');

  // Listas não-ordenadas
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, m => '<ul>' + m + '</ul>');

  // Listas ordenadas
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, m => '<ol>' + m + '</ol>');

  // Parágrafos e quebras de linha
  html = html
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return '<div class="markdown-body">' + html + '</div>';
}

export default function AiChatTab() {
  const { theme } = useApp();
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Galeria de Artefatos / Relatórios
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  const messagesEndRef = useRef(null);

  const WELCOME_MESSAGE = {
    id: 'welcome',
    role: 'assistant',
    text: 'Olá! Sou o MedBot, seu Assistente IA MedNet. Tenho acesso administrativo completo para configurar a plataforma, gerenciar motoristas ou analisar e gerar relatórios executivos. Como posso ajudar você hoje?'
  };

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

  useEffect(() => {
    fetchThreads(true);
    fetchReports();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewChat = async () => {
    setActiveThreadId(null);
    setMessages([WELCOME_MESSAGE]);
  };

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
      
      if (!activeThreadId && data.thread_id) {
        setActiveThreadId(data.thread_id);
        fetchThreads();
      } else {
        fetchThreads();
      }
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
    <div className="ai-chat-layout" style={{
      height: 'calc(100vh - 150px)',
      minHeight: 520,
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)'
    }}>
      {/* Estilos customizados locais */}
      <style>{`
        .ai-chat-layout {
          display: flex;
          width: 100%;
          background: var(--surface-0);
          overflow: hidden;
        }
        .ai-sidebar {
          width: 250px;
          background: var(--surface-1);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          padding: 16px 12px;
          flex-shrink: 0;
        }
        .ai-thread-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 12px;
          cursor: pointer;
          font-size: 12.5px;
          color: var(--text-secondary);
          font-weight: 500;
          transition: all 0.15s ease;
          border-left: 3px solid transparent;
        }
        .ai-thread-item:hover {
          background: var(--surface-2);
          color: var(--text-primary);
        }
        .ai-thread-item.active {
          background: rgba(158, 26, 69, 0.06);
          color: var(--accent-600);
          font-weight: 600;
          border-left: 3px solid var(--accent-500);
        }
        .btn-new-chat {
          width: 100%;
          margin-bottom: 20px;
          border-radius: 24px;
          border: 1px solid var(--border);
          background: var(--surface-0);
          color: var(--text-primary);
          font-size: 13.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          height: 40px;
          box-shadow: var(--shadow-sm);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-new-chat:hover {
          background: var(--surface-2);
          border-color: var(--border-md);
          transform: translateY(-1px);
          box-shadow: var(--shadow-md);
        }
        
        .ai-message-list {
          flex: 1;
          overflow-y: auto;
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          background: var(--surface-0);
        }
        
        /* Landing page empty state */
        .ai-landing {
          display: flex;
          flex: 1;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          max-width: 720px;
          margin: 0 auto;
          padding: 40px 20px;
          text-align: center;
        }
        .ai-landing-logo {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(242, 105, 49, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          border: 1px solid rgba(242, 105, 49, 0.15);
          animation: pulse-glow 3s infinite ease-in-out;
        }
        .ai-landing-title {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 12px;
          background: linear-gradient(135deg, var(--text-primary), var(--accent-500));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .ai-landing-subtitle {
          font-size: 12.5px;
          color: var(--text-muted);
          max-width: 460px;
          line-height: 1.6;
          margin-bottom: 32px;
        }
        
        /* Quick Prompts Grid */
        .ai-prompts-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          width: 100%;
          max-width: 640px;
        }
        .ai-prompt-card {
          background: var(--surface-1);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 16px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ai-prompt-card:hover {
          background: var(--surface-2);
          border-color: var(--border-md);
          transform: translateY(-2px);
          box-shadow: var(--shadow-sm);
        }
        .ai-prompt-card i {
          font-size: 16px;
          color: #F26931;
          margin-bottom: 8px;
          display: block;
        }
        .ai-prompt-card h5 {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 4px 0;
        }
        .ai-prompt-card p {
          font-size: 11px;
          color: var(--text-muted);
          margin: 0;
          line-height: 1.4;
        }
        
        /* Messages */
        .ai-bubble-user {
          padding: 12px 18px;
          border-radius: 18px 18px 4px 18px;
          font-size: 13px;
          line-height: 1.55;
          background: linear-gradient(135deg, var(--accent-600, #9E1A45), var(--accent-500, #C22A5C));
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(158, 26, 69, 0.12);
        }
        .ai-bubble-assistant {
          padding: 12px 18px;
          border-radius: 4px 18px 18px 18px;
          font-size: 13px;
          line-height: 1.6;
          background: var(--surface-1);
          color: var(--text-primary);
          border: 1px solid var(--border);
          box-shadow: var(--shadow-xs);
        }
        
        /* Input area */
        .ai-input-wrapper {
          padding: 20px 32px 24px;
          background: var(--surface-0);
          display: flex;
          justify-content: center;
          align-items: center;
          border-top: 1px solid var(--border);
        }
        .ai-input-capsule {
          width: 100%;
          max-width: 700px;
          background: var(--surface-1);
          border: 1px solid var(--border);
          border-radius: 28px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
          padding: 5px 6px 5px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.2s ease;
        }
        .ai-input-capsule:focus-within {
          border-color: var(--border-md);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.05);
          background: var(--surface-0);
        }
        .ai-input-field {
          flex: 1;
          border: none;
          background: transparent;
          color: var(--text-primary);
          font-size: 13px;
          height: 36px;
          outline: none;
        }
        .ai-input-field::placeholder {
          color: var(--text-muted);
        }
        .ai-send-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: var(--accent-500);
          color: #fff;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .ai-send-btn:hover:not(:disabled) {
          background: var(--accent-600);
          transform: scale(1.05);
        }
        .ai-send-btn:disabled {
          background: var(--surface-3);
          color: var(--text-muted);
          cursor: not-allowed;
        }
        
        /* Tables and Markdown formatting */
        .markdown-body h1, .markdown-body h2, .markdown-body h3 {
          margin-top: 14px;
          margin-bottom: 8px;
          color: var(--text-primary);
          font-weight: 600;
        }
        .markdown-body h1 { font-size: 15px; }
        .markdown-body h2 { font-size: 14px; }
        .markdown-body h3 { font-size: 13px; }
        .markdown-body p {
          margin: 0 0 10px 0;
        }
        .markdown-body ul, .markdown-body ol {
          margin: 0 0 10px 0;
          padding-left: 20px;
        }
        .markdown-body li {
          margin-bottom: 4px;
        }
        .markdown-table {
          width: 100%;
          border-collapse: collapse;
          margin: 14px 0;
          font-size: 12px;
          background: var(--surface-0);
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid var(--border);
        }
        .markdown-table th, .markdown-table td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid var(--border-light, rgba(255,255,255,0.02));
        }
        .markdown-table th {
          background: var(--surface-2);
          font-weight: 600;
          color: var(--text-primary);
        }
        .markdown-table tr:last-child td {
          border-bottom: none;
        }
        .markdown-table tr:hover td {
          background: var(--surface-1);
        }
        
        /* Animations */
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(242, 105, 49, 0.15);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 16px 6px rgba(242, 105, 49, 0.25);
            transform: scale(1.04);
          }
        }
        
        /* Scrollbar override */
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--surface-3);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--text-muted);
        }
      `}</style>

      {/* 1. Sidebar Esquerda - Histórico */}
      <div className="ai-sidebar">
        <button className="btn-new-chat" onClick={handleNewChat}>
          <i className="ti ti-plus" style={{ fontSize: 14 }}></i> Nova conversa
        </button>

        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, paddingLeft: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Conversas recentes
        </div>

        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {threads.length === 0 ? (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 10px', fontStyle: 'italic' }}>
              Nenhuma conversa iniciada.
            </div>
          ) : (
            threads.map(t => (
              <div
                key={t.id}
                onClick={() => handleSelectThread(t.id)}
                className={`ai-thread-item ${activeThreadId === t.id ? 'active' : ''}`}
              >
                <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="ti ti-message" style={{ fontSize: 14, opacity: 0.7 }}></i>
                  {t.title}
                </div>
                <button
                  onClick={(e) => handleDeleteThread(t.id, e)}
                  style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                  title="Excluir chat"
                  className="btn-trash-thread"
                >
                  <i className="ti ti-trash" style={{ fontSize: 12 }}></i>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. Área Central do Chat + Gaveta de Relatórios */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', overflow: 'hidden', background: 'var(--surface-0)' }}>
        
        {/* Chat Principal */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          
          {/* Header da Conversa */}
          <div style={{
            height: 64,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-0)',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(242, 105, 49, 0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(242, 105, 49, 0.15)', flexShrink: 0,
                overflow: 'hidden'
              }}>
                <RobotIcon size={18} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>MedBot</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>Assistente IA MedNet</span>
              </div>
            </div>
            
            {/* Controles de Ação no Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className={`btn btn-sm ${showArtifacts ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setShowArtifacts(!showArtifacts)}
                style={{
                  borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  border: showArtifacts ? 'none' : '1px solid var(--border)'
                }}
              >
                <i className="ti ti-archive" style={{ fontSize: 14 }}></i>
                Relatórios Salvos
                {reports.length > 0 && <span style={{
                  background: 'var(--accent-500)', color: '#fff', fontSize: 9.5,
                  padding: '1px 5px', borderRadius: 999, fontWeight: 700, marginLeft: 2
                }}>{reports.length}</span>}
              </button>
            </div>
          </div>

          {/* Fluxo de Mensagens */}
          <div className="ai-message-list custom-scrollbar">
            {loadingHistory ? (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 8, fontSize: 13 }}>
                <i className="ti ti-loader-2 fz-spin" style={{ fontSize: 18 }}></i> Carregando conversa…
              </div>
            ) : messages.length <= 1 ? (
              /* Landing Page estilo Gemini */
              <div className="ai-landing">
                <div className="ai-landing-logo">
                  <RobotIcon size={32} />
                </div>
                <h2 className="ai-landing-title">Como posso ajudar hoje?</h2>
                <p className="ai-landing-subtitle">
                  {WELCOME_MESSAGE.text}
                </p>
                
                <div className="ai-prompts-grid">
                  <div className="ai-prompt-card" onClick={() => handleSend(null, "Quais são os 5 motoristas com mais alertas de fadiga nas últimas semanas? Gere uma análise rápida.")}>
                    <i className="ti ti-chart-bar"></i>
                    <h5>Análise de Reincidência</h5>
                    <p>Veja quais motoristas apresentam maior criticidade de fadiga no histórico.</p>
                  </div>
                  <div className="ai-prompt-card" onClick={() => handleSend(null, "Pode gerar um relatório executivo de fadiga para o último mês? Escolha uma das transportadoras ativas.")}>
                    <i className="ti ti-report-analytics"></i>
                    <h5>Relatório de Transportadora</h5>
                    <p>Gere um resumo executivo em linguagem natural para reuniões operacionais.</p>
                  </div>
                  <div className="ai-prompt-card" onClick={() => handleSend(null, "Quais são as principais regras e criticidades configuradas no monitoramento da Sascar e Maxtrack?")}>
                    <i className="ti ti-shield-check"></i>
                    <h5>Regras de Monitoramento</h5>
                    <p>Consulte criticidades e parâmetros técnicos dos alertas de telemetria.</p>
                  </div>
                  <div className="ai-prompt-card" onClick={() => handleSend(null, "Onde posso configurar as chaves da API de IA ou realizar a limpeza de histórico no sistema?")}>
                    <i className="ti ti-settings"></i>
                    <h5>Configurações do Sistema</h5>
                    <p>Saiba como acessar chaves de API ou ferramentas de manutenção do admin.</p>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((m) => {
                if (m.id === 'welcome') return null; // Oculta o welcome bubble tradicional para manter a tela limpa
                return (
                  <div key={m.id} style={{
                    display: 'flex',
                    gap: 12,
                    width: '100%',
                    flexDirection: m.role === 'user' ? 'row-reverse' : 'row'
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: m.role === 'assistant' ? 'rgba(242, 105, 49, 0.08)' : 'var(--accent-500)',
                      border: m.role === 'assistant' ? '1px solid rgba(242, 105, 49, 0.15)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      overflow: 'hidden'
                    }}>
                      {m.role === 'assistant' ? <RobotIcon size={20} /> : <i className="ti ti-user" style={{ color: '#fff', fontSize: 14 }}></i>}
                    </div>

                    {/* Conteúdo do Balão */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '75%'
                    }}>
                      <div className={m.role === 'user' ? 'ai-bubble-user' : 'ai-bubble-assistant'}>
                        {m.role === 'user' ? (
                          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.text}</p>
                        ) : (
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
                        )}
                      </div>

                      {/* Gráfico Recharts Inline */}
                      {m.chart && (
                        <div className="ai-chart-container" style={{
                          background: 'var(--surface-1)',
                          border: '1px solid var(--border)',
                          borderRadius: 16,
                          padding: '16px 20px',
                          marginTop: 12,
                          width: 360,
                          boxShadow: 'var(--shadow-sm)'
                        }}>
                          <h4 className="chart-title" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>{m.chart.title}</h4>
                          {m.chart.subtitle && <p className="chart-sub" style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: 0 }}>{m.chart.subtitle}</p>}
                          <div style={{ width: '100%', height: 180, marginTop: 10 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              {m.chart.chartType === 'bar' && (
                                <BarChart data={m.chart.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                  <XAxis dataKey={m.chart.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={9.5} />
                                  <YAxis stroke="var(--text-muted)" fontSize={9.5} />
                                  <Tooltip contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 10.5 }} />
                                  <Bar dataKey={m.chart.yAxisKey || 'value'} radius={[3, 3, 0, 0]}>
                                    {m.chart.data.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color || 'var(--accent-500)'} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              )}
                              {m.chart.chartType === 'line' && (
                                <LineChart data={m.chart.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                  <XAxis dataKey={m.chart.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={9.5} />
                                  <YAxis stroke="var(--text-muted)" fontSize={9.5} />
                                  <Tooltip contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 10.5 }} />
                                  <Line type="monotone" dataKey={m.chart.yAxisKey || 'value'} stroke="var(--accent-500)" strokeWidth={2} />
                                </LineChart>
                              )}
                              {m.chart.chartType === 'pie' && (
                                <PieChart>
                                  <Pie
                                    data={m.chart.data}
                                    dataKey={m.chart.yAxisKey || 'value'}
                                    nameKey={m.chart.xAxisKey || 'name'}
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={50}
                                    fill="var(--accent-500)"
                                    label={{ fontSize: 8.5 }}
                                  >
                                    {m.chart.data.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color || `hsl(var(--accent-h), var(--accent-s), ${40 + index * 12}%)`} />
                                    ))}
                                  </Pie>
                                  <Tooltip contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 10 }} />
                                </PieChart>
                              )}
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* Ações do Relatório */}
                      {m.role === 'assistant' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, paddingLeft: 4 }}>
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => handleSaveReportManually(m)}
                            style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 4, opacity: 0.7 }}
                          >
                            <i className="ti ti-device-floppy"></i> Salvar na Galeria
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Balão de Carregamento */}
            {loading && (
              <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                <div style={{ animation: 'pulse-glow 2s infinite ease-in-out', width: 36, height: 36, borderRadius: '50%', background: 'rgba(242, 105, 49, 0.08)', border: '1px solid rgba(242, 105, 49, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <RobotIcon size={20} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '75%' }}>
                  <div className="ai-bubble-assistant loading-bubble" style={{ display: 'flex', gap: 4, alignItems: 'center', height: 40, width: 64, justifyContent: 'center' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out both' }}></span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}></span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}></span>
                  </div>
                  <style>{`
                    @keyframes bounce {
                      0%, 80%, 100% { transform: scale(0); }
                      40% { transform: scale(1.0); }
                    }
                  `}</style>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Caixa de Entrada de Chat Flutuante e Centrada */}
          <div className="ai-input-wrapper">
            <form onSubmit={handleSend} className="ai-input-capsule">
              {/* Ícone meramente decorativo à esquerda estilo Claude */}
              <i className="ti ti-sparkles" style={{ color: 'var(--text-muted)', opacity: 0.5, fontSize: 16 }}></i>
              <input
                type="text"
                className="ai-input-field"
                placeholder="Pergunte ao MedBot, solicite relatórios ou configurações..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading || loadingHistory}
              />
              <button
                type="submit"
                className="ai-send-btn"
                disabled={loading || loadingHistory || !input.trim()}
              >
                <i className="ti ti-send" style={{ fontSize: 13 }}></i>
              </button>
            </form>
          </div>
        </div>

        {/* 3. Gaveta Lateral Direita - Relatórios / Artefatos */}
        <div
          className="ai-reports-drawer"
          style={{
            transform: showArtifacts ? 'translateX(0)' : 'translateX(100%)',
            position: 'absolute'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-0)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-archive" style={{ color: 'var(--accent-500)' }}></i>
              Relatórios Salvos
            </div>
            <button className="btn btn-icon-only btn-ghost btn-xs" onClick={() => setShowArtifacts(false)}>
              <i className="ti ti-x"></i>
            </button>
          </div>

          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingReports ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
                <i className="ti ti-loader-2 fz-spin"></i> Carregando...
              </div>
            ) : reports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
                <i className="ti ti-info-circle" style={{ fontSize: 18, marginBottom: 6, display: 'block' }}></i>
                Nenhum relatório salvo nesta galeria.
              </div>
            ) : (
              reports.map((rep) => (
                <div
                  key={rep.id}
                  onClick={() => setSelectedReport(rep)}
                  style={{
                    padding: 12,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-0)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  className="report-item-hover"
                >
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rep.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
                    <span>{new Date(rep.created_at).toLocaleDateString()}</span>
                    <button
                      className="btn btn-icon-only btn-ghost btn-xs"
                      onClick={(e) => handleDeleteReport(rep.id, e)}
                      title="Excluir relatório"
                      style={{ padding: 2, height: 'auto', width: 'auto' }}
                    >
                      <i className="ti ti-trash" style={{ color: 'var(--danger-500)' }}></i>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal de Detalhe do Relatório */}
      {selectedReport && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.4)', zIndex: 10000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 20,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, background: 'var(--surface-0)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
              <div className="card-title" style={{ fontSize: 13.5, fontWeight: 600 }}>
                <i className="ti ti-file-text" style={{ color: 'var(--accent-500)', marginRight: 6 }}></i>
                {selectedReport.title}
              </div>
              <button className="btn btn-icon-only btn-ghost" onClick={() => setSelectedReport(null)}>
                <i className="ti ti-x"></i>
              </button>
            </div>
            
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              <div
                className="ws-content"
                style={{ fontSize: 13.5, lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedReport.content) }}
              />

              {selectedReport.chart_payload && (
                <div className="card" style={{ marginTop: 20, padding: 18, background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>{selectedReport.chart_payload.title}</h4>
                  {selectedReport.chart_payload.subtitle && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{selectedReport.chart_payload.subtitle}</p>}
                  <div style={{ width: '100%', height: 220, marginTop: 12 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      {selectedReport.chart_payload.chartType === 'bar' && (
                        <BarChart data={selectedReport.chart_payload.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <XAxis dataKey={selectedReport.chart_payload.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={10} />
                          <YAxis stroke="var(--text-muted)" fontSize={10} />
                          <Tooltip contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                          <Bar dataKey={selectedReport.chart_payload.yAxisKey || 'value'} radius={[3, 3, 0, 0]}>
                            {selectedReport.chart_payload.data.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color || 'var(--accent-500)'} />
                            ))}
                          </Bar>
                        </BarChart>
                      )}
                      {selectedReport.chart_payload.chartType === 'line' && (
                        <LineChart data={selectedReport.chart_payload.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <XAxis dataKey={selectedReport.chart_payload.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={10} />
                          <YAxis stroke="var(--text-muted)" fontSize={10} />
                          <Tooltip contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                          <Line type="monotone" dataKey={selectedReport.chart_payload.yAxisKey || 'value'} stroke="var(--accent-500)" strokeWidth={2} />
                        </LineChart>
                      )}
                      {selectedReport.chart_payload.chartType === 'pie' && (
                        <PieChart>
                          <Pie
                            data={selectedReport.chart_payload.data}
                            dataKey={selectedReport.chart_payload.yAxisKey || 'value'}
                            nameKey={selectedReport.chart_payload.xAxisKey || 'name'}
                            cx="50%"
                            cy="50%"
                            outerRadius={65}
                            fill="var(--accent-500)"
                            label={{ fontSize: 9 }}
                          >
                            {selectedReport.chart_payload.data.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color || `hsl(var(--accent-h), var(--accent-s), ${40 + index * 12}%)`} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 10 }} />
                        </PieChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--surface-1)' }}>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  navigator.clipboard.writeText(selectedReport.content);
                  alert('Texto do relatório copiado!');
                }}
              >
                <i className="ti ti-copy"></i> Copiar Texto
              </button>
              <button className="btn btn-primary" onClick={() => setSelectedReport(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
