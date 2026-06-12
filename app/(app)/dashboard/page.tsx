'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F05B21'

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtPct = (n: number) => `${Math.round(n || 0)}%`

function MiDiaInner() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [nombreAsesor, setNombreAsesor] = useState('Asesor')
  const [filtroPeriodo, setFiltroPeriodo] = useState<'mes' | 'trimestre' | 'año'>('mes')

  // Data states
  const [clientes, setClientes] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const [diagnosticos, setDiagnosticos] = useState<any[]>([])
  const [actividades, setActividades] = useState<any[]>([])

  const hoy = new Date()
  const fechaStr = hoy.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // Date ranges
  const getRange = () => {
    const now = new Date()
    const start = new Date()
    if (filtroPeriodo === 'mes') start.setDate(1)
    else if (filtroPeriodo === 'trimestre') start.setMonth(now.getMonth() - 3)
    else start.setFullYear(now.getFullYear(), 0, 1)
    return { start, end: now }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      loadData(session.user.id)
    })
  }, [])

  async function loadData(uid: string) {
    setLoading(true)
    const { data: perfil } = await supabase.from('perfiles_usuario').select('nombre, razon_social').eq('id', uid).single()
    setNombreAsesor(perfil?.razon_social || perfil?.nombre || 'Asesor')

    const [{ data: cl }, { data: pg }, { data: dg }, { data: act }] = await Promise.all([
      supabase.from('clientes').select('*').eq('asesor_id', uid),
      supabase.from('pagos').select('*, clientes(nombre, servicio_contratado)').eq('asesor_id', uid),
      supabase.from('diagnosticos').select('*').eq('asesor_id', uid),
      supabase.from('actividades').select('*, clientes(nombre)').eq('asesor_id', uid),
    ])
    setClientes(cl ?? [])
    setPagos(pg ?? [])
    setDiagnosticos(dg ?? [])
    setActividades(act ?? [])
    setLoading(false)
  }

  // Computed metrics
  const { start } = getRange()
  const pagosPeriodo = pagos.filter(p => new Date(p.fecha_pago) >= start)
  const ingresosTotal = pagosPeriodo.reduce((s, p) => s + p.monto, 0)
  const ingresosAsesoria = pagosPeriodo.filter(p => p.clientes?.servicio_contratado === 'Diagnóstico').reduce((s, p) => s + p.monto, 0)
  const ingresosGestoria = pagosPeriodo.filter(p => p.clientes?.servicio_contratado === 'Trámite').reduce((s, p) => s + p.monto, 0)
  const ingresosCombo = pagosPeriodo.filter(p => p.clientes?.servicio_contratado === 'Combo').reduce((s, p) => s + p.monto, 0)
  const clientesActivos = clientes.filter(c => !['pensionado','cancelado','perdido'].includes(c.etapa_kanban || ''))
  const prospectos = clientes.filter(c => c.etapa_kanban === 'prospecto')
  const enTramite = clientes.filter(c => c.etapa_kanban === 'tramite')
  const pensionados = clientes.filter(c => c.etapa_kanban === 'pensionado')
  const tasaConversion = prospectos.length > 0 ? (pensionados.length / (prospectos.length + pensionados.length)) * 100 : 0
  const diagMes = diagnosticos.filter(d => new Date(d.created_at) >= start)
  const ticketPromedio = clientesActivos.length > 0 ? ingresosTotal / Math.max(clientesActivos.length, 1) : 0
  const porCobrar = clientes.reduce((s, c) => s + Math.max(0, (c.monto_acordado || 0) - (c.total_pagado || 0)), 0)
  
  // Agenda hoy
  const hoyStart = new Date(); hoyStart.setHours(0,0,0,0)
  const hoyEnd = new Date(); hoyEnd.setHours(23,59,59,999)
  const agendaHoy = actividades
    .filter(a => a.fecha_programada && new Date(a.fecha_programada) >= hoyStart && new Date(a.fecha_programada) <= hoyEnd)
    .sort((a, b) => new Date(a.fecha_programada).getTime() - new Date(b.fecha_programada).getTime())

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 48px)', color: '#94a3b8', fontSize: '14px' }}>
      Cargando tu día...
    </div>
  )

  const card = (content: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', ...style }}>
      {content}
    </div>
  )

  const sectionTitle = (title: string, subtitle?: string) => (
    <div style={{ marginBottom: '12px' }}>
      <p style={{ fontSize: '12px', fontWeight: '700', color: '#374151', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</p>
      {subtitle && <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{subtitle}</p>}
    </div>
  )

  const kpiBox = (label: string, value: string, sub?: string, color = '#374151') => (
    <div style={{ background: '#FAFAFA', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
      <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: '700', color }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{sub}</div>}
    </div>
  )

  const barWidth = (val: number, max: number) => max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0

  return (
    <div style={{ height: 'calc(100vh - 48px)', overflow: 'auto', background: '#FAFAFA' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
            Buenos días, <span style={{ color: NARANJA }}>{nombreAsesor}</span>
          </h1>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0', textTransform: 'capitalize' }}>{fechaStr}</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['mes','trimestre','año'] as const).map(p => (
            <button key={p} onClick={() => setFiltroPeriodo(p)}
              style={{ padding: '5px 12px', borderRadius: '6px', border: `1px solid ${filtroPeriodo === p ? NARANJA : '#e2e8f0'}`, background: filtroPeriodo === p ? '#fff5f2' : 'white', color: filtroPeriodo === p ? NARANJA : '#64748b', fontSize: '12px', fontWeight: filtroPeriodo === p ? '600' : '400', cursor: 'pointer' }}>
              {p === 'mes' ? 'Este mes' : p === 'trimestre' ? 'Trimestre' : 'Este año'}
            </button>
          ))}
          <button onClick={() => router.push('/clientes?nuevo=true')}
            style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', background: NARANJA, color: 'white', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
            + Nuevo cliente
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* KPIs top */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
          {[
            { label: 'Clientes activos', value: clientesActivos.length.toString(), color: AZUL },
            { label: 'Diagnósticos', value: diagMes.length.toString(), sub: 'Este período', color: '#8b5cf6' },
            { label: 'En trámite', value: enTramite.length.toString(), color: NARANJA },
            { label: 'Pensionados', value: pensionados.length.toString(), color: VERDE },
            { label: 'Ingresos', value: fmtMXN(ingresosTotal), color: VERDE },
            { label: 'Por cobrar', value: fmtMXN(porCobrar), color: '#f59e0b' },
          ].map((k, i) => kpiBox(k.label, k.value, k.sub, k.color))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>

          {/* Bloque Financiero */}
          {card(<>
            {sectionTitle('💰 Ingresos por línea de negocio')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              {kpiBox('Total bruto', fmtMXN(ingresosTotal), filtroPeriodo)}
              {kpiBox('Ticket promedio', fmtMXN(ticketPromedio), 'por cliente')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: 'Asesorías / Diagnóstico', value: ingresosAsesoria, color: AZUL },
                { label: 'Honorarios Gestoría', value: ingresosGestoria, color: VERDE },
                { label: 'Combo', value: ingresosCombo, color: '#8b5cf6' },
              ].map((item, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                    <span style={{ color: '#64748b' }}>{item.label}</span>
                    <span style={{ fontWeight: '600', color: '#374151' }}>{fmtMXN(item.value)}</span>
                  </div>
                  <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barWidth(item.value, ingresosTotal)}%`, background: item.color, borderRadius: '3px', transition: 'width 0.4s' }} />
                  </div>
                </div>
              ))}
            </div>
          </>)}

          {/* Bloque Comercial */}
          {card(<>
            {sectionTitle('📊 Efectividad comercial')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              {kpiBox('Tasa de conversión', fmtPct(tasaConversion), 'prospectos → clientes')}
              {kpiBox('Prospectos activos', prospectos.length.toString(), 'sin convertir')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: 'Prospecto', value: clientes.filter(c => c.etapa_kanban === 'prospecto').length, color: '#64748b' },
                { label: 'Diagnóstico', value: clientes.filter(c => c.etapa_kanban === 'diagnostico').length, color: '#3b82f6' },
                { label: 'Propuesta', value: clientes.filter(c => c.etapa_kanban === 'propuesta').length, color: '#8b5cf6' },
                { label: 'Seguimiento', value: clientes.filter(c => c.etapa_kanban === 'seguimiento').length, color: '#0891b2' },
                { label: 'Trámite IMSS', value: enTramite.length, color: NARANJA },
                { label: 'Pensionado', value: pensionados.length, color: VERDE },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', color: '#64748b', flex: 1 }}>{item.label}</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>{item.value}</span>
                  <div style={{ width: '60px', height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barWidth(item.value, clientes.length)}%`, background: item.color, borderRadius: '2px' }} />
                  </div>
                </div>
              ))}
            </div>
          </>)}

          {/* Agenda hoy */}
          {card(<>
            {sectionTitle('📅 Agenda de hoy', agendaHoy.length === 0 ? 'Sin actividades' : `${agendaHoy.length} actividad${agendaHoy.length !== 1 ? 'es' : ''}`)}
            {agendaHoy.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '12px' }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>✅</div>
                Día libre de actividades
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {agendaHoy.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px', background: '#FAFAFA', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                    <div style={{ width: '2px', height: '100%', minHeight: '32px', background: a.estatus === 'completado' ? VERDE : NARANJA, borderRadius: '1px', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{a.titulo}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {new Date(a.fecha_programada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        {a.clientes?.nombre && ` · ${a.clientes.nombre}`}
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: a.estatus === 'completado' ? '#f0fdf4' : '#fff5f2', color: a.estatus === 'completado' ? VERDE : NARANJA, fontWeight: '600' }}>
                      {a.estatus === 'completado' ? '✓' : '⏳'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <a href="/seguimiento" style={{ display: 'block', textAlign: 'center', marginTop: '10px', fontSize: '12px', color: NARANJA, textDecoration: 'none', fontWeight: '600' }}>
              Ver agenda completa →
            </a>
          </>)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

          {/* Pipeline value */}
          {card(<>
            {sectionTitle('🔄 Tubería de cobro', 'Clientes con trámite activo')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              {kpiBox('En proceso', enTramite.length.toString(), 'trámites activos', NARANJA)}
              {kpiBox('Por cobrar', fmtMXN(porCobrar), 'honorarios pendientes', '#f59e0b')}
              {kpiBox('Cobrado', fmtMXN(ingresosTotal), filtroPeriodo, VERDE)}
            </div>
            {enTramite.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>Sin clientes en trámite activo</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {enTramite.slice(0, 5).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', background: '#FAFAFA', borderRadius: '6px', border: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onClick={() => router.push('/clientes')}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: NARANJA, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '12px', color: '#374151', fontWeight: '500' }}>{c.nombre}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{fmtMXN(Math.max(0, (c.monto_acordado || 0) - (c.total_pagado || 0)))}</span>
                  </div>
                ))}
              </div>
            )}
          </>)}

          {/* Perfil de mercado */}
          {card(<>
            {sectionTitle('🎯 Perfil de tu mercado')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              {kpiBox('Ley 73', `${clientes.filter(c => c.ley === '73').length}`, 'clientes pre-97')}
              {kpiBox('Ley 97', `${clientes.filter(c => c.ley === '97').length}`, 'clientes post-97')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span style={{ color: '#64748b' }}>Régimen Ley 73</span>
                  <span style={{ fontWeight: '600', color: AZUL }}>{fmtPct(clientes.length > 0 ? (clientes.filter(c => c.ley === '73').length / clientes.length) * 100 : 0)}</span>
                </div>
                <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${clientes.length > 0 ? (clientes.filter(c => c.ley === '73').length / clientes.length) * 100 : 0}%`, background: AZUL, borderRadius: '3px' }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                  <span style={{ color: '#64748b' }}>Régimen Ley 97</span>
                  <span style={{ fontWeight: '600', color: '#0891b2' }}>{fmtPct(clientes.length > 0 ? (clientes.filter(c => c.ley === '97').length / clientes.length) * 100 : 0)}</span>
                </div>
                <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${clientes.length > 0 ? (clientes.filter(c => c.ley === '97').length / clientes.length) * 100 : 0}%`, background: '#0891b2', borderRadius: '3px' }} />
                </div>
              </div>
              <div style={{ marginTop: '4px', padding: '8px 10px', background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '11px', color: '#166534', fontWeight: '600' }}>
                  {diagMes.length} diagnósticos este período · {clientes.length} clientes totales
                </div>
              </div>
            </div>
          </>)}
        </div>

      </div>
    </div>
  )
}

export default function MiDiaPage() {
  return <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 48px)', color: '#94a3b8' }}>Cargando...</div>}><MiDiaInner /></Suspense>
}
