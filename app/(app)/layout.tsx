'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { SofiaChat } from '@/components/SofiaChat'

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
  { href: '/reportes',       label: 'Reportes',       icon: '📋' },
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
  const [showNotif, setShowNotif] = useState(false)
  const [notificaciones, setNotificaciones] = useState<any[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [loadingNotif, setLoadingNotif] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showCambiarPwd, setShowCambiarPwd] = useState(false)
  const [pwdNueva, setPwdNueva] = useState('')
  const [pwdConfirmar, setPwdConfirmar] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdGuardando, setPwdGuardando] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
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
      const w = window.innerWidth
      if (w < 640) { setIsMobile(true); setCollapsed(true) }
      else if (w < 900) { setIsMobile(false); setCollapsed(true) }
      else { setIsMobile(false); setCollapsed(false) }
    }
    checkWidth()
    window.addEventListener('resize', checkWidth)
    return () => window.removeEventListener('resize', checkWidth)
  }, [])

  const [isAdmin, setIsAdmin] = useState(false)
  const [userRol, setUserRol] = useState('')
  const [rolCargado, setRolCargado] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setChecking(false)
      setUserEmail(session.user.email ?? '')

      // Cargar notificaciones
      cargarNotificaciones(session.user.id)

      // Usar cache si es el mismo usuario — evita llamada a DB en cada navegacion
      if (_perfilCache && _perfilUserId === session.user.id) {
        setUserName(_perfilCache.nombre)
        setRazonSocial(_perfilCache.razonSocial)
        setAsesorLogo(_perfilCache.logo)
        setIsAdmin(_perfilCache.isAdmin)
        setUserRol(_perfilCache.rol)
        setRolCargado(true)
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

            _perfilCache = { nombre, razonSocial, logo, isAdmin, rol }
            _perfilUserId = session.user.id

            setUserName(nombre)
            setRazonSocial(razonSocial)
            setAsesorLogo(logo)
            setIsAdmin(isAdmin)
            setUserRol(rol)
            setRolCargado(true)
            if (!data.nombre && !data.razon_social && !window.location.pathname.includes('configuracion')) {
              router.push('/configuracion')
            }

            // Polling cada 60 segundos
            const interval = setInterval(() => cargarNotificaciones(session.user.id), 60000)
            return () => clearInterval(interval)
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

  async function buscarGlobal(q: string) {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    setSearchLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const uid = session.user.id

    const [{ data: clientes }, { data: financiamientos }, { data: diagnosticos }] = await Promise.all([
      supabase.from('clientes').select('id, nombre, nss, telefono, etapa_kanban').eq('asesor_id', uid).ilike('nombre', `%${q}%`).limit(5),
      supabase.from('financiamientos').select('id, clientes(nombre), instituciones_financieras(nombre), monto_total, estatus').eq('asesor_id', uid).limit(3),
      supabase.from('diagnosticos').select('id, clientes(nombre), estatus, created_at').eq('asesor_id', uid).limit(3),
    ])

    const results: any[] = []
    ;(clientes ?? []).forEach((c: any) => results.push({ tipo: 'cliente', id: c.id, titulo: c.nombre, sub: c.nss ? `NSS: ${c.nss}` : c.telefono ?? '', icono: '👤', url: '/clientes' }))
    ;(financiamientos ?? []).filter((f: any) => f.clientes?.nombre?.toLowerCase().includes(q.toLowerCase())).forEach((f: any) => results.push({ tipo: 'financiamiento', id: f.id, titulo: f.clientes?.nombre ?? '—', sub: `${f.instituciones_financieras?.nombre ?? ''} · ${f.estatus}`, icono: '💳', url: '/financiamiento' }))
    ;(diagnosticos ?? []).filter((d: any) => d.clientes?.nombre?.toLowerCase().includes(q.toLowerCase())).forEach((d: any) => results.push({ tipo: 'diagnostico', id: d.id, titulo: d.clientes?.nombre ?? '—', sub: `Diagnóstico · ${d.estatus}`, icono: '📊', url: '/calculadora' }))

    setSearchResults(results)
    setSearchLoading(false)
  }

  async function cargarNotificaciones(uid: string) {
    const res = await fetch(`/api/notificaciones?uid=${uid}`)
    if (res.ok) {
      const data = await res.json()
      setNotificaciones(data.notificaciones ?? [])
      setNoLeidas(data.no_leidas ?? 0)
    }
  }

  async function marcarLeida(id?: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/notificaciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: session.user.id, id, todas: !id }),
    })
    await cargarNotificaciones(session.user.id)
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

        {/* Búsqueda global — oculta en móvil */}
        {!isMobile && (
        <div style={{ flex: 1, maxWidth: '400px', position: 'relative' as const, margin: '0 12px' }}>
          <div style={{ position: 'relative' as const }}>
            <span style={{ position: 'absolute' as const, left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#9CA3AF' }}>🔍</span>
            <input
              type="text"
              placeholder="Buscar clientes, diagnósticos, financiamientos..."
              value={searchQuery}
              onChange={e => buscarGlobal(e.target.value)}
              onFocus={() => setShowSearch(true)}
              style={{ width: '100%', padding: '6px 10px 6px 32px', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '12px', fontFamily: 'inherit', background: '#F8FAFC', boxSizing: 'border-box' as const, outline: 'none' }}
            />
          </div>
          {showSearch && searchQuery.length >= 2 && (
            <>
              <div style={{ position: 'fixed' as const, inset: 0, zIndex: 39 }} onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }} />
              <div style={{ position: 'absolute' as const, top: '38px', left: 0, right: 0, background: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 40, overflow: 'hidden' }}>
                {searchLoading ? (
                  <div style={{ padding: '16px', textAlign: 'center' as const, color: '#9CA3AF', fontSize: '12px' }}>Buscando...</div>
                ) : searchResults.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center' as const, color: '#9CA3AF', fontSize: '12px' }}>Sin resultados para "{searchQuery}"</div>
                ) : (
                  searchResults.map((r, i) => (
                    <div key={i} onClick={() => { router.push(r.url); setShowSearch(false); setSearchQuery(''); setSearchResults([]) }}
                      style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                      <span style={{ fontSize: '18px' }}>{r.icono}</span>
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: '700', color: '#111827', margin: '0 0 1px' }}>{r.titulo}</p>
                        <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>{r.sub}</p>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#9CA3AF', background: '#F4F6FB', padding: '2px 6px', borderRadius: '4px' }}>{r.tipo}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        )}

        {/* Campanita notificaciones */}
        <div style={{ position: 'relative' as const, marginRight: '4px', marginLeft: 'auto' }}>
          <button onClick={() => setShowNotif(p => !p)}
            style={{ position: 'relative' as const, padding: '6px 8px', background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: '16px' }}>🔔</span>
            {noLeidas > 0 && (
              <span style={{ position: 'absolute' as const, top: '0px', right: '0px', background: '#EF4444', color: 'white', fontSize: '9px', fontWeight: '700', borderRadius: '50%', width: '15px', height: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {noLeidas > 9 ? '9+' : noLeidas}
              </span>
            )}
          </button>
          {showNotif && (
            <>
              <div style={{ position: 'fixed' as const, inset: 0, zIndex: 39 }} onClick={() => setShowNotif(false)} />
              <div style={{ position: 'absolute' as const, right: 0, top: '40px', width: '340px', background: 'white', border: '1px solid #E5E7EB', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 40, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#111827', margin: 0 }}>
                    Notificaciones
                    {noLeidas > 0 && <span style={{ background: '#EF4444', color: 'white', fontSize: '10px', padding: '1px 6px', borderRadius: '10px', marginLeft: '6px' }}>{noLeidas}</span>}
                  </p>
                  {noLeidas > 0 && (
                    <button onClick={() => marcarLeida()} style={{ fontSize: '11px', color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Marcar todas leídas
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: '380px', overflowY: 'auto' as const }}>
                  {notificaciones.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center' as const, color: '#9CA3AF', fontSize: '13px' }}>Sin notificaciones</div>
                  ) : notificaciones.map((n: any) => (
                    <div key={n.id}
                      onClick={() => { marcarLeida(n.id); setShowNotif(false); if (n.url_destino) router.push(n.url_destino) }}
                      style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', cursor: n.url_destino ? 'pointer' : 'default', background: n.leida ? 'white' : '#EFF6FF', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '18px', flexShrink: 0 }}>
                        {n.tipo === 'cliente_sin_contacto' ? '👤' : n.tipo === 'financiamiento_por_vencer' ? '💳' : n.tipo === 'actividad_pendiente' ? '📅' : n.tipo === 'solicitud_canalizacion' ? '🔄' : '🔔'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '12px', fontWeight: '700', color: '#111827', margin: '0 0 2px' }}>{n.titulo}</p>
                        <p style={{ fontSize: '11px', color: '#6B7280', margin: '0 0 4px', lineHeight: 1.4 }}>{n.mensaje}</p>
                        <p style={{ fontSize: '10px', color: '#9CA3AF', margin: 0 }}>
                          {new Date(n.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {!n.leida && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3B82F6', flexShrink: 0, marginTop: '4px' }} />}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

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

        {/* ── SIDEBAR — oculto en móvil ── */}
        <div style={{
          width: isMobile ? '0px' : collapsed ? '48px' : '200px',
          flexShrink: 0,
          background: 'white',
          borderRight: isMobile ? 'none' : '1px solid #e2e8f0',
          display: isMobile ? 'none' : 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s',
          overflow: 'hidden',
        }}>
          {/* Nav items — ocultos hasta que el rol esté cargado para evitar flash */}
          <div style={{ flex: 1, padding: '8px 0', visibility: rolCargado ? 'visible' : 'hidden' }}>
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
        <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', background: '#FAFAFA', paddingBottom: isMobile ? '60px' : 0 }}>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>

      {/* ── NAVEGACIÓN INFERIOR MÓVIL ── */}
      {isMobile && (
        <nav style={{ position: 'fixed' as const, bottom: 0, left: 0, right: 0, height: '56px', background: 'white', borderTop: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 50, padding: '0 4px' }}>
          {NAV_ITEMS.filter(item => {
            if (item.adminOnly && !isAdmin) return false
            if (item.orgAdminOnly && userRol !== 'org_admin') return false
            return true
          }).slice(0, 5).filter(() => rolCargado).map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <button key={item.href} onClick={() => router.push(item.href)}
                style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px', padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: '8px', flex: 1 }}>
                <span style={{ fontSize: '18px', opacity: isActive ? 1 : 0.5 }}>{item.icon}</span>
                <span style={{ fontSize: '9px', fontWeight: isActive ? '700' : '400', color: isActive ? AZUL : '#9CA3AF', fontFamily: 'inherit' }}>{item.label}</span>
                {isActive && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: AZUL }} />}
              </button>
            )
          })}
        </nav>
      )}

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
      {/* ── Sofía IA — chat flotante ── */}
      <SofiaChat />

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