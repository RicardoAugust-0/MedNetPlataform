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

function RobotIcon() {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: 'block', width: '80%', height: '80%' }}>
      <rect x="46" y="10" width="8" height="15" rx="4" fill="#FF5E00" />
      <rect x="0" y="45" width="10" height="30" rx="5" fill="#FF5E00" />
      <rect x="90" y="45" width="10" height="30" rx="5" fill="#FF5E00" />
      <rect x="15" y="25" width="70" height="60" rx="15" fill="#FF5E00" />
      <circle cx="35" cy="50" r="8" fill="#FFFFFF" />
      <circle cx="65" cy="50" r="8" fill="#FFFFFF" />
      <rect x="30" y="70" width="10" height="5" rx="1" fill="#FFFFFF" />
      <rect x="45" y="70" width="10" height="5" rx="1" fill="#FFFFFF" />
      <rect x="60" y="70" width="10" height="5" rx="1" fill="#FFFFFF" />
    </svg>
  );
}

// Converte markdown simples em HTML
function renderMarkdown(md) {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/^- (.+)$/gm,  '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  html = html.replace(/(<li>.*?<\/li>(?:<br>)?)+/gs, m => '<ul>' + m.replace(/<br>/g, '') + '</ul>');
  return '<p>' + html + '</p>';
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
  const [showArtifacts, setShowArtifacts] = useState(false); // Toggle lateral direito (estilo Claude/Gemini)
  const [selectedReport, setSelectedReport] = useState(null);

  const messagesEndRef = useRef(null);

  const WELCOME_MESSAGE = {
    id: 'welcome',
    role: 'assistant',
    text: 'Olá! Sou o MedBot, seu Assistente IA. Tenho acesso administrativo completo para monitorar frotas, ajustar regras de descarte e gerar relatórios. Como posso te ajudar hoje?'
  };

  // Carrega tópicos (threads)
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

  // Carrega mensagens de um tópico
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

  // Carrega relatórios salvos
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

  // Cria nova conversa
  const handleNewChat = async () => {
    setActiveThreadId(null);
    setMessages([WELCOME_MESSAGE]);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: input
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
      
      // Se era uma nova thread, atualiza a lista de threads e seleciona a ativa
      if (!activeThreadId && data.thread_id) {
        setActiveThreadId(data.thread_id);
        fetchThreads();
      } else {
        // Atualiza a ordenação das threads
        fetchThreads();
      }

      // Atualiza galeria de relatórios caso a IA tenha salvado algum
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

  // Deleta um tópico de conversa
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
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, height: 'calc(100vh - 180px)', minHeight: 520 }}>
      {/* 1. Sidebar Esquerda - Histórico de Chats (Estilo Gemini) */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 12, background: 'var(--surface-2)', borderRight: '1px solid var(--border)' }}>
        <button
          className="btn btn-primary"
          onClick={handleNewChat}
          style={{ width: '100%', marginBottom: 14, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, height: 38 }}
        >
          <i className="ti ti-plus" style={{ fontSize: 14 }}></i> Nova conversa
        </button>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, paddingLeft: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Conversas Recentes
        </div>

        {/* Lista de Threads */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {threads.length === 0 ? (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 10px', fontStyle: 'italic' }}>
              Sem histórico recente.
            </div>
          ) : (
            threads.map(t => (
              <div
                key={t.id}
                onClick={() => handleSelectThread(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 12.5,
                  background: activeThreadId === t.id ? 'var(--surface-1)' : 'transparent',
                  color: activeThreadId === t.id ? '#9E1A45' : 'var(--text-primary)',
                  fontWeight: activeThreadId === t.id ? 600 : 500,
                  border: activeThreadId === t.id ? '1px solid var(--border)' : '1px solid transparent',
                  transition: 'background-color 0.15s'
                }}
                className="thread-item-hover"
              >
                <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: 8 }}>
                  <i className="ti ti-message-2" style={{ marginRight: 6, opacity: 0.7 }}></i>
                  {t.title}
                </div>
                <button
                  onClick={(e) => handleDeleteThread(t.id, e)}
                  style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)' }}
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

      {/* 2. Área Central do Chat + Galeria Lateral (Layout de Duas Colunas Expansível) */}
      <div style={{ position: 'relative', display: 'flex', gap: 16, height: '100%', overflow: 'hidden' }}>
        
        {/* Chat Principal */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <RobotIcon />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>MedBot</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>Assistente IA MedNet</span>
              </div>
            </div>
            {/* Botão de abrir Galeria de Relatórios/Artefatos (Estilo Gemini/Claude) */}
            <button
              className={`btn btn-sm ${showArtifacts ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowArtifacts(!showArtifacts)}
              style={{ borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}
              title="Ver Relatórios e Artefatos Salvos"
            >
              <i className="ti ti-archive" style={{ fontSize: 14 }}></i>
              {showArtifacts ? 'Ocultar Relatórios' : 'Ver Relatórios'}
              {reports.length > 0 && <span className="badge badge-danger" style={{ marginLeft: 2, fontSize: 10 }}>{reports.length}</span>}
            </button>
          </div>

          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--surface-1)' }}>
            {loadingHistory ? (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 8 }}>
                <i className="ti ti-loader-2 fz-spin" style={{ fontSize: 20 }}></i> Carregando histórico da conversa…
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`ai-message-wrapper ${m.role}`} style={{ maxWidth: '80%', display: 'flex', gap: 12 }}>
                  <div className="ai-message-avatar" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: m.role === 'assistant' ? 'transparent' : 'var(--accent-500)', border: m.role === 'assistant' ? 'none' : '1px solid var(--accent-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {m.role === 'assistant' ? <RobotIcon /> : <i className="ti ti-user" style={{ color: '#fff', fontSize: 14 }}></i>}
                  </div>
                  <div className="ai-message-body" style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <div className="ai-message-bubble" style={{
                      padding: '14px 18px',
                      borderRadius: 14,
                      fontSize: 13.5,
                      lineHeight: 1.55,
                      background: m.role === 'assistant' ? 'var(--surface-2)' : 'var(--accent-700)',
                      color: m.role === 'assistant' ? 'var(--text-primary)' : '#fff',
                      border: m.role === 'assistant' ? '1px solid var(--border)' : '1px solid var(--accent-800)',
                      borderTopLeftRadius: m.role === 'assistant' ? 2 : 14,
                      borderTopRightRadius: m.role === 'user' ? 2 : 14,
                      boxShadow: 'var(--shadow-sm)'
                    }}>
                      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.text}</p>
                    </div>

                    {/* Gráfico Recharts associado */}
                    {m.chart && (
                      <div className="ai-chart-container" style={{ width: 340, marginTop: 8 }}>
                        <h4 className="chart-title">{m.chart.title}</h4>
                        {m.chart.subtitle && <p className="chart-sub">{m.chart.subtitle}</p>}
                        <div style={{ width: '100%', height: 180, marginTop: 8 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            {m.chart.chartType === 'bar' && (
                              <BarChart data={m.chart.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                <XAxis dataKey={m.chart.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={10} />
                                <YAxis stroke="var(--text-muted)" fontSize={10} />
                                <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} />
                                <Bar dataKey={m.chart.yAxisKey || 'value'} radius={[3, 3, 0, 0]}>
                                  {m.chart.data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color || 'var(--accent-500)'} />
                                  ))}
                                </Bar>
                              </BarChart>
                            )}
                            {m.chart.chartType === 'line' && (
                              <LineChart data={m.chart.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                <XAxis dataKey={m.chart.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={10} />
                                <YAxis stroke="var(--text-muted)" fontSize={10} />
                                <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} />
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
                                  outerRadius={55}
                                  fill="var(--accent-500)"
                                  label={{ fontSize: 9 }}
                                >
                                  {m.chart.data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color || `hsl(var(--accent-h), var(--accent-s), ${40 + index * 12}%)`} />
                                  ))}
                                </Pie>
                                <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10 }} />
                              </PieChart>
                            )}
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Ações Rápidas */}
                    {m.role === 'assistant' && m.id !== 'welcome' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleSaveReportManually(m)}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <i className="ti ti-device-floppy"></i> Salvar na Galeria
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            
            {loading && (
              <div className="ai-message-wrapper assistant loading" style={{ display: 'flex', gap: 12 }}>
                <div className="ai-message-avatar" style={{ animation: 'pulse-sparkle 2s infinite ease-in-out', width: 34, height: 34 }}>
                  <RobotIcon />
                </div>
                <div className="ai-message-body">
                  <div className="ai-message-bubble loading-bubble" style={{ padding: '12px 18px', borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Centrado (Estilo Gemini) */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'center' }}>
            <form onSubmit={handleSend} style={{ width: '100%', maxWidth: 700, display: 'flex', gap: 10, position: 'relative' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Pergunte ao MedBot, solicite relatórios ou configurações..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading || loadingHistory}
                style={{ borderRadius: 24, padding: '12px 20px', paddingRight: 80, fontSize: 13, border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || loadingHistory || !input.trim()}
                style={{
                  position: 'absolute', right: 6, top: 5, bottom: 5, borderRadius: 20,
                  fontSize: 12, fontWeight: 600, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 4
                }}
              >
                <i className="ti ti-send"></i> Enviar
              </button>
            </form>
          </div>
        </div>

        {/* 3. Gaveta Lateral Direita - Relatórios IA / Artefatos (Estilo Claude/Gemini) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: showArtifacts ? 0 : -340,
            width: 320,
            height: '100%',
            background: 'var(--surface-2)',
            borderLeft: '1px solid var(--border)',
            boxShadow: showArtifacts ? '-4px 0 20px rgba(0, 0, 0, 0.05)' : 'none',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 100,
            transition: 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden'
          }}
        >
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div className="card-title" style={{ fontSize: 13 }}>
              <i className="ti ti-archive" style={{ color: 'var(--accent-500)', marginRight: 6 }}></i>
              Relatórios & Artefatos
            </div>
            <button className="btn btn-icon-only btn-ghost btn-xs" onClick={() => setShowArtifacts(false)}>
              <i className="ti ti-x"></i>
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loadingReports ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                <i className="ti ti-loader-2 fz-spin"></i> Carregando artefatos…
              </div>
            ) : reports.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 12 }}>
                <i className="ti ti-info-circle" style={{ fontSize: 20, marginBottom: 8, display: 'block', color: 'var(--text-muted)' }}></i>
                Nenhum relatório salvo ainda nesta galeria.
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
                    background: 'var(--surface-1)',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, transform 0.15s'
                  }}
                  className="report-item-hover"
                >
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)', marginBottom: 4 }}>{rep.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: 'var(--text-muted)' }}>
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
          background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px' }}>
              <div className="card-title">
                <i className="ti ti-file-text" style={{ color: 'var(--accent-500)' }}></i>
                {selectedReport.title}
              </div>
              <button className="btn btn-icon-only btn-ghost" onClick={() => setSelectedReport(null)}>
                <i className="ti ti-x"></i>
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              <div
                className="ws-content"
                style={{ fontSize: 13.5, lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedReport.content) }}
              />

              {selectedReport.chart_payload && (
                <div className="card" style={{ marginTop: 20, padding: 18, background: 'var(--surface-2)' }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>{selectedReport.chart_payload.title}</h4>
                  {selectedReport.chart_payload.subtitle && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{selectedReport.chart_payload.subtitle}</p>}
                  <div style={{ width: '100%', height: 220, marginTop: 12 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      {selectedReport.chart_payload.chartType === 'bar' && (
                        <BarChart data={selectedReport.chart_payload.data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <XAxis dataKey={selectedReport.chart_payload.xAxisKey || 'name'} stroke="var(--text-muted)" fontSize={10} />
                          <YAxis stroke="var(--text-muted)" fontSize={10} />
                          <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} />
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
                          <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11 }} />
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
                          <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10 }} />
                        </PieChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
