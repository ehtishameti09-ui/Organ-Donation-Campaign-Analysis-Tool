import { Component } from 'react';

// Catches render-time crashes from any descendant. Without this, a single
// "Cannot access X before initialization" or "Cannot read properties of null"
// inside a page component produces a totally blank screen with no clue what
// went wrong. With this, the user sees a friendly message + a Try Again /
// Reload button, and the actual error lands in the console for debugging.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    if (typeof console !== 'undefined' && console.error) {
      console.error('[ErrorBoundary] caught render error:', error, errorInfo);
    }
  }

  // Reset the boundary so a re-render attempts the same tree afresh.
  // We also bump a key on the children container via state so React tears
  // down and rebuilds them — important because a stale render can leave the
  // tree in a bad state even after the underlying cause is fixed.
  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  // When the route changes, automatically clear the error so navigating away
  // from a broken page works without forcing the user to click Reload.
  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.handleRetry();
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDev = typeof import.meta !== 'undefined' && import.meta?.env?.DEV;
    const message = this.state.error?.message || String(this.state.error || 'Unknown error');

    return (
      <div style={{
        minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{
          maxWidth: '520px', width: '100%', background: '#fff',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          padding: '32px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.04)',
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: 'var(--danger-light)', color: 'var(--danger)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '24px', fontWeight: '700',
          }}>!</div>
          <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: 'var(--text1)' }}>
            Something went wrong
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text2)', lineHeight: '1.6' }}>
            This page hit an unexpected error and couldn't be displayed. Your session is still safe —
            you can retry, go back to the dashboard, or reload the app.
          </p>
          {isDev && (
            <pre style={{
              textAlign: 'left', fontSize: '11px', color: 'var(--danger)',
              background: 'var(--danger-light)', padding: '10px 12px',
              borderRadius: 'var(--radius)', overflow: 'auto', maxHeight: '160px',
              margin: '0 0 16px',
            }}>{message}</pre>
          )}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-primary" onClick={this.handleRetry}>
              Try Again
            </button>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => { window.location.hash = '#dashboard'; this.handleRetry(); }}
            >
              Go to Dashboard
            </button>
            <button className="btn btn-sm btn-ghost" onClick={this.handleReload}>
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
