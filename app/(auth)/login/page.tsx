'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

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
    if (error) setError('Correo o contraseña incorrectos')
    else { router.push('/dashboard'); router.refresh() }
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

      {/* ── Panel izquierdo — Hero ── */}
      <div style={{
        width: '55%',
        background: `linear-gradient(145deg, #0a1628 0%, #1B3A6B 45%, #0f2d5a 100%)`,
        display: 'flex',
        flexDirection: 'column',
        padding: '40px 56px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.05,
          backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', bottom: '-120px', right: '-120px', width: '500px', height: '500px', borderRadius: '50%', background: 'rgba(46,139,87,0.15)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '-80px', left: '30%', width: '350px', height: '350px', borderRadius: '50%', background: 'rgba(244,121,32,0.07)', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1, marginBottom: '56px' }}>
          <div style={{
            background: 'white', borderRadius: '14px',
            padding: '12px 20px',
            display: 'inline-flex', alignItems: 'center', gap: '14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          }}>
            <img src="/logo-kse.png" alt="KSE" style={{ height: '44px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: AZUL, lineHeight: 1.2 }}>KSE Pensiones</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>CRM de Diagnóstico Pensional</div>
            </div>
          </div>
        </div>

        {/* Headline */}
        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 style={{
            fontSize: '56px', fontWeight: '900', color: 'white',
            lineHeight: 1.1, margin: '0 0 24px', letterSpacing: '-1.5px',
          }}>
            Para que te<br />
            <span style={{ color: NARANJA }}>pensiones</span><br />
            sin presiones.
          </h1>

          <p style={{ color: 'rgba(255,255,255,0.60)', fontSize: '16px', lineHeight: 1.7, margin: '0 0 40px', maxWidth: '380px' }}>
            La plataforma especializada en diagnóstico pensional para asesores que quieren cerrar más propuestas con datos confiables.
          </p>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '48px' }}>
            {[
              { icon: '⊞', title: 'Calculadora Ley 73 y 97', desc: 'Fórmulas oficiales 2026 · Mod 10 · Mod 40 · Portabilidad ISSSTE' },
              { icon: '◎', title: 'CRM de clientes', desc: 'Expediente completo con historial de diagnósticos y seguimiento' },
              { icon: '📄', title: 'PDF profesional', desc: 'Propuesta con tu logo lista para presentar al cliente' },
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'white', marginBottom: '1px' }}>{f.title}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '0', borderTop: '1px solid rgba(255,255,255,0.10)', paddingTop: '28px' }}>
            {[
              { value: 'Ley 73', label: 'y Ley 97' },
              { value: '4', label: 'escenarios' },
              { value: '2026', label: 'actualizado' },
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, paddingRight: i < 2 ? '24px' : '0', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.10)' : 'none', paddingLeft: i > 0 ? '24px' : '0' }}>
                <div style={{ fontSize: '24px', fontWeight: '900', color: NARANJA, marginBottom: '2px' }}>{s.value}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.25)', fontSize: '11px', marginTop: '32px' }}>
          © 2026 KSE Pensiones · Diagnóstico Pensional para Asesores en México
        </div>
      </div>

      {/* ── Panel derecho — Formulario ── */}
      <div style={{
        flex: 1,
        background: '#F0F4F8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
      }}>
        {/* Card del formulario */}
        <div style={{
          background: 'white',
          borderRadius: '20px',
          padding: '40px 36px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 8px 40px rgba(27,58,107,0.12)',
          border: '1px solid rgba(27,58,107,0.08)',
        }}>
          {mode === 'login' ? (
            <>
              <h2 style={{ fontSize: '26px', fontWeight: '800', color: AZUL, margin: '0 0 6px', letterSpacing: '-0.5px', textAlign: 'center' }}>
                Bienvenido de nuevo
              </h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 28px', textAlign: 'center' }}>
                Ingresa tus credenciales para continuar
              </p>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>⚠️</span>
                  <span style={{ color: '#dc2626', fontSize: '13px', fontWeight: '500' }}>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Correo electrónico
                  </label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="tu@correo.com"
                    style={{ display: 'block', width: '100%', padding: '13px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: '#FAFBFC', fontFamily: 'inherit', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                    onFocus={e => { e.target.style.borderColor = AZUL; e.target.style.boxShadow = `0 0 0 3px rgba(27,58,107,0.08)` }}
                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
                  />
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                      placeholder="••••••••"
                      style={{ display: 'block', width: '100%', padding: '13px 48px 13px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: '#FAFBFC', fontFamily: 'inherit' }}
                      onFocus={e => { e.target.style.borderColor = AZUL; e.target.style.boxShadow = `0 0 0 3px rgba(27,58,107,0.08)` }}
                      onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
                    />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: '4px', lineHeight: 1 }}>
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
                  <button type="button" onClick={() => { setMode('recover'); setError(null) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: NARANJA, fontSize: '13px', fontWeight: '600', padding: 0 }}>
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                <button type="submit" disabled={loading}
                  style={{ display: 'block', width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: loading ? '#94a3b8' : AZUL, color: 'white', fontSize: '15px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '0.3px', boxShadow: loading ? 'none' : '0 4px 16px rgba(27,58,107,0.30)', transition: 'all 0.15s' }}>
                  {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
                </button>
              </form>

              <div style={{ marginTop: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                🔒 Conexión segura · Datos cifrados con SSL
              </div>
            </>
          ) : (
            <>
              <button onClick={() => { setMode('login'); setError(null); setMessage(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '13px', fontWeight: '600', padding: '0 0 20px', marginLeft: '-2px' }}>
                ← Volver al inicio
              </button>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: AZUL, margin: '0 0 6px', textAlign: 'center' }}>Recuperar contraseña</h2>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 28px', textAlign: 'center' }}>Te enviaremos un enlace para restablecer tu contraseña.</p>

              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>⚠️ {error}</div>}
              {message && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', color: '#16a34a', fontSize: '13px', marginBottom: '16px' }}>✓ {message}</div>}

              <form onSubmit={handleRecover}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Correo electrónico</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@correo.com"
                    style={{ display: 'block', width: '100%', padding: '13px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: '#FAFBFC', fontFamily: 'inherit' }} />
                </div>
                <button type="submit" disabled={loading}
                  style={{ display: 'block', width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: loading ? '#94a3b8' : VERDE, color: 'white', fontSize: '15px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 4px 16px rgba(46,139,87,0.30)' }}>
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
