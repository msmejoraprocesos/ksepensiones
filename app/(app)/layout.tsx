'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

const NARANJA = '#F05B21'
const AZUL = '#1B3A6B'

type NavItem = { href: string; label: string; icon: string }

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',     label: 'Mi día',        icon: '◈' },
  { href: '/clientes',      label: 'Clientes',       icon: '◎' },
  { href: '/seguimiento',   label: 'Seguimiento',    icon: '◷' },
  { href: '/calculadora',   label: 'Calculadora',    icon: '⊞' },
  { href: '/configuracion', label: 'Configuración',  icon: '⚙' },
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
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setChecking(false)
      setUserEmail(session.user.email ?? '')
      supabase.from('perfiles_usuario').select('nombre, razon_social, logo_url').eq('id', session.user.id).single()
        .then(({ data }) => {
          if (data) {
            setUserName(data.nombre || session.user.email || '')
            setRazonSocial(data.razon_social || data.nombre || '')
            setAsesorLogo(data.logo_url || null)
            if (!data.nombre && !data.razon_social && !window.location.pathname.includes('configuracion')) {
              router.push('/configuracion')
            }
          }
        })
    })
  }, [])

  async function handleLogout() {
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
                  <button onClick={handleLogout}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '13px', textAlign: 'left' }}>
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
            {NAV_ITEMS.map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none', display: 'block' }}>
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
                    <span style={{ fontSize: '14px', flexShrink: 0 }}>{item.icon}</span>
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
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#FAFAFA' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
