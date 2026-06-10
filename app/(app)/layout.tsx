'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

const AZUL = '#1B3A6B'
const NARANJA = '#F05B21'

type NavItem = { href: string; label: string; icon: string }

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',     label: 'Mi día',     icon: '◈' },
  { href: '/clientes',      label: 'Clientes',      icon: '◎' },
  { href: '/calculadora',   label: 'Calculadora',   icon: '⊞' },
  { href: '/seguimiento',   label: 'Seguimiento',   icon: '◷' },
  { href: '/configuracion', label: 'Configuración', icon: '⚙' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [userName, setUserName] = useState<string>('')
  const [collapsed, setCollapsed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setChecking(false)
      supabase.from('perfiles_usuario').select('nombre').eq('id', session.user.id).single()
        .then(({ data }) => {
          setUserName(data?.nombre || session.user.email || '')
        })
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const sidebarWidth = collapsed ? 64 : 220

  if (checking) return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F4F6FB', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#94a3b8', fontSize: '14px' }}>Cargando...</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F4F6FB' }}>
      <div style={{ width: sidebarWidth, minWidth: sidebarWidth, background: NARANJA, display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease', overflow: 'hidden' }}>
        <div style={{ height: '56px', display: 'flex', alignItems: 'center', padding: collapsed ? '0 16px' : '0 20px', borderBottom: '1px solid rgba(0,0,0,0.12)', gap: '10px', flexShrink: 0 }}>
          <div style={{ width: '32px', height: '32px', minWidth: '32px', borderRadius: '8px', overflow: 'hidden', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px' }}><img src='/logo-kse.png' alt='KSE' style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
          {!collapsed && <div>
            <div style={{ color: 'white', fontSize: '14px', fontWeight: '700', lineHeight: 1.2, whiteSpace: 'nowrap' }}>KSE Pensiones</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', whiteSpace: 'nowrap' }}>Asesor CRM</div>
          </div>}
        </div>
        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: collapsed ? '10px 16px' : '10px 20px', margin: '2px 8px', borderRadius: '8px', background: active ? 'rgba(255,255,255,0.15)' : 'transparent', borderLeft: active ? `3px solid ${NARANJA}` : '3px solid transparent', cursor: 'pointer' }}>
                  <span style={{ fontSize: '16px', color: active ? 'white' : 'rgba(255,255,255,0.60)', minWidth: '20px', textAlign: 'center' }}>{item.icon}</span>
                  {!collapsed && <span style={{ color: active ? 'white' : 'rgba(255,255,255,0.70)', fontSize: '13px', fontWeight: active ? '600' : '400', whiteSpace: 'nowrap' }}>{item.label}</span>}
                </div>
              </Link>
            )
          })}
        </nav>
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.12)', padding: '12px 8px' }}>
          <button onClick={() => setCollapsed(c => !c)} style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: '8px', width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '8px' }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>{collapsed ? '›' : '‹'}</span>
            {!collapsed && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>Colapsar</span>}
          </button>
          {!collapsed && userName && <div style={{ padding: '8px 12px', marginBottom: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px' }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', marginBottom: '2px' }}>Asesor</div>
            <div style={{ color: 'white', fontSize: '12px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</div>
          </div>}
          <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: '8px', width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '16px' }}>⎋</span>
            {!collapsed && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>Cerrar sesión</span>}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: '56px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 24px', flexShrink: 0, gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>KSE Pensiones</span>
            <span style={{ color: '#94a3b8', fontSize: '12px', margin: '0 6px' }}>/</span>
            <span style={{ color: AZUL, fontSize: '13px', fontWeight: '600' }}>{NAV_ITEMS.find(n => pathname.startsWith(n.href))?.label ?? 'Dashboard'}</span>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '12px' }}>{new Date().toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
      </div>
    </div>
  )
}
