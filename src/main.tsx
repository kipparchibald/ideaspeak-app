import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0a0f', color: '#e8e8f0', padding: '2rem', textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>IdeaSpeak failed to load</h1>
            <p style={{ color: '#888', marginBottom: '1rem' }}>{this.state.error}</p>
            <button
              onClick={() => {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
                }
                window.location.reload()
              }}
              style={{ background: '#00ff88', color: '#0a0a0f', border: 'none', borderRadius: '12px', padding: '0.75rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Clear cache &amp; reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
