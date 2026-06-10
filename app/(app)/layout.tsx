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
  { href: '/calculadora',   label: 'Calculadora',    icon: '⊞' },
  { href: '/seguimiento',   label: 'Seguimiento',    icon: '◷' },
  { href: '/configuracion', label: 'Configuración',  icon: '⚙' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [checking, setChecking] = useState(true)
  const [showUserMenu, setShowUserMenu] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setChecking(false)
      setUserEmail(session.user.email ?? '')
      supabase.from('perfiles_usuario').select('nombre').eq('id', session.user.id).single()
        .then(({ data }) => setUserName(data?.nombre || session.user.email || ''))
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (checking) return (
    <div style={{ display: 'flex', height: '100vh', background: '#F4F6FB', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#94a3b8', fontSize: '14px' }}>Cargando...</div>
    </div>
  )

  const firstName = userName.split(' ')[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#F4F6FB' }}>

      {/* ── NAVBAR ── */}
      <nav style={{
        background: NARANJA,
        height: '56px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: '4px',
        boxShadow: '0 2px 12px rgba(240,91,33,0.35)',
        position: 'relative',
        zIndex: 40,
      }}>

        {/* Logo */}
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginRight: '16px', flexShrink: 0 }}>
          <div style={{ width: '32px', height: '32px', background: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px', overflow: 'hidden' }}>
            <img src="/logo-kse.png" alt="KSE" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ color: 'white', fontSize: '13px', fontWeight: '800', lineHeight: 1.2, letterSpacing: '-0.3px' }}>KSE Pensiones</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '9px', lineHeight: 1 }}>Asesor CRM</div>
          </div>
        </Link>

        {/* Divider */}
        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.25)', marginRight: '12px', flexShrink: 0 }} />

        {/* Nav items */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1 }}>
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  background: isActive ? 'rgba(0,0,0,0.20)' : 'transparent',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.75)',
                  fontSize: '13px',
                  fontWeight: isActive ? '700' : '500',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  borderBottom: isActive ? '2px solid white' : '2px solid transparent',
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{ fontSize: '14px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Right — usuario */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setShowUserMenu(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', color: 'white' }}>
            <div style={{ width: '26px', height: '26px', background: 'rgba(255,255,255,0.25)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: 'white', flexShrink: 0 }}>
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: 'white', lineHeight: 1.2 }}>{firstName}</div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.6)', lineHeight: 1 }}>Asesor</div>
            </div>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginLeft: '2px' }}>▾</span>
          </button>

          {/* Dropdown menu */}
          {showUserMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setShowUserMenu(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: 'white', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', minWidth: '200px', overflow: 'hidden', zIndex: 50 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#F8FAFC' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                    <img src="/logo-kse.png" alt="KSE" style={{ height: '24px', objectFit: 'contain' }} />
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: AZUL }}>{userName}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{userEmail}</div>
                </div>
                <div style={{ padding: '6px' }}>
                  <Link href="/configuracion" onClick={() => setShowUserMenu(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', textDecoration: 'none', color: '#374151', fontSize: '13px', fontWeight: '500' }}>
                    <span>⚙️</span> Configuración
                  </Link>
                  <button onClick={handleLogout}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 10px', borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '13px', fontWeight: '600', textAlign: 'left' }}>
                    <span>↩</span> Cerrar sesión
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Breadcrumb */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '6px 20px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>KSE Pensiones</span>
        <span style={{ fontSize: '11px', color: '#cbd5e1' }}>/</span>
        <span style={{ fontSize: '11px', fontWeight: '600', color: AZUL }}>
          {NAV_ITEMS.find(i => pathname === i.href || pathname.startsWith(i.href + '/'))?.label ?? 'Inicio'}
        </span>
      </div>

      {/* Contenido */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  )
}
