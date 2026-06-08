'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

const AZUL = '#1F3A5F'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [mode, setMode] = useState<'login' | 'recover'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos.'
        : error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) setError(error.message)
    else setMessage('Revisa tu correo para restablecer tu contraseña.')
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F6FB', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px', background: `linear-gradient(90deg, ${AZUL}, ${VERDE}, ${NARANJA})` }} />
      <div style={{ background: 'white', borderRadius: '12px', padding: '48px 40px', width: '100%', maxWidth: '420px', boxShadow: '0 4px 24px rgba(31,58,95,0.10)', border: '1px solid #e2e8f0' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', background: AZUL, borderRadius: '14px', marginBottom: '16px' }}>
            <span style={{ color: 'white', fontSize: '22px', fontWeight: '700', letterSpacing: '-1px' }}>KSE</span>
          </div>
          <h1 style={{ color: AZUL, fontSize: '22px', fontWeight: '700', margin: '0 0 4px' }}>KSE Pensiones</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
            {mode === 'login' ? 'Accede a tu cuenta de asesor' : 'Recupera tu contraseña'}
          </p>
        </div>
        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Correo electrónico</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@correo.com"
                style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Contraseña</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ display: 'block', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: loading ? '#94a3b8' : AZUL, color: 'white', fontSize: '15px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Entrando...' : 'Iniciar sesión'}
            </button>
            <button type="button" onClick={() => { setMode('recover'); setError(null) }}
              style={{ display: 'block', width: '100%', marginTop: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '8px' }}>
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        ) : (
          <form onSubmit={handleRecover}>
            <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '20px', lineHeight: '1.5' }}>
              Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
            </p>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Correo electrónico</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@correo.com"
                style={{ display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
            </div>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
            {message && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', color: '#16a34a', fontSize: '13px', marginBottom: '16px' }}>{message}</div>}
            <button type="submit" disabled={loading}
              style={{ display: 'block', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: loading ? '#94a3b8' : VERDE, color: 'white', fontSize: '15px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>
            <button type="button" onClick={() => { setMode('login'); setError(null); setMessage(null) }}
              style={{ display: 'block', width: '100%', marginTop: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '8px' }}>
              ← Volver al inicio de sesión
            </button>
          </form>
        )}
      </div>
    </div>
  )
}