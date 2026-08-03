'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const NARANJA = '#F47920'
const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'

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
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)

  useEffect(() => {
    // Load custom banner from any asesor profile
    createClient().from('perfiles_usuario').select('banner_url').not('banner_url', 'is', null).limit(1).single()
      .then(({ data }) => { if (data?.banner_url) setBannerUrl(data.banner_url) })
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    await doLogin()
  }

  async function doLogin() {
    setLoading(true); setError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Correo o contraseña incorrectos')
    } else {
      await supabase.auth.signOut({ scope: 'others' })
      router.push('/dashboard'); router.refresh()
    }
    setLoading(false)
  }

  const razon = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('razon') : null

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) setError(error.message)
    else setMessage('Revisa tu correo para restablecer tu contraseña.')
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ── Panel izquierdo — Hero con imagen ── */}
      <div style={{
        width: '58%',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '40px 52px',
      }}>
        {/* Imagen de fondo */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${bannerUrl || '/fondo-kse.png'})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
        }} />
        {/* Overlay gradiente naranja-oscuro */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(244,121,32,0.82) 0%, rgba(27,58,107,0.75) 60%, rgba(0,0,0,0.65) 100%)',
        }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            background: 'rgba(255,255,255,0.95)',
            borderRadius: '14px',
            padding: '10px 18px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            backdropFilter: 'blur(10px)',
          }}>
            <img src="/logo-kse.png" alt="KSE" style={{ height: '40px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: '800', color: AZUL, lineHeight: 1.2 }}>KSE Pensiones</div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>CRM de Diagnóstico Pensional</div>
            </div>
          </div>
        </div>

        {/* Headline central */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{
            fontSize: '58px',
            fontWeight: '900',
            color: 'white',
            lineHeight: 1.1,
            margin: '0 0 20px',
            letterSpacing: '-1.5px',
            textShadow: '0 2px 20px rgba(0,0,0,0.3)',
          }}>
            Diagnóstico<br />
            <span style={{
              color: 'white',
              WebkitTextStroke: '2px rgba(255,255,255,0.4)',
              textShadow: '0 0 40px rgba(244,121,32,0.8), 0 2px 20px rgba(0,0,0,0.3)',
            }}>Gestoría</span><br />
            Financiamiento
          </h1>

          <p style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: '16px',
            lineHeight: 1.7,
            margin: '0 0 36px',
            maxWidth: '380px',
            textShadow: '0 1px 8px rgba(0,0,0,0.3)',
          }}>
            La plataforma completa para asesores de pensiones en México. Diagnostica, gestiona el trámite IMSS y financia la Modalidad 40 de tus clientes.
          </p>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '40px' }}>
            {[
              { icon: '⊞', title: 'Diagnóstico Pensional', desc: 'Calculadora Ley 73/97 · Mod 10 · Mod 40 · Variables 2026' },
              { icon: '◎', title: 'Gestoría de Trámite IMSS', desc: 'Expediente · Seguimiento · Resolución de pensión' },
              { icon: '💰', title: 'Financiamiento Mod 40', desc: 'Corridas por financiera · Viabilidad · PDF de solicitud' },
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '10px',
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  backdropFilter: 'blur(4px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '17px', flexShrink: 0,
                }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: 'white', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>{f.title}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '0', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '24px' }}>
            {[
              { value: 'Ley 73', label: 'y Ley 97' },
              { value: '4', label: 'escenarios' },
              { value: '2026', label: 'actualizado' },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1,
                paddingRight: i < 2 ? '20px' : '0',
                borderRight: i < 2 ? '1px solid rgba(255,255,255,0.2)' : 'none',
                paddingLeft: i > 0 ? '20px' : '0'
              }}>
                <div style={{ fontSize: '22px', fontWeight: '900', color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>
          © 2026 KSE Pensiones · Diagnóstico Pensional para Asesores en México
        </div>
      </div>

      {/* ── Panel derecho — Formulario ── */}
      <div style={{
        flex: 1,
        background: '#F4F6FB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
      }}>
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
                  <span>⚠️</span>
                  <span style={{ color: '#dc2626', fontSize: '13px', fontWeight: '500' }}>{error}</span>
                </div>
              )}

              {razon === 'otra-sesion' && !error && (
                <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '10px', padding: '10px 14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📱</span>
                  <span style={{ color: '#92400E', fontSize: '13px', fontWeight: '500' }}>Tu sesión fue cerrada porque se inició sesión desde otro dispositivo.</span>
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Correo electrónico
                  </label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="tu@correo.com"
                    style={{ display: 'block', width: '100%', padding: '13px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: '#FAFBFC', fontFamily: 'inherit' }}
                    onFocus={e => { e.target.style.borderColor = NARANJA; e.target.style.boxShadow = `0 0 0 3px ${NARANJA}20` }}
                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
                  />
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                    Contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                      placeholder="••••••••"
                      style={{ display: 'block', width: '100%', padding: '13px 48px 13px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: '#FAFBFC', fontFamily: 'inherit' }}
                      onFocus={e => { e.target.style.borderColor = NARANJA; e.target.style.boxShadow = `0 0 0 3px ${NARANJA}20` }}
                      onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
                    />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', padding: '4px' }}>
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
                  style={{ display: 'block', width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: loading ? '#94a3b8' : `linear-gradient(135deg, ${NARANJA}, #ff8c3a)`, color: 'white', fontSize: '15px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : `0 4px 16px ${NARANJA}50`, letterSpacing: '0.3px' }}>
                  {loading ? 'Iniciando sesión...' : 'Iniciar sesión →'}
                </button>
              </form>

              <div style={{ marginTop: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                🔒 Conexión segura · Datos cifrados con SSL
              </div>
            </>
          ) : (
            <>
              <button onClick={() => { setMode('login'); setError(null); setMessage(null) }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '13px', fontWeight: '600', padding: '0 0 20px', marginLeft: '-2px' }}>
                ← Volver
              </button>
              <h2 style={{ fontSize: '22px', fontWeight: '800', color: AZUL, margin: '0 0 6px', textAlign: 'center' }}>Recuperar contraseña</h2>
              <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 24px', textAlign: 'center' }}>Te enviaremos un enlace para restablecer tu contraseña.</p>
              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>⚠️ {error}</div>}
              {message && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 14px', color: '#16a34a', fontSize: '13px', marginBottom: '16px' }}>✓ {message}</div>}
              <form onSubmit={handleRecover}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#374151', marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Correo</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@correo.com"
                    style={{ display: 'block', width: '100%', padding: '13px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', background: '#FAFBFC', fontFamily: 'inherit' }} />
                </div>
                <button type="submit" disabled={loading}
                  style={{ display: 'block', width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: loading ? '#94a3b8' : `linear-gradient(135deg, ${NARANJA}, #ff8c3a)`, color: 'white', fontSize: '15px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: `0 4px 16px ${NARANJA}50` }}>
                  {loading ? 'Enviando...' : 'Enviar enlace →'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
