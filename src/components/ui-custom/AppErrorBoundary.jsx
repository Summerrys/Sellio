import React from 'react';
import { backLog } from '@/lib/backLog';
import { stepToFirstEntry } from '@/lib/useBackToClose';

// The last line of defence around the whole app (main.jsx): a screen that fails to load or
// crashes shows this instead of leaving the app blank. The usual cause is a page whose code is
// downloaded only when it is first opened, at a moment with no connection (just back from the
// background, say): the download fails and nothing else could catch it. Reload opens the same
// page again; in the Android app, from the first entry of the page's history, like an update
// (lib/useBackToClose), so nothing of this copy is left behind to go Back to.
const NOT_DOWNLOADED = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reload = this.reload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    backLog(`crash: ${String(error?.message || error).slice(0, 200)}`);
  }

  reload() {
    const url = window.location.href;
    const go = () => window.location.replace(url);
    void stepToFirstEntry().then(go, go);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const notDownloaded = NOT_DOWNLOADED.test(String(error?.message || error));
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 12, padding: '24px', background: '#ffffff', textAlign: 'center',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <img src="/branding/sellio-logo.webp" alt="Sellio" style={{ width: 72, objectFit: 'contain', marginBottom: 8 }} />
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
          {notDownloaded ? 'Sellio couldn’t load this screen' : 'Something went wrong'}
        </h1>
        <p style={{ margin: 0, maxWidth: 320, fontSize: 14, lineHeight: 1.5, color: '#64748b' }}>
          {notDownloaded ? 'Check your connection, then reload.' : 'Reload to carry on where you were.'}
        </p>
        <button
          type="button"
          onClick={this.reload}
          style={{
            marginTop: 8, minHeight: 44, padding: '0 24px', borderRadius: 12, border: 'none',
            background: 'var(--color-primary-gradient, linear-gradient(135deg, #3b82f6 0%, #9333ea 100%))',
            color: '#ffffff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
