'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

const NARANJA = '#F05B21'
const AZUL = '#1B3A6B'

// Cache de perfil para evitar llamadas repetidas a Supabase en cada navegacion
let _perfilCache: { nombre: string; razonSocial: string; logo: string | null; isAdmin: boolean; rol: string } | null = null
let _perfilUserId: string | null = null

// Helpers para el flag de dirty state de la calculadora
const getKseDirty = () => typeof window !== 'undefined' && !!(window as any).__kse_dirty
const clearKseDirty = () => { if (typeof window !== 'undefined') (window as any).__kse_dirty = false }

type NavItem = { href: string; label: string; icon: string; adminOnly?: boolean; orgAdminOnly?: boolean }

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',      label: 'Mi día',        icon: '◈' },
  { href: '/org-admin',     label: 'Mi Equipo', icon: '👥', orgAdminOnly: true },
  { href: '/clientes',       label: 'Clientes',       icon: '◎' },
  { href: '/seguimiento',    label: 'Seguimiento',    icon: '◷' },
  { href: '/calculadora',    label: 'Calculadora',    icon: '⊞' },
  { href: '/financiamiento', label: 'Financiamiento', icon: '◐' },
  { href: '/configuracion',  label: 'Configuración',  icon: '⚙' },
  { href: '/admin',          label: 'Admin Fórmulas', icon: '🔬', adminOnly: true },
  { href: '/super-admin',   label: 'Dashboard Negocio', icon: '📊', adminOnly: true },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [asesorLogo, setAsesorLogo] = useState<string | null>(null)
  const [razonSocial, setRazonSocial] = useState('')
  const [checking, setChecking] = useState(true)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showCambiarPwd, setShowCambiarPwd] = useState(false)
  const [pwdNueva, setPwdNueva] = useState('')
  const [pwdConfirmar, setPwdConfirmar] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdGuardando, setPwdGuardando] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [showNavGuard, setShowNavGuard] = useState(false)
  const pendingNavRef = useRef<string | null>(null)

  useEffect(() => {
    // Detectar cuando la sesión es invalidada por otro login en otro dispositivo
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        _perfilCache = null
        _perfilUserId = null
        router.push('/login?razon=otra-sesion')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const checkWidth = () => {
      if (window.innerWidth < 900) setCollapsed(true)
    }
    checkWidth()
    window.addEventListener('resize', checkWidth)
    return () => window.removeEventListener('resize', checkWidth)
  }, [])

  const [isAdmin, setIsAdmin] = useState(false)
  const [userRol, setUserRol] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setChecking(false)
      setUserEmail(session.user.email ?? '')

      // Usar cache si es el mismo usuario — evita llamada a DB en cada navegacion
      if (_perfilCache && _perfilUserId === session.user.id) {
        setUserName(_perfilCache.nombre)
        setRazonSocial(_perfilCache.razonSocial)
        setAsesorLogo(_perfilCache.logo)
        setIsAdmin(_perfilCache.isAdmin)
        setUserRol(_perfilCache.rol)
        return
      }

      supabase.from('perfiles_usuario').select('nombre, razon_social, logo_url, is_admin, rol').eq('id', session.user.id).single()
        .then(({ data }) => {
          if (data) {
            const nombre = data.nombre || session.user.email || ''
            const razonSocial = data.razon_social || data.nombre || ''
            const logo = data.logo_url || null
            const isAdmin = !!data.is_admin
            const rol = data.rol || (data.is_admin ? 'super_admin' : 'asesor')

            // Guardar en cache
            _perfilCache = { nombre, razonSocial, logo, isAdmin, rol }
            _perfilUserId = session.user.id

            setUserName(nombre)
            setRazonSocial(razonSocial)
            setAsesorLogo(logo)
            setIsAdmin(isAdmin)
            setUserRol(rol)
            if (!data.nombre && !data.razon_social && !window.location.pathname.includes('configuracion')) {
              router.push('/configuracion')
            }
          }
        })
    })
  }, [])

  function generarPassword() {
    const chars = 'abcdefghijkmnpqrstuvwxyz'
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const nums = '23456789'
    const syms = '!@#$%&*'
    let pwd = upper[Math.floor(Math.random() * upper.length)]
      + chars[Math.floor(Math.random() * chars.length)]
      + chars[Math.floor(Math.random() * chars.length)]
      + nums[Math.floor(Math.random() * nums.length)]
      + nums[Math.floor(Math.random() * nums.length)]
      + syms[Math.floor(Math.random() * syms.length)]
      + upper[Math.floor(Math.random() * upper.length)]
      + chars[Math.floor(Math.random() * chars.length)]
      + nums[Math.floor(Math.random() * nums.length)]
      + syms[Math.floor(Math.random() * syms.length)]
    return pwd.split('').sort(() => Math.random() - 0.5).join('')
  }

  function validarPassword(pwd: string): string {
    if (pwd.length < 10) return 'Mínimo 10 caracteres'
    if (!/[A-Z]/.test(pwd)) return 'Debe incluir al menos una mayúscula'
    if (!/[a-z]/.test(pwd)) return 'Debe incluir al menos una minúscula'
    if (!/[0-9]/.test(pwd)) return 'Debe incluir al menos un número'
    if (!/[!@#$%&*]/.test(pwd)) return 'Debe incluir al menos un símbolo (!@#$%&*)'
    return ''
  }

  async function cambiarPassword() {
    const err = validarPassword(pwdNueva)
    if (err) { setPwdError(err); return }
    if (pwdNueva !== pwdConfirmar) { setPwdError('Las contraseñas no coinciden'); return }
    setPwdGuardando(true); setPwdError('')
    const { error } = await supabase.auth.updateUser({ password: pwdNueva })
    if (error) setPwdError(error.message)
    else { setShowCambiarPwd(false); setPwdNueva(''); setPwdConfirmar('') }
    setPwdGuardando(false)
  }

  async function handleLogout() {
    _perfilCache = null
    _perfilUserId = null
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (checking) return (
    <div style={{ display: 'flex', height: '100vh', background: 'white', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#94a3b8', fontSize: '14px' }}>Cargando...</div>
    </div>
  )

  const firstName = userName.split(' ')[0]
  const displayName = razonSocial || firstName

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'white' }}>

      {/* ── TOP NAVBAR ── */}
      <div style={{
        height: '48px', flexShrink: 0,
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center',
        padding: '0 16px',
        gap: '12px',
        zIndex: 40,
      }}>
        {/* Logo */}
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}>
          <img src="/logo-kse.png" alt="KSE" style={{ height: '28px', objectFit: 'contain' }} />
          {!collapsed && <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', letterSpacing: '0.5px' }}>Pensiones</span>}
        </Link>

        <div style={{ flex: 1 }} />

        {/* Right — usuario */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowUserMenu(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '6px', overflow: 'hidden', background: '#F4F6FB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {asesorLogo
                ? <img src={asesorLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                : <span style={{ fontSize: '10px', fontWeight: '700', color: AZUL }}>{firstName.charAt(0).toUpperCase()}</span>
              }
            </div>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>▾</span>
          </button>

          {showUserMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setShowUserMenu(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'white', borderRadius: '10px', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', minWidth: '200px', overflow: 'hidden', zIndex: 50 }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', background: '#F8FAFC' }}>
                  <img src="/logo-kse.png" alt="KSE" style={{ height: '18px', objectFit: 'contain', marginBottom: '6px', display: 'block', opacity: 0.7 }} />
                  <div style={{ fontSize: '13px', fontWeight: '700', color: AZUL }}>{userName}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{userEmail}</div>
                </div>
                <div style={{ padding: '6px' }}>
                  <Link href="/configuracion" onClick={() => setShowUserMenu(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '6px', textDecoration: 'none', color: '#374151', fontSize: '13px' }}>
                    ⚙️ Configuración
                  </Link>
                  <button onClick={() => { setShowUserMenu(false); setShowCambiarPwd(true) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#374151', fontSize: '13px', textAlign: 'left' as const, fontFamily: 'inherit' }}>
                    🔒 Cambiar contraseña
                  </button>
                  <div style={{ borderTop: '1px solid #f1f5f9', margin: '4px 0' }} />
                  <button onClick={handleLogout}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '13px', textAlign: 'left' as const, fontFamily: 'inherit' }}>
                    ↩ Cerrar sesión
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── BODY: sidebar + content ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── SIDEBAR ── */}
        <div style={{
          width: collapsed ? '48px' : '200px',
          flexShrink: 0,
          background: 'white',
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s',
          overflow: 'hidden',
        }}>
          {/* Nav items */}
          <div style={{ flex: 1, padding: '8px 0' }}>
            {NAV_ITEMS.filter(item => {
              if (item.adminOnly && !isAdmin) return false
              if (item.orgAdminOnly && userRol !== 'org_admin') return false
              return true
            }).map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              const handleNavClick = (e: React.MouseEvent) => {
                if (isActive) return
                if (getKseDirty()) {
                  e.preventDefault()
                  pendingNavRef.current = item.href
                  setShowNavGuard(true)
                }
              }
              return (
                <Link key={item.href} href={item.href} onClick={handleNavClick} style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: collapsed ? '9px 14px' : '8px 16px',
                    borderLeft: `3px solid ${isActive ? NARANJA : 'transparent'}`,
                    background: isActive ? '#fff5f2' : 'transparent',
                    color: isActive ? NARANJA : '#64748b',
                    fontSize: '13px',
                    fontWeight: isActive ? '600' : '400',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}>
                    <span style={{ fontSize: '14px', flexShrink: 0, width: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Collapse toggle */}
          <div style={{ padding: '8px', borderTop: '1px solid #f1f5f9' }}>
            <button onClick={() => setCollapsed(p => !p)}
              style={{ width: '100%', padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: '6px' }}>
              {collapsed ? '→' : '← Colapsar'}
            </button>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', background: '#FAFAFA' }}>
          {children}
        </main>
      </div>

      {/* ── Modal guardia de navegación — calculadora con cambios sin guardar ── */}
      {showNavGuard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '400px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ background: '#F59E0B', padding: '16px 20px' }}>
              <p style={{ fontSize: '14px', fontWeight: '800' as const, color: 'white', margin: 0 }}>⚠️ Tienes un diagnóstico sin guardar</p>
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 20px', lineHeight: 1.6 }}>
                Si sales ahora perderás el avance actual — los datos cargados, la configuración de Mod 40 y el análisis generado no se guardarán.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setShowNavGuard(false); pendingNavRef.current = null }}
                  style={{ flex: 1, padding: '10px', background: '#F8FAFC', color: '#374151', border: '1px solid #E5E7EB', fontSize: '13px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ← Volver y guardar
                </button>
                <button onClick={() => {
                  clearKseDirty()
                  const dest = pendingNavRef.current
                  pendingNavRef.current = null
                  setShowNavGuard(false)
                  if (dest) router.push(dest)
                }}
                  style={{ flex: 1, padding: '10px', background: '#DC2626', color: 'white', border: 'none', fontSize: '13px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Salir sin guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Modal cambiar contraseña ── */}
      {showCambiarPwd && (
        <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', width: '100%', maxWidth: '400px', borderRadius: '12px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ background: AZUL, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '14px', fontWeight: '700' as const, color: 'white', margin: 0 }}>🔒 Cambiar contraseña</p>
              <button onClick={() => { setShowCambiarPwd(false); setPwdNueva(''); setPwdConfirmar(''); setPwdError('') }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600' as const, color: '#6B7280' }}>Nueva contraseña</label>
                  <button onClick={() => { const p = generarPassword(); setPwdNueva(p); setPwdConfirmar(p) }}
                    style={{ fontSize: '11px', color: NARANJA, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' as const, fontFamily: 'inherit' }}>
                    🎲 Generar
                  </button>
                </div>
                <input type="text" value={pwdNueva} onChange={e => { setPwdNueva(e.target.value); setPwdError('') }}
                  placeholder="Mínimo 10 chars, mayúscula, número, símbolo"
                  style={{ width: '100%', padding: '9px 10px', border: `1px solid ${pwdError ? '#EF4444' : '#D1D5DB'}`, borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit', fontWeight: '600' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600' as const, color: '#6B7280', display: 'block', marginBottom: '4px' }}>Confirmar contraseña</label>
                <input type="password" value={pwdConfirmar} onChange={e => { setPwdConfirmar(e.target.value); setPwdError('') }}
                  placeholder="Repite la contraseña"
                  style={{ width: '100%', padding: '9px 10px', border: `1px solid ${pwdError ? '#EF4444' : '#D1D5DB'}`, borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
              </div>
              <div style={{ background: '#F8FAFC', borderRadius: '6px', padding: '10px 12px', fontSize: '11px', color: '#6B7280', lineHeight: 1.6 }}>
                <strong style={{ color: '#374151' }}>Criterios de seguridad:</strong><br />
                {['10+ caracteres', 'Una mayúscula', 'Una minúscula', 'Un número', 'Un símbolo (!@#$%&*)'].map(c => (
                  <span key={c} style={{ display: 'inline-block', marginRight: '8px', color: pwdNueva && !validarPassword(pwdNueva) ? '#16A34A' : '#9CA3AF' }}>✓ {c}</span>
                ))}
              </div>
              {pwdError && <p style={{ fontSize: '12px', color: '#EF4444', margin: 0, fontWeight: '600' }}>⚠️ {pwdError}</p>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setShowCambiarPwd(false); setPwdNueva(''); setPwdConfirmar(''); setPwdError('') }}
                  style={{ flex: 1, padding: '10px', background: '#F8FAFC', color: '#374151', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '13px', fontWeight: '600' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancelar
                </button>
                <button onClick={cambiarPassword} disabled={pwdGuardando || !pwdNueva}
                  style={{ flex: 1, padding: '10px', background: AZUL, color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit', opacity: pwdGuardando || !pwdNueva ? 0.6 : 1 }}>
                  {pwdGuardando ? 'Guardando...' : 'Actualizar contraseña'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
