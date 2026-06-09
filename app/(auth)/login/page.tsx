'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()

  const [mode, setMode] = useState<'login' | 'recover'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Correo o contraseña incorrectos')
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Panel izquierdo — Hero */}
      <div style={{
        width: '52%',
        background: `linear-gradient(135deg, #0f2444 0%, ${AZUL} 50%, #1a4a7a 100%)`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '40px 48px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Grid pattern overlay */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        {/* Decorative circles */}
        <div style={{ position: 'absolute', bottom: '-80px', right: '-80px', width: '400px', height: '400px', borderRadius: '50%', background: 'rgba(46,139,87,0.12)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '-60px', left: '-60px', width: '300px', height: '300px', borderRadius: '50%', background: 'rgba(244,121,32,0.08)', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '10px 16px', display: 'inline-flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
            <img src="/logo-kse.png" alt="KSE" style={{ height: '36px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: AZUL, lineHeight: 1.2 }}>KSE Pensiones</div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>CRM de Diagnóstico Pensional</div>
            </div>
          </div>
        </div>

        {/* Headline */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{
            fontSize: '48px',
            fontWeight: '800',
            color: 'white',
            lineHeight: 1.15,
            margin: '0 0 20px',
            letterSpacing: '-1px',
          }}>
            Para que te<br />
            <span style={{ color: NARANJA }}>pensiones</span><br />
            sin presiones.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '15px', lineHeight: 1.6, margin: '0 0 32px', maxWidth: '340px' }}>
            La plataforma especializada en diagnóstico pensional para asesores que quieren cerrar más propuestas con datos confiables.
          </p>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '40px' }}>
            {[
              { icon: '⊞', title: 'Calculadora Ley 73 y 97', desc: 'Fórmulas actualizadas 2026 con Mod 40 y PPR' },
              { icon: '◎', title: 'CRM de clientes', desc: 'Expediente completo con historial de diagnósticos' },
              { icon: '📄', title: 'PDF profesional', desc: 'Propuesta con tu logo lista para presentar' },
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'white' }}>{f.title}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '32px' }}>
            {[
              { value: 'Ley 73', label: 'y Ley 97' },
              { value: '4', label: 'escenarios' },
              { value: '100%', label: 'confiable' },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: '22px', fontWeight: '800', color: NARANJA }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>
          © 2026 KSE Pensiones · Diagnóstico Pensional para Asesores
        </div>
      </div>

      {/* Panel derecho — Formulario */}
      <div style={{
        flex: 1,
        background: '#F4F6FB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>

          {mode === 'login' ? (
            <>
              <h2 style={{ fontSize: '26px', fontWeight: '800', color: AZUL, margin: '0 0 6px', letterSpacing: '-0.5px' }}>Bienvenido de nuevo</h2>
              <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 32px' }}>Ingresa tus credenciales para continuar</p>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⚠️ {error}
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Correo electrónico
                  </label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="tu@correo.com"
                    style={{ display: 'block', width: '100%', padding: '12px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: 'white', transition: 'border-color 0.15s' }}
                    onFocus={e => e.target.style.borderColor = AZUL}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                      placeholder="••••••••"
                      style={{ display: 'block', width: '100%', padding: '12px 44px 12px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: 'white' }}
                      onFocus={e => e.target.style.borderColor = AZUL}
                      onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                    />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: '4px' }}>
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button type="button" onClick={() => { setMode('recover'); setError(null) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: NARANJA, fontSize: '12px', fontWeight: '600', padding: 0 }}>
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  style={{ display: 'block', width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: loading ? '#94a3b8' : AZUL, color: 'white', fontSize: '15px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.3px', transition: 'background 0.15s' }}>
                  {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
                </button>
              </form>

              <div style={{ marginTop: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                🔒 Conexión segura · Datos cifrados con SSL
              </div>
            </>
          ) : (
            <>
              <button onClick={() => { setMode('login'); setError(null); setMessage(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '13px', fontWeight: '600', padding: '0 0 20px', marginLeft: '-4px' }}>
                ← Volver al inicio
              </button>

              <h2 style={{ fontSize: '24px', fontWeight: '800', color: AZUL, margin: '0 0 6px' }}>Recuperar contraseña</h2>
              <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 28px' }}>
                Te enviaremos un enlace para restablecer tu contraseña.
              </p>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>
                  ⚠️ {error}
                </div>
              )}
              {message && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', color: '#16a34a', fontSize: '13px', marginBottom: '16px' }}>
                  ✓ {message}
                </div>
              )}

              <form onSubmit={handleRecover}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Correo electrónico
                  </label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@correo.com"
                    style={{ display: 'block', width: '100%', padding: '12px 14px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: 'white' }} />
                </div>

                <button type="submit" disabled={loading}
                  style={{ display: 'block', width: '100%', padding: '13px', borderRadius: '10px', border: 'none', background: loading ? '#94a3b8' : VERDE, color: 'white', fontSize: '15px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer' }}>
                  {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
