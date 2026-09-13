'use client'

import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '60vh', gap: '12px', padding: '20px'
        }}>
          <div style={{ fontSize: 'clamp(16.5px, 1.32vw, 21.1px)' }}>⚠️</div>
          <p style={{ fontSize: 'clamp(11.0px, 0.88vw, 14.1px)', fontWeight: 700, color: '#374151', margin: 0 }}>
            Algo salió mal
          </p>
          <p style={{ fontSize: 'clamp(11px, 0.78vw, 12.5px)', color: '#6B7280', margin: 0, textAlign: 'center' }}>
            {this.state.error?.message || 'Error inesperado en la aplicación'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 20px', background: '#1B3A6B', color: 'white',
              border: 'none', fontSize: 'clamp(11px, 0.78vw, 12.5px)', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit'
            }}
          >
            Intentar de nuevo
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
