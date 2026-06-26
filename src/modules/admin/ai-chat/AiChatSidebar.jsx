export default function AiChatSidebar({ threads, activeThreadId, onSelectThread, onDeleteThread, onNewChat }) {
  return (
    <div className="ai-sidebar">
      <button className="btn-new-chat" onClick={onNewChat}>
        <i className="ti ti-plus" style={{ fontSize: 14 }} /> Nova conversa
      </button>

      <div className="ai-sidebar-label">Conversas recentes</div>

      <div className="ai-threads-list ai-custom-scroll">
        {threads.length === 0 ? (
          <div className="ai-sidebar-empty">
            Nenhuma conversa iniciada.
          </div>
        ) : (
          threads.map(t => (
            <div
              key={t.id}
              onClick={() => onSelectThread(t.id)}
              className={`ai-thread-item ${activeThreadId === t.id ? 'active' : ''}`}
            >
              <div className="ai-thread-content">
                <i className="ti ti-message" />
                {t.title}
              </div>
              <button
                onClick={(e) => onDeleteThread(t.id, e)}
                className="btn-trash-thread"
                title="Excluir chat"
              >
                <i className="ti ti-trash" style={{ fontSize: 12 }} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
