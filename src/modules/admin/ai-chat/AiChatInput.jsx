export default function AiChatInput({ input, setInput, loading, loadingHistory, onSubmit }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  return (
    <div className="ai-input-wrapper">
      <form onSubmit={handleSubmit} className="ai-input-capsule">
        <i className="ti ti-sparkles" style={{ color: 'var(--text-muted)', opacity: 0.5, fontSize: 16 }} />
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
          <i className="ti ti-send" style={{ fontSize: 13 }} />
        </button>
      </form>
    </div>
  );
}
