import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'var(--bg-app, #f5f5f5)', padding: 24,
        }}>
          <div style={{
            maxWidth: 480, background: 'var(--surface-0, #fff)',
            border: '1px solid var(--border, #e0e0e0)',
            borderRadius: 'var(--radius-xl, 12px)', padding: 32, textAlign: 'center',
          }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 40, color: 'var(--warning-500, #e8a020)', display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary, #111)', marginBottom: 8 }}>
              Algo deu errado
            </div>
            <div style={{
              fontSize: 12, color: 'var(--text-muted, #888)', marginBottom: 20,
              background: 'var(--surface-1, #f8f8f8)', borderRadius: 6,
              padding: '8px 12px', fontFamily: 'monospace', textAlign: 'left',
            }}>
              {this.state.error.message}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              <i className="ti ti-refresh"></i> Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
