import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../lib/analyticsApi.js';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../hooks/useToast';
import renderMarkdown from '../modules/admin/ai-chat/renderMarkdown.js';
import '../styles/ai-chat.css';
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

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  text: 'Olá! Sou seu Assistente IA MedNet. Tenho acesso administrativo completo para monitorar, criar, editar ou excluir configurações e dados da plataforma. Como posso ajudar você hoje?'
};

export default function GlobalAiChat() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const isAdmin = profile?.role === 'admin';

  const fetchHistory = async () => {
    try {
      const res = await apiFetch('/api/ai/chat/history');
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setMessages(data);
        } else {
          setMessages([WELCOME_MESSAGE]);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar histórico da IA:', err);
    }
  };

  useEffect(() => {
    if (open) {
      fetchHistory();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  if (!isAdmin) return null;

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
          context: {
            pathname: window.location.pathname,
            pageTitle: document.title
          }
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
        chart: data.chart // Opcional, contendo estrutura de gráfico Recharts
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Executar ações do Copiloto (navegação automática)
      if (data.chart && data.chart.type === 'action') {
        if (data.chart.action === 'navigate' && data.chart.payload?.path) {
          navigate(data.chart.payload.path);
        }
      }
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
    const ok = await confirm({
      title: 'Limpar histórico',
      message: 'Deseja limpar todo o histórico de conversas com a IA?',
      confirmText: 'Limpar',
      danger: true
    });
    if (!ok) return;
    try {
      const res = await apiFetch('/api/ai/chat/history', { method: 'DELETE' });
      if (res.ok) {
        setMessages([WELCOME_MESSAGE]);
        toast('Histórico limpo.', 'success');
      } else {
        toast('Não foi possível limpar o histórico.', 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Não foi possível limpar o histórico.', 'error');
    }
  };

  return (
    <>
      {/* Botão flutuante da IA */}
      <button
        className={`global-ai-bubble ${open ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        title="Assistente IA Universal"
      >
        <i className="ti ti-sparkles"></i>
      </button>

      {/* Drawer de Chat da IA */}
      <div className={`global-ai-drawer ${open ? 'open' : ''}`}>
        <div className="ai-drawer-header">
          <div className="ai-header-title">
            <i className="ti ti-sparkles" style={{ color: 'var(--accent-500)' }}></i>
            <div>
              <h3>Assistente IA</h3>
              <span className="badge badge-danger" style={{ fontSize: 9, padding: '2px 4px' }}>ADMIN CONEXÃO</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-icon-only btn-ghost btn-sm" onClick={handleClearHistory} title="Limpar conversa">
              <i className="ti ti-trash"></i>
            </button>
            <button className="btn btn-icon-only btn-ghost btn-sm" onClick={() => setOpen(false)}>
              <i className="ti ti-x"></i>
            </button>
          </div>
        </div>

        <div className="ai-drawer-messages">
          {messages.map((m) => (
            <div key={m.id} className={`ai-message-wrapper ${m.role}`}>
              <div className="ai-message-avatar">
                {m.role === 'assistant' ? <RobotIcon /> : <i className="ti ti-user"></i>}
              </div>
              <div className="ai-message-body">
                <div className="ai-message-bubble">
                  {m.role === 'user' ? (
                    <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.text}</p>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
                  )}
                </div>
                
                {/* Renderizador de Gráficos Dinâmicos */}
                {m.chart && m.chart.chartType && (
                  <div className="ai-chart-container">
                    <h4 className="chart-title">{m.chart.title}</h4>
                    {m.chart.subtitle && <p className="chart-sub">{m.chart.subtitle}</p>}
                    <div style={{ width: '100%', height: 200, marginTop: 8 }}>
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
                              outerRadius={60}
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

        <form onSubmit={handleSend} className="ai-drawer-input">
          <input
            type="text"
            placeholder="Pergunte ou comande a plataforma…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary btn-icon-only" disabled={loading || !input.trim()}>
            <i className="ti ti-send"></i>
          </button>
        </form>
      </div>
    </>
  );
}
