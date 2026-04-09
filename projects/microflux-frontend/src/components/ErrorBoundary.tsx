import React, { ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error: error }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'var(--color-bg-primary)',
          padding: '2rem',
        }}>
          <div className="card" style={{ maxWidth: '500px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⚠️</div>
            <h1 className="text-2xl" style={{ marginBottom: '12px' }}>ERROR OCCURRED</h1>
            <p className="text-sm text-muted" style={{ lineHeight: '1.6' }}>
              {this.state.error?.message.includes('Attempt to get default algod configuration')
                ? 'Please make sure to set up your environment variables correctly. Create a .env file based on .env.template and fill in the required values. This controls the network and credentials for connections with Algod and Indexer.'
                : this.state.error?.message}
            </p>
            <button
              className="btn btn-primary"
              style={{ marginTop: '20px' }}
              onClick={() => window.location.reload()}
            >
              RELOAD
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
