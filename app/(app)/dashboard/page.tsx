'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const AZUL = '#1F3A5F'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

interface KPIs {
  totalClientes: number
  diagnosticosRealizados: number
  seguimientosPendientesHoy: number
  seguimientosPendientesTotal: number
}

interface Actividad {
  id: string
  titulo: string
  tipo: string
  fecha_programada: string
  estatus: string
  clientes?: { nombre: string }
}

const TIPO_ICONS: Record<string, string> = {
  llamada: '📞',
  whatsapp: '💬',
  cita: '📅',
  email: '✉️',
  nota: '📝',
}

export default function DashboardPage() {
  const supabase = createClientComponentClient()
  const [kpis, setKpis] = useState<KPIs>({ totalClientes: 0, diagnosticosRealizados: 0, seguimientosPendientesHoy: 0, seguimientosPendientesTotal: 0 })
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string>('')

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const uid = session.user.id
      setUserId(uid)

      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString()

      const [
        { count: totalClientes },
        { count: diagnosticosRealizados },
        { count: seguimientosPendientesHoy },
        { count: seguimientosPendientesTotal },
        { data: actividadesData },
      ] = await Promise.all([
        supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('asesor_id', uid),
        supabase.from('diagnosticos').select('*', { count: 'exact', head: true }).eq('asesor_id', uid),
        supabase.from('actividades').select('*', { count: 'exact', head: true }).eq('asesor_id', uid).eq('estatus', 'pendiente').gte('fecha_programada', startOfDay).lte('fecha_programada', endOfDay),
        supabase.from('actividades').select('*', { count: 'exact', head: true }).eq('asesor_id', uid).eq('estatus', 'pendiente'),
        supabase.from('actividades').select('id, titulo, tipo, fecha_programada, estatus, clientes(nombre)').eq('asesor_id', uid).eq('estatus', 'pendiente').order('fecha_programada', { ascending: true }).limit(5),
      ])

      setKpis({
        totalClientes: totalClientes ?? 0,
        diagnosticosRealizados: diagnosticosRealizados ?? 0,
        seguimientosPendientesHoy: seguimientosPendientesHoy ?? 0,
        seguimientosPendientesTotal: seguimientosPendientesTotal ?? 0,
      })
      setActividades((actividadesData as Actividad[]) ?? [])
      setLoading(false)
    }
    loadData()
  }, [])

  const fechaHoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const kpiCards = [
    { label: 'Clientes totales', value: kpis.totalClientes, icon: '👥', color: AZUL, bg: '#EEF2F8' },
    { label: 'Diagnósticos realizados', value: kpis.diagnosticosRealizados, icon: '📊', color: VERDE, bg: '#EEF7F1' },
    { label: 'Seguimientos hoy', value: kpis.seguimientosPendientesHoy, icon: '⏰', color: NARANJA, bg: '#FEF4EC' },
    { label: 'Pendientes totales', value: kpis.seguimientosPendientesTotal, icon: '📋', color: '#7C3AED', bg: '#F3EEFF' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ color: AZUL, fontSize: '20px', fontWeight: '700', margin: 0 }}>Dashboard</h1>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0', textTransform: 'capitalize' }}>{fechaHoy}</p>
        </div>
        <a href="/clientes" style={{ background: AZUL, color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', textDecoration: 'none' }}>
          + Nuevo cliente
        </a>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
            <div style={{ color: '#94a3b8', fontSize: '14px' }}>Cargando...</div>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
              {kpiCards.map((card, i) => (
                <div key={i} style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ width: '40px', height: '40px', background: card.bg, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                      {card.icon}
                    </div>
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: '700', color: card.color, lineHeight: 1, marginBottom: '4px' }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* Two columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Próximos seguimientos */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h2 style={{ color: AZUL, fontSize: '15px', fontWeight: '700', margin: 0 }}>Próximos seguimientos</h2>
                  <a href="/seguimiento" style={{ color: NARANJA, fontSize: '12px', fontWeight: '600', textDecoration: 'none' }}>Ver todos →</a>
                </div>
                {actividades.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: '13px' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                    Sin pendientes por ahora
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {actividades.map(act => (
                      <div key={act.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '18px', minWidth: '24px', textAlign: 'center' }}>
                          {TIPO_ICONS[act.tipo] ?? '📌'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.titulo}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {act.clientes?.nombre ?? 'Sin cliente'} · {act.fecha_programada ? new Date(act.fecha_programada).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'}
                          </div>
                        </div>
                        <div style={{ fontSize: '10px', background: '#FEF4EC', color: NARANJA, padding: '2px 8px', borderRadius: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                          {act.tipo}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Accesos rápidos */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
                <h2 style={{ color: AZUL, fontSize: '15px', fontWeight: '700', margin: '0 0 16px' }}>Accesos rápidos</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { href: '/calculadora', icon: '⊞', label: 'Nueva calculadora', desc: 'Diagnóstico pensional', color: AZUL },
                    { href: '/clientes', icon: '◎', label: 'Ver clientes', desc: 'Lista completa', color: VERDE },
                    { href: '/seguimiento', icon: '◷', label: 'Agenda de hoy', desc: `${kpis.seguimientosPendientesHoy} pendientes`, color: NARANJA },
                  ].map((item, i) => (
                    <a key={i} href={item.href} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #e2e8f0', textDecoration: 'none', transition: 'background 0.15s' }}>
                      <div style={{ width: '36px', height: '36px', background: item.color, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: 'white', flexShrink: 0 }}>
                        {item.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{item.label}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{item.desc}</div>
                      </div>
                      <div style={{ marginLeft: 'auto', color: '#cbd5e1', fontSize: '16px' }}>›</div>
                    </a>
                  ))}
                </div>

                {/* Disclaimer */}
                <div style={{ marginTop: '16px', padding: '10px 12px', background: '#FEF4EC', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                  <p style={{ fontSize: '11px', color: '#92400e', margin: 0, lineHeight: '1.5' }}>
                    ⚠️ Cálculos orientativos. Rendimientos AFORE son proyecciones, no garantías.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
