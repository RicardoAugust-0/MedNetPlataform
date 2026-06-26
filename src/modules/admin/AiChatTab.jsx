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
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: 'block', width: '85%', height: '85%' }}>
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
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Olá! Sou seu Assistente IA MedNet. Tenho acesso administrativo completo. Posso responder a dúvidas, extrair métricas do banco e salvar relatórios executivos na galeria lateral.'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const messagesEndRef = useRef(null);

  // Carrega histórico de chat
  const fetchHistory = async () => {
    try {
      const res = await apiFetch('/api/ai/chat/history');
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setMessages(data);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err);
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
      console.error('Erro ao carregar relatórios:', err);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchReports();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        body: JSON.stringify({ message: userMessage.text })
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
      
      // Se a IA salvou um relatório, atualiza a lista lateral
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

  const handleClearHistory = async () => {
    if (!confirm('Deseja limpar todo o histórico de conversas?')) return;
    try {
      const res = await apiFetch('/api/ai/chat/history', { method: 'DELETE' });
      if (res.ok) {
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            text: 'Olá! Histórico limpo. Como posso ajudar você agora?'
          }
        ]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveReportManually = async (msg) => {
    const title = prompt('Digite o título para este relatório:', `Relatório IA - ${new Date().toLocaleDateString()}`);
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, height: 'calc(100vh - 180px)', minHeight: 480 }}>
      {/* Área do Chat */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px' }}>
          <div className="card-title">
            <i className="ti ti-messages" style={{ color: 'var(--accent-500)' }}></i>
            Conversa com Assistente IA
          </div>
          <button className="btn btn-sm btn-ghost" onClick={handleClearHistory} title="Limpar conversa">
            <i className="ti ti-trash"></i> Limpar Histórico
          </button>
        </div>

        {/* Mensagens */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 16, background: 'var(--surface-1)' }}>
          {messages.map((m) => (
            <div key={m.id} className={`ai-message-wrapper ${m.role}`} style={{ maxWidth: '75%' }}>
              <div className="ai-message-avatar">
                {m.role === 'assistant' ? <RobotIcon /> : <i className="ti ti-user"></i>}
              </div>
              <div className="ai-message-body">
                <div className="ai-message-bubble">
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.text}</p>
                </div>
                
                {/* Render de gráficos embutidos na mensagem */}
                {m.chart && (
                  <div className="ai-chart-container">
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
                            <Line type="monotone" dataKey={m.chart.yAxisKey || 'value'} stroke="var(--accent-500)" strokeWidth={2} activeDot={{ r: 4 }} />
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

                {/* Opções rápidos de mensagem de Assistente */}
                {m.role === 'assistant' && m.id !== 'welcome' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleSaveReportManually(m)}
                      style={{ fontSize: 11, padding: '2px 6px' }}
                    >
                      <i className="ti ti-device-floppy"></i> Salvar na Galeria
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="ai-message-wrapper assistant loading">
              <div className="ai-message-avatar" style={{ animation: 'pulse-sparkle 2s infinite ease-in-out' }}>
                <RobotIcon />
              </div>
              <div className="ai-message-body">
                <div className="ai-message-bubble loading-bubble">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} style={{ padding: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, background: 'var(--surface-2)' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Pergunte à IA, solicite relatórios ou comandos..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            style={{ borderRadius: 20 }}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()} style={{ borderRadius: 20 }}>
            <i className="ti ti-send"></i> Enviar
          </button>
        </form>
      </div>

      {/* Galeria Lateral de Relatórios */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}>
        <div className="card-header" style={{ padding: '12px 16px' }}>
          <div className="card-title">
            <i className="ti ti-archive" style={{ color: 'var(--accent-500)' }}></i>
            Relatórios IA
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loadingReports ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
              <i className="ti ti-loader-2 fz-spin"></i> Carregando galeria…
            </div>
          ) : reports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 12 }}>
              <i className="ti ti-info-circle" style={{ fontSize: 20, marginBottom: 8, display: 'block' }}></i>
              Nenhum relatório salvo ainda. Peça para a IA gerar um e salvá-lo.
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
                  background: 'var(--surface-2)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background-color 0.15s'
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
              {/* Render de Markdown do Relatório */}
              <div
                className="ws-content"
                style={{ fontSize: 13.5, lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedReport.content) }}
              />

              {/* Se o relatório possui gráfico associado */}
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
