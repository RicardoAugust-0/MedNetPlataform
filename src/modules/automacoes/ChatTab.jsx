import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { supabase } from '../../supabase.js';

export default function ChatTab({ initialParams, clearInitialParams }) {
  const toast = useToast();
  const { profile, session } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const authHeader = () => ({ Authorization: `Bearer ${session?.access_token}` });

  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // New chat modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);

  // Template select modal state (when 24h expires)
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateVars, setTemplateVars] = useState({});
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const messagesEndRef = useRef(null);
  const chatListRef = useRef(chats);

  // Keep ref updated for subscription handlers
  useEffect(() => {
    chatListRef.current = chats;
  }, [chats]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 1. Fetch Chats
  const fetchChats = async (selectChatId = null) => {
    setLoadingChats(true);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/chats`, { headers: authHeader() });
      if (!res.ok) throw new Error('Falha ao buscar conversas.');
      const data = await res.json();
      setChats(data || []);
      
      if (selectChatId) {
        const found = data.find(c => c.id === selectChatId);
        if (found) setActiveChat(found);
      }
      return data || [];
    } catch (err) {
      console.error(err);
      toast('Erro ao buscar conversas: ' + err.message, 'error');
      return [];
    } finally {
      setLoadingChats(false);
    }
  };

  // 2. Fetch Messages
  const fetchMessages = async (chatId) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/chats/${chatId}/messages`, { headers: authHeader() });
      if (!res.ok) throw new Error('Falha ao carregar mensagens.');
      const data = await res.json();
      setMessages(data || []);
    } catch (err) {
      console.error(err);
      toast('Erro ao carregar mensagens: ' + err.message, 'error');
    } finally {
      setLoadingMessages(false);
    }
  };

  // 3. Mark chat as read
  const markAsRead = async (chatId) => {
    try {
      await fetch(`${API_URL}/api/whatsapp/chats/${chatId}/read`, { method: 'POST', headers: authHeader() });
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, unread_count: 0 } : c));
    } catch (err) {
      console.error('Erro ao marcar como lido:', err);
    }
  };

  // 4. Initial params handler (redirect from other tabs)
  useEffect(() => {
    const handleInitialParams = async () => {
      if (initialParams?.phone) {
        const { phone, name } = initialParams;
        clearInitialParams();
        setLoadingChats(true);
        try {
          const res = await fetch(`${API_URL}/api/whatsapp/chats/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({ phone, name })
          });
          if (!res.ok) throw new Error('Erro ao abrir conversa');
          const data = await res.json();
          if (data.chat) {
            await fetchChats(data.chat.id);
            fetchMessages(data.chat.id);
            markAsRead(data.chat.id);
          }
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          setLoadingChats(false);
        }
      } else if (initialParams?.name) {
        const { name } = initialParams;
        clearInitialParams();
        setLoadingChats(true);
        const latestChats = await fetchChats();
        const existingChat = latestChats.find(c => c.name.toLowerCase() === name.toLowerCase());
        if (existingChat) {
          setActiveChat(existingChat);
          fetchMessages(existingChat.id);
          if (existingChat.unread_count > 0) {
            markAsRead(existingChat.id);
          }
        } else {
          setNewName(name);
          setShowNewChatModal(true);
        }
        setLoadingChats(false);
      } else {
        fetchChats();
      }
    };
    handleInitialParams();
  }, [initialParams]);

  // 5. Active Chat select logic
  const handleSelectChat = (chat) => {
    setActiveChat(chat);
    fetchMessages(chat.id);
    if (chat.unread_count > 0) {
      markAsRead(chat.id);
    }
  };

  // 6. Realtime sync subscription
  useEffect(() => {
    const channelName = `whatsapp-chat-live-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_chats' }, (payload) => {
        // Reload chats list to reflect last message/unread count updates
        fetchChats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, (payload) => {
        const newMsg = payload.new;
        const oldMsg = payload.old;

        // If insert event
        if (payload.eventType === 'INSERT') {
          // If message belongs to active chat, append it
          setActiveChat(currentActive => {
            if (currentActive && currentActive.id === newMsg.chat_id) {
              setMessages(prev => {
                if (prev.some(m => m.id === newMsg.id || (newMsg.meta_message_id && m.meta_message_id === newMsg.meta_message_id))) {
                  return prev;
                }
                return [...prev, newMsg];
              });
              // Auto mark as read if it is inbound
              if (newMsg.direction === 'inbound') {
                markAsRead(currentActive.id);
              }
            }
            return currentActive;
          });
        }
        
        // If update event (status change)
        if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === newMsg.id || (newMsg.meta_message_id && m.meta_message_id === newMsg.meta_message_id) ? newMsg : m));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 7. Send custom free-text message
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || sending || !activeChat) return;

    setSending(true);
    const textToSend = newMessage;
    setNewMessage('');

    // Optimistic insert
    const tempId = crypto.randomUUID();
    const optimisticMsg = {
      id: tempId,
      chat_id: activeChat.id,
      direction: 'outbound',
      body: textToSend,
      status: 'sent',
      created_at: new Date().toISOString(),
      _pending: true
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const res = await fetch(`${API_URL}/api/whatsapp/chats/${activeChat.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          message: textToSend,
          userId: profile?.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao enviar mensagem.');
      }

      // Replace optimistic message with real saved message
      if (data.message) {
        setMessages(prev => prev.map(m => m.id === tempId ? data.message : m));
      }
      fetchChats();
    } catch (err) {
      toast(err.message, 'error');
      // Mark optimistic message as failed
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed', error_message: err.message } : m));
    } finally {
      setSending(false);
    }
  };

  // 8. Open a new chat manually
  const handleOpenNewChat = async (e) => {
    e.preventDefault();
    if (!newPhone.trim() || creatingChat) return;

    setCreatingChat(true);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/chats/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: newPhone.trim(),
          name: newName.trim() || newPhone.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar chat.');

      setShowNewChatModal(false);
      setNewPhone('');
      setNewName('');
      
      // Select the newly created chat
      await fetchChats(data.chat.id);
      fetchMessages(data.chat.id);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCreatingChat(false);
    }
  };

  // 9. Check if 24 hours window is active
  const is24hWindowActive = () => {
    if (messages.length === 0) return false;
    const inboundMsgs = messages.filter(m => m.direction === 'inbound');
    if (inboundMsgs.length === 0) return false;
    
    const lastInbound = inboundMsgs[inboundMsgs.length - 1];
    const lastInboundTime = new Date(lastInbound.created_at);
    const now = new Date();
    const diffMs = now - lastInboundTime;
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours < 24;
  };

  const isWindowActive = is24hWindowActive();

  // 10. Load templates for restarting conversation
  const openTemplateModal = async () => {
    setShowTemplateModal(true);
    setLoadingTemplates(true);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/templates`, { headers: authHeader() });
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      toast('Erro ao buscar templates.', 'error');
    } finally {
      setLoadingTemplates(false);
    }
  };

  // 11. Send template inside chat to restart conversation
  const handleSendTemplateMessage = async () => {
    if (!selectedTemplate || !activeChat || sendingTemplate) return;

    const bodyComponent = selectedTemplate.components?.find(c => c.type === 'BODY');
    const matches = bodyComponent?.text?.match(/\{\{\d+\}\}/g) || [];
    const varCount = matches.length;

    const varsArray = [];
    for (let i = 1; i <= varCount; i++) {
      const val = templateVars[i];
      if (val === undefined || val === '') {
        toast(`Por favor, preencha a variável {{${i}}}.`, 'error');
        return;
      }
      varsArray.push(val);
    }

    setSendingTemplate(true);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          recipient_phone: activeChat.phone,
          recipient_name: activeChat.name,
          template_name: selectedTemplate.name,
          language_code: selectedTemplate.language,
          variables: varsArray,
          userId: profile?.id
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar template');

      toast('Template enviado com sucesso!', 'success');
      setShowTemplateModal(false);
      setSelectedTemplate(null);
      setTemplateVars({});
      
      // Meta replies in chat logs as outbound message
      // Wait for webhook or poll messages
      setTimeout(() => fetchMessages(activeChat.id), 1000);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSendingTemplate(false);
    }
  };

  const filteredChats = chats.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery)
  );

  return (
    <div className="templates-split-layout" style={{ height: 'calc(100vh - 180px)', minHeight: '500px', gap: '16px' }}>
      
      {/* LEFT SIDEBAR: CHAT LIST */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '16px', height: '100%', minWidth: 0 }}>
        
        {/* List Toolbar */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <div className="search-wrap" style={{ flex: 1 }}>
            <i className="ti ti-search search-icon"></i>
            <input 
              className="form-control" 
              placeholder="Buscar conversa..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px', height: '36px' }}
            />
          </div>
          <button 
            className="btn btn-primary" 
            onClick={() => setShowNewChatModal(true)}
            style={{ height: '36px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="Nova conversa"
          >
            <i className="ti ti-message-plus" style={{ fontSize: '16px' }}></i>
            <span>Novo</span>
          </button>
        </div>

        {/* Chats scrollable container */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {loadingChats && chats.length === 0 ? (
            <div className="empty-hint" style={{ padding: '30px 10px' }}>
              <i className="ti ti-loader-2 animate-spin" style={{ fontSize: '20px', display: 'block', margin: '0 auto 8px' }}></i>
              Carregando conversas...
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="empty-hint" style={{ padding: '40px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="ti ti-message-2-off" style={{ fontSize: '28px', marginBottom: '8px', display: 'block' }}></i>
              Nenhuma conversa encontrada.
            </div>
          ) : (
            filteredChats.map(c => {
              const isActive = activeChat?.id === c.id;
              const formattedTime = new Date(c.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              return (
                <div 
                  key={c.id}
                  className={`group-row ${isActive ? 'on' : ''}`}
                  onClick={() => handleSelectChat(c)}
                  style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}
                >
                  <div className="grp-icon" style={{ borderRadius: '50%', background: isActive ? 'var(--accent-500)' : 'var(--surface-3)', color: isActive ? '#fff' : 'var(--text-secondary)' }}>
                    <i className="ti ti-user" style={{ fontSize: '15px' }}></i>
                  </div>
                  <div className="grp-body" style={{ marginLeft: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span className="grp-name" style={{ fontSize: '12.5px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }}>{c.name}</span>
                      <span className="dh-time" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{formattedTime}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                      <span className="grp-sub" style={{ fontSize: '11px', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                        {c.phone}
                      </span>
                      {c.unread_count > 0 && (
                        <span style={{ background: 'var(--accent-500)', color: '#fff', fontSize: '9.5px', padding: '2px 6px', borderRadius: '99px', fontWeight: 'bold' }}>
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT SIDE: CONVERSATION PANEL */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: 0, height: '100%', minWidth: 0, background: 'var(--surface-0)' }}>
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{activeChat.name}</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>+{activeChat.phone}</span>
                </div>
              </div>

              {/* 24 Hours Indicator */}
              <div>
                {isWindowActive ? (
                  <span className="vps-online" style={{ background: 'var(--success-bg)', color: 'var(--success-600)', borderColor: 'transparent', fontSize: '10px' }} title="Você pode enviar mensagens livres e conversar em tempo real">
                    <span className="d"></span> Janela Ativa (24h)
                  </span>
                ) : (
                  <span className="vps-online" style={{ background: 'var(--warning-bg)', color: 'var(--warning-600)', borderColor: 'transparent', fontSize: '10px' }} title="A janela de conversa de 24h expirou. É preciso enviar um template para reiniciar.">
                    <span className="d" style={{ background: 'currentColor' }}></span> Janela Expirada
                  </span>
                )}
              </div>
            </div>

            {/* Messages Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {loadingMessages ? (
                <div className="empty-hint" style={{ margin: 'auto' }}>
                  <i className="ti ti-loader-2 animate-spin" style={{ fontSize: '24px', display: 'block', margin: '0 auto 8px' }}></i>
                  Carregando mensagens...
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-hint" style={{ margin: 'auto', textAlign: 'center', opacity: 0.8 }}>
                  <i className="ti ti-brand-whatsapp" style={{ fontSize: '36px', color: 'var(--success-500)', marginBottom: '8px', display: 'block' }}></i>
                  Inicie a conversa! Envie uma mensagem no campo abaixo.
                </div>
              ) : (
                messages.map(m => {
                  const isOutbound = m.direction === 'outbound';
                  const formattedTime = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                  
                  return (
                    <div 
                      key={m.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isOutbound ? 'flex-end' : 'flex-start',
                        width: '100%'
                      }}
                    >
                      <div 
                        style={{
                          background: isOutbound ? 'var(--accent-50)' : 'var(--surface-0)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: isOutbound ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                          padding: '8px 12px',
                          maxWidth: '75%',
                          boxShadow: 'var(--shadow-sm)',
                          position: 'relative'
                        }}
                      >
                        <div style={{ fontSize: '12.5px', lineBreak: 'anywhere', whiteSpace: 'pre-wrap', lineHeight: '1.45' }}>{m.body}</div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px', fontSize: '9px', color: 'var(--text-muted)' }}>
                          <span>{formattedTime}</span>
                          {isOutbound && (
                            <span>
                              {m.status === 'read' ? (
                                <i className="ti ti-checks" style={{ color: 'var(--accent-500)', fontSize: '13px' }} title="Lida"></i>
                              ) : m.status === 'delivered' ? (
                                <i className="ti ti-checks" style={{ color: 'var(--text-muted)', fontSize: '13px' }} title="Entregue"></i>
                              ) : m.status === 'failed' ? (
                                <i className="ti ti-alert-triangle" style={{ color: 'var(--danger-500)', fontSize: '12px' }} title={m.error_message || 'Falha de entrega'}></i>
                              ) : (
                                <i className="ti ti-check" style={{ color: 'var(--text-muted)', fontSize: '13px' }} title="Enviada"></i>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Bar / Typing Area */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-0)' }}>
              {!isWindowActive && messages.length > 0 ? (
                // Expired notification & Template Trigger
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="ti ti-alert-circle" style={{ color: 'var(--warning-500)', fontSize: '20px', flexShrink: 0 }}></i>
                    <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--warning-600)', lineHeight: '1.45' }}>
                      <strong>Janela de Conversa Expirada:</strong> Para reabrir a conversa e poder digitar livremente de novo, você deve enviar um Template oficial da Meta.
                    </p>
                  </div>
                  <button className="btn btn-warning btn-sm" style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={openTemplateModal}>
                    <i className="ti ti-file-text" style={{ fontSize: '14px' }}></i> Enviar Template
                  </button>
                </div>
              ) : (
                // Text Area input
                <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '10px', width: '100%', alignItems: 'center' }}>
                  <textarea 
                    className="form-control"
                    placeholder="Digite sua resposta..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    rows={1}
                    style={{ flex: 1, resize: 'none', padding: '10px 14px', height: '40px', lineHeight: '18px', display: 'flex', alignItems: 'center' }}
                  />
                  <button 
                    className="btn btn-primary" 
                    type="submit"
                    disabled={!newMessage.trim() || sending}
                    style={{ height: '40px', width: '40px', padding: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0 }}
                  >
                    <i className="ti ti-send" style={{ fontSize: '16px' }}></i>
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          <div style={{ margin: 'auto', textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <i className="ti ti-message-circle" style={{ fontSize: '48px', color: 'var(--accent-200)', marginBottom: '12px', display: 'block' }}></i>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>Nenhuma conversa selecionada</h3>
            <p style={{ fontSize: '12px', margin: 0 }}>Selecione um contato na lista à esquerda ou inicie uma nova conversa.</p>
          </div>
        )}
      </div>

      {/* MODAL: START NEW CONVERSATION */}
      {showNewChatModal && (
        <div className="modal-overlay open" onClick={() => setShowNewChatModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '400px' }}>
            <div className="modal-header">
              <div className="modal-title"><i className="ti ti-message-plus"></i> Abrir Nova Conversa</div>
              <button className="btn-icon" onClick={() => setShowNewChatModal(false)}><i className="ti ti-x"></i></button>
            </div>
            <form onSubmit={handleOpenNewChat}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Número do WhatsApp (com DDI/DDD)</label>
                  <input 
                    className="form-control mono" 
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="Ex: 5511999999999"
                    required
                  />
                  <span className="field-hint"><i className="ti ti-info-circle"></i> Insira apenas números, incluindo o DDI (55 para Brasil).</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Nome do Contato (Opcional)</label>
                  <input 
                    className="form-control" 
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Ex: Motorista João"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn" type="button" onClick={() => setShowNewChatModal(false)}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={creatingChat}>
                  <i className="ti ti-check"></i> Abrir Chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SELECT & SEND TEMPLATE */}
      {showTemplateModal && (
        <div className="modal-overlay open" onClick={() => setShowTemplateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '550px' }}>
            <div className="modal-header">
              <div className="modal-title"><i className="ti ti-file-text"></i> Escolher Template para Reabrir Chat</div>
              <button className="btn-icon" onClick={() => setShowTemplateModal(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {loadingTemplates ? (
                <div className="empty-hint" style={{ padding: '20px 0' }}>
                  <i className="ti ti-loader-2 animate-spin" style={{ fontSize: '20px', display: 'block', margin: '0 auto 8px' }}></i>
                  Carregando templates homologados...
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Template Homologado</label>
                    <select 
                      className="form-control" 
                      value={selectedTemplate?.name || ''} 
                      onChange={e => {
                        const tpl = templates.find(t => t.name === e.target.value);
                        setSelectedTemplate(tpl || null);
                        setTemplateVars({});
                      }}
                    >
                      <option value="">-- Selecione o Modelo --</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.name}>{t.name} ({t.language})</option>
                      ))}
                    </select>
                  </div>

                  {selectedTemplate && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} className="fz-in">
                      {/* Meta preview box */}
                      <div className="form-group">
                        <label className="form-label">Visualização do Texto</label>
                        <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                          {selectedTemplate.components?.find(c => c.type === 'BODY')?.text}
                        </div>
                      </div>

                      {/* Variables Inputs */}
                      {(() => {
                        const bodyText = selectedTemplate.components?.find(c => c.type === 'BODY')?.text || '';
                        const matches = bodyText.match(/\{\{\d+\}\}/g) || [];
                        if (matches.length === 0) return null;

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                            <span className="form-label" style={{ fontWeight: 600 }}>Preencher Variáveis do Template</span>
                            {matches.map((match, idx) => {
                              const varNum = idx + 1;
                              return (
                                <div key={varNum} className="form-group" style={{ marginBottom: 0 }}>
                                  <label className="form-label" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Variável {"{{" + varNum + "}}"}</label>
                                  <input 
                                    className="form-control" 
                                    value={templateVars[varNum] || ''}
                                    onChange={e => setTemplateVars(prev => ({ ...prev, [varNum]: e.target.value }))}
                                    placeholder={`Texto para {{${varNum}}}`}
                                    required
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowTemplateModal(false)}>Cancelar</button>
              <button 
                className="btn btn-primary" 
                onClick={handleSendTemplateMessage}
                disabled={!selectedTemplate || sendingTemplate}
              >
                <i className="ti ti-send"></i> Enviar Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
