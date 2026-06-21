'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F05B21'

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtPct = (n: number) => `${Math.round(n || 0)}%`
const fmtWeeks = (n: number) => n > 0 ? `${Math.round(n)} sem` : '—'

function MiDiaInner() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [nombreAsesor, setNombreAsesor] = useState('Asesor')
  const [filtroPeriodo, setFiltroPeriodo] = useState<'mes' | 'trimestre' | 'año'>('mes')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'mod10' | 'mod40' | 'combo'>('todos')

  const [clientes, setClientes] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const [pgErrorMsg, setPgErrorMsg] = useState<string | null>(null)
  const [diagnosticos, setDiagnosticos] = useState<any[]>([])
  const [actividades, setActividades] = useState<any[]>([])
  const [financieras, setFinancieras] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])

  const hoy = new Date()
  const fechaStr = hoy.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

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

    const [{ data: cl }, { data: pg, error: pgError }, { data: dg }, { data: act }, { data: fin }, { data: solf }] = await Promise.all([
      supabase.from('clientes').select('*').eq('asesor_id', uid),
      supabase.from('pagos').select('*').eq('asesor_id', uid),
      supabase.from('diagnosticos').select('*').eq('asesor_id', uid),
      supabase.from('actividades').select('*, clientes(nombre)').eq('asesor_id', uid),
      supabase.from('financieras').select('*').eq('activa', true),
      supabase.from('solicitudes_financiamiento').select('*, financieras(nombre)').eq('asesor_id', uid),
    ])
    setClientes(cl ?? [])
    if (pgError) {
      console.error('🔴 Error cargando pagos:', pgError)
      setPgErrorMsg(`${pgError.message}${pgError.hint ? ' | hint: ' + pgError.hint : ''}${pgError.code ? ' | code: ' + pgError.code : ''}`)
    } else {
      setPgErrorMsg(null)
    }
    setPagos(pg ?? [])
    setDiagnosticos(dg ?? [])
    setActividades(act ?? [])
    setFinancieras(fin ?? [])
    setSolicitudes(solf ?? [])
    setLoading(false)
  }

  // Date range
  const getStart = () => {
    const now = new Date()
    if (filtroPeriodo === 'mes') { const s = new Date(now); s.setDate(1); s.setHours(0,0,0,0); return s }
    if (filtroPeriodo === 'trimestre') { const s = new Date(now); s.setMonth(now.getMonth()-3); return s }
    return new Date(now.getFullYear(), 0, 1)
  }
  // Rango del periodo ANTERIOR equivalente (mismo tamaño de ventana, justo antes del actual) — para comparativos
  const getPrevRange = (currentStart: Date) => {
    const now = new Date()
    if (filtroPeriodo === 'mes') {
      const prevEnd = new Date(currentStart)
      const prevStart = new Date(currentStart); prevStart.setMonth(prevStart.getMonth() - 1)
      return { prevStart, prevEnd }
    }
    if (filtroPeriodo === 'trimestre') {
      const prevEnd = new Date(currentStart)
      const prevStart = new Date(currentStart); prevStart.setMonth(prevStart.getMonth() - 3)
      return { prevStart, prevEnd }
    }
    const prevStart = new Date(currentStart.getFullYear() - 1, 0, 1)
    const prevEnd = new Date(currentStart.getFullYear(), 0, 1)
    return { prevStart, prevEnd }
  }

  const start = getStart()
  const { prevStart, prevEnd } = getPrevRange(start)

  // Filtro por tipo: set de cliente_id que cumplen el filtro (null = sin filtro / 'todos')
  const clienteIdsFiltro: Set<string> | null =
    filtroTipo === 'todos' ? null :
    filtroTipo === 'mod10' ? new Set(diagnosticos.filter(d => d.mod10_activo).map(d => d.cliente_id)) :
    filtroTipo === 'mod40' ? new Set(diagnosticos.filter(d => d.mod40_activo).map(d => d.cliente_id)) :
    new Set(clientes.filter(c => c.servicio_contratado === 'Combo').map(c => c.id))

  const clientesFiltrados = clienteIdsFiltro ? clientes.filter(c => clienteIdsFiltro.has(c.id)) : clientes
  const pagosPeriodo = pagos
    .filter(p => new Date(p.fecha_pago) >= start)
    .filter(p => !clienteIdsFiltro || clienteIdsFiltro.has(p.cliente_id))

  // ── MÉTRICAS FINANCIERAS ──
  // Number(p.monto) por si Supabase devuelve la columna numeric/decimal como string (gotcha clásico de PostgREST)
  const ingresosTotal = pagosPeriodo.reduce((s, p) => s + (Number(p.monto) || 0), 0)
  // Comparativo vs periodo anterior equivalente
  const pagosPeriodoAnterior = pagos
    .filter(p => { const f = new Date(p.fecha_pago); return f >= prevStart && f < prevEnd })
    .filter(p => !clienteIdsFiltro || clienteIdsFiltro.has(p.cliente_id))
  const ingresosTotalAnterior = pagosPeriodoAnterior.reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const deltaIngresos = ingresosTotalAnterior > 0 ? ((ingresosTotal - ingresosTotalAnterior) / ingresosTotalAnterior) * 100 : null
  const clientesNuevosAnterior = clientes.filter(c => { const f = new Date(c.created_at); return f >= prevStart && f < prevEnd }).length
  const clientesNuevosPeriodo = clientesFiltrados.filter(c => { const f = new Date(c.created_at); return f >= start }).length
  const deltaClientesNuevos = clientesNuevosAnterior > 0 ? ((clientesNuevosPeriodo - clientesNuevosAnterior) / clientesNuevosAnterior) * 100 : null
  // tipo_servicio (no servicio_contratado) es el campo real que usa la página Clientes: asesoria | gestion | financiamiento | gestoria_global
  const servicioPorCliente = clientes.reduce((acc: Record<string, string>, c: any) => {
    acc[c.id] = c.tipo_servicio
    return acc
  }, {} as Record<string, string>)
  const ingresosAsesoria = pagosPeriodo.filter(p => servicioPorCliente[p.cliente_id] === 'asesoria').reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const ingresosGestoria = pagosPeriodo.filter(p => servicioPorCliente[p.cliente_id] === 'gestion').reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const ingresosFinanciamiento = pagosPeriodo.filter(p => servicioPorCliente[p.cliente_id] === 'financiamiento').reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const ingresosGestoriaGlobal = pagosPeriodo.filter(p => servicioPorCliente[p.cliente_id] === 'gestoria_global').reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const ingresosSinClasificar = pagosPeriodo.filter(p => !['asesoria','gestion','financiamiento','gestoria_global'].includes(servicioPorCliente[p.cliente_id])).reduce((s, p) => s + (Number(p.monto) || 0), 0)
  const comisionesFinancieras = solicitudes.filter(s => s.aprobada && new Date(s.created_at) >= start).reduce((sum, s) => sum + (Number(s.comision_cobrada) || 0), 0)
  const ingresosConComisiones = ingresosTotal + comisionesFinancieras
  const clientesUnicos = new Set(pagosPeriodo.map(p => p.cliente_id)).size
  // Ticket promedio = monto acordado promedio de todos los servicios con costo (independiente del periodo Mes/Trimestre/Año)
  const clientesConCosto = clientesFiltrados.filter(c => (c.monto_acordado || 0) > 0)
  const ticketPromedio = clientesConCosto.length > 0
    ? clientesConCosto.reduce((s, c) => s + (c.monto_acordado || 0), 0) / clientesConCosto.length : 0
  // Ticket promedio DEL PERIODO (ingresos cobrados / clientes únicos que pagaron) — comparativo, distinto al ticket de catálogo de arriba
  const ticketPeriodo = clientesUnicos > 0 ? ingresosTotal / clientesUnicos : 0
  const clientesUnicosAnterior = new Set(pagosPeriodoAnterior.map(p => p.cliente_id)).size
  const ticketPeriodoAnterior = clientesUnicosAnterior > 0 ? ingresosTotalAnterior / clientesUnicosAnterior : 0
  const deltaTicket = ticketPeriodoAnterior > 0 ? ((ticketPeriodo - ticketPeriodoAnterior) / ticketPeriodoAnterior) * 100 : null
  // total_pagado no es una columna real en `clientes`; se calcula sumando todos los pagos por cliente
  const totalPagadoPorCliente = pagos.reduce((acc: Record<string, number>, p: any) => {
    acc[p.cliente_id] = (acc[p.cliente_id] ?? 0) + (Number(p.monto) || 0)
    return acc
  }, {} as Record<string, number>)
  const porCobrar = clientesFiltrados.reduce((s, c) => s + Math.max(0, (c.monto_acordado || 0) - (totalPagadoPorCliente[c.id] ?? 0)), 0)

  // ── MÉTRICAS COMERCIALES ──
  const prospectos = clientesFiltrados.filter(c => c.etapa_kanban === 'prospecto')
  const enDiagnostico = clientesFiltrados.filter(c => c.etapa_kanban === 'diagnostico')
  const enRecopilacion = clientesFiltrados.filter(c => c.etapa_kanban === 'recopilacion')
  const pensionados = clientesFiltrados.filter(c => c.etapa_kanban === 'cierre')
  // Comparativo de cierres logrados EN el periodo (usa fecha_etapa real; respaldo a created_at para clientes movidos antes de tener ese campo)
  const cierresPeriodo = pensionados.filter(c => new Date(c.fecha_etapa || c.created_at) >= start).length
  const cierresPeriodoAnterior = clientes.filter(c => c.etapa_kanban === 'cierre' && (() => { const f = new Date(c.fecha_etapa || c.created_at); return f >= prevStart && f < prevEnd })()).length
  const deltaCierres = cierresPeriodoAnterior > 0 ? ((cierresPeriodo - cierresPeriodoAnterior) / cierresPeriodoAnterior) * 100 : null
  const enTramite = clientesFiltrados.filter(c => c.etapa_kanban === 'tramite')
  const clientesActivos = clientesFiltrados.filter(c => c.etapa_kanban !== 'cancelado')
  const tasaConversion = (prospectos.length + pensionados.length) > 0
    ? (pensionados.length / (prospectos.length + pensionados.length)) * 100 : 0
  const tasaExitoGestiones = enTramite.length > 0
    ? (pensionados.length / (pensionados.length + enTramite.length)) * 100 : 0

  // Bateo por tipo de servicio
  const clientesDiag = clientes.filter(c => c.servicio_contratado === 'Diagnóstico')
  const clientesTramite = clientes.filter(c => c.servicio_contratado === 'Trámite')
  const bateoDiag = clientesDiag.length > 0
    ? (clientesDiag.filter(c => c.etapa_kanban !== 'prospecto').length / clientesDiag.length) * 100 : 0
  const bateoTramite = clientesTramite.length > 0
    ? (clientesTramite.filter(c => ['tramite','cierre'].includes(c.etapa_kanban || '')).length / clientesTramite.length) * 100 : 0

  // ── CYCLE TIME ──
  const clientesPensionados = clientes.filter(c => c.etapa_kanban === 'cierre' && c.created_at)
  const cycleTime = clientesPensionados.length > 0
    ? clientesPensionados.reduce((s, c) => {
        const weeks = (new Date().getTime() - new Date(c.created_at).getTime()) / (7 * 86400000)
        return s + weeks
      }, 0) / clientesPensionados.length : 0

  // ── PENSIONES LOGRADAS ──
  const diagConResultado = diagnosticos.filter(d => d.resultado_e4 > 0)
  const pensionPromedio = diagConResultado.length > 0
    ? diagConResultado.reduce((s, d) => s + d.resultado_e4, 0) / diagConResultado.length : 0

  // Régimen Ley 73/97 — derivado del diagnóstico más reciente por cliente
  const ultimoDiagPorCliente = new Map<string, any>()
  for (const d of diagnosticos) {
    const prev = ultimoDiagPorCliente.get(d.cliente_id)
    if (!prev || new Date(d.created_at) > new Date(prev.created_at)) {
      ultimoDiagPorCliente.set(d.cliente_id, d)
    }
  }
  const diagsUnicos = Array.from(ultimoDiagPorCliente.values())
  const totalL73 = diagsUnicos.filter(d => d.ley === '73').length
  const totalL97 = diagsUnicos.filter(d => d.ley === '97').length

  // Distribución por rangos
  const rangos = [
    { label: '< $5,000', min: 0, max: 5000, color: '#ef4444' },
    { label: '$5k-$10k', min: 5000, max: 10000, color: NARANJA },
    { label: '$10k-$15k', min: 10000, max: 15000, color: '#f59e0b' },
    { label: '> $15,000', min: 15000, max: Infinity, color: VERDE },
  ]

  // ── AGENDA HOY ──
  const hoyStart = new Date(); hoyStart.setHours(0,0,0,0)
  const hoyEnd = new Date(); hoyEnd.setHours(23,59,59,999)
  const agendaHoy = actividades
    .filter(a => a.fecha_programada && new Date(a.fecha_programada) >= hoyStart && new Date(a.fecha_programada) <= hoyEnd)
    .sort((a, b) => new Date(a.fecha_programada).getTime() - new Date(b.fecha_programada).getTime())

  // ── DIAGMES ──
  const diagMes = diagnosticos.filter(d => new Date(d.created_at) >= start)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 48px)', color: '#94a3b8', fontSize: '14px' }}>
      Cargando tu día...
    </div>
  )

  const card = (content: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', ...style }}>
      {content}
    </div>
  )

  const sTitle = (title: string, sub?: string) => (
    <div style={{ marginBottom: '10px' }}>
      <p style={{ fontSize: '11px', fontWeight: '700', color: '#374151', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</p>
      {sub && <p style={{ fontSize: '10px', color: '#94a3b8', margin: '1px 0 0' }}>{sub}</p>}
    </div>
  )

  const kpi = (label: string, value: string, sub?: string, color = '#374151', filled = false, delta?: number | null) => (
    <div style={{ background: filled ? color : '#FAFAFA', border: `1.5px solid ${filled ? color : '#e2e8f0'}`, borderRadius: '6px', padding: '7px 9px', textAlign: 'center' as const }}>
      <div style={{ fontSize: '9.5px', color: filled ? 'rgba(255,255,255,0.8)' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: '700', color: filled ? 'white' : color }}>{value}</div>
      {sub && <div style={{ fontSize: '9.5px', color: filled ? 'rgba(255,255,255,0.75)' : '#94a3b8', marginTop: '1px' }}>{sub}</div>}
      {delta !== undefined && delta !== null && (
        <div style={{ fontSize: '9px', fontWeight: '700', color: filled ? 'white' : (delta >= 0 ? VERDE : '#ef4444'), marginTop: '1px' }}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% vs anterior
        </div>
      )}
    </div>
  )

  // Insignia de comparativo vs periodo anterior (↑/↓ %). null = sin datos del periodo anterior para comparar.
  const deltaBadge = (delta: number | null) => {
    if (delta === null) return <span style={{ fontSize: '10px', color: '#cbd5e1' }}>sin comparativo</span>
    const subio = delta >= 0
    return (
      <span style={{ fontSize: '11px', fontWeight: '700', color: subio ? VERDE : '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        {subio ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
        <span style={{ fontSize: '9px', fontWeight: '500', color: '#94a3b8', marginLeft: '2px' }}>vs periodo anterior</span>
      </span>
    )
  }

  const bar = (val: number, max: number, color: string) => (
    <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden', marginTop: '3px' }}>
      <div style={{ height: '100%', width: `${max > 0 ? Math.min(100, (val/max)*100) : 0}%`, background: color, borderRadius: '2px', transition: 'width 0.4s' }} />
    </div>
  )

  return (
    <div style={{ height: 'calc(100vh - 48px)', overflow: 'auto', background: '#FAFAFA' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
            Buenos días, <span style={{ color: NARANJA }}>{nombreAsesor}</span>
          </h1>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '1px 0 0', textTransform: 'capitalize' }}>{fechaStr}</p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {/* Filtro período */}
          <div style={{ display: 'flex', gap: '3px', background: '#F4F6FB', borderRadius: '7px', padding: '3px' }}>
            {(['mes','trimestre','año'] as const).map(p => (
              <button key={p} onClick={() => setFiltroPeriodo(p)}
                style={{ padding: '4px 10px', borderRadius: '5px', border: 'none', background: filtroPeriodo === p ? 'white' : 'transparent', color: filtroPeriodo === p ? NARANJA : '#64748b', fontSize: '11px', fontWeight: filtroPeriodo === p ? '700' : '400', cursor: 'pointer', boxShadow: filtroPeriodo === p ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                {p === 'mes' ? 'Mes' : p === 'trimestre' ? 'Trimestre' : 'Año'}
              </button>
            ))}
          </div>
          {/* Filtro tipo */}
          <div style={{ display: 'flex', gap: '3px', background: '#F4F6FB', borderRadius: '7px', padding: '3px' }}>
            {([['todos','Todos'],['mod10','Mod 10'],['mod40','Mod 40'],['combo','Combo']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setFiltroTipo(val)}
                style={{ padding: '4px 10px', borderRadius: '5px', border: 'none', background: filtroTipo === val ? 'white' : 'transparent', color: filtroTipo === val ? AZUL : '#64748b', fontSize: '11px', fontWeight: filtroTipo === val ? '700' : '400', cursor: 'pointer', boxShadow: filtroTipo === val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => router.push('/clientes?nuevo=true')}
            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: NARANJA, color: 'white', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
            + Nuevo cliente
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {(() => {
          const HOY = new Date()
          const diasDesde = (fecha: string) => Math.floor((HOY.getTime() - new Date(fecha).getTime()) / 86400000)
          const tramiteEstancado = clientes.filter(c => c.etapa_kanban === 'tramite' && diasDesde(c.fecha_etapa || c.created_at) > 60)
          const saldoAltoSinPago = clientesFiltrados.filter(c => Math.max(0, (c.monto_acordado || 0) - (c.total_pagado || 0)) >= 5000)
          const diagSinResultado = diagnosticos.filter(d => d.resultado_e4 == null)
          const alertas = [
            tramiteEstancado.length > 0 && { icon: '⏰', texto: `${tramiteEstancado.length} cliente${tramiteEstancado.length !== 1 ? 's' : ''} en trámite con más de 60 días desde su alta sin cerrar`, color: '#ef4444', link: '/clientes' },
            saldoAltoSinPago.length > 0 && { icon: '💸', texto: `${saldoAltoSinPago.length} cliente${saldoAltoSinPago.length !== 1 ? 's' : ''} con saldo pendiente ≥ ${fmtMXN(5000)}`, color: '#f59e0b', link: '/clientes' },
            diagSinResultado.length > 0 && { icon: '📋', texto: `${diagSinResultado.length} diagnóstico${diagSinResultado.length !== 1 ? 's' : ''} sin resultado capturado`, color: '#8b5cf6', link: '/clientes' },
          ].filter(Boolean) as { icon: string; texto: string; color: string; link: string }[]
          if (alertas.length === 0) return null
          return (
            <div style={{ background: '#FFFBEB', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>🚨 Necesita tu atención</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {alertas.map((a, i) => (
                  <a key={i} href={a.link} style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', padding: '4px 6px', borderRadius: '5px' }}>
                    <span style={{ fontSize: '13px' }}>{a.icon}</span>
                    <span style={{ fontSize: '12px', color: '#374151' }}>{a.texto}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: a.color, fontWeight: '600' }}>Ver →</span>
                  </a>
                ))}
              </div>
              <p style={{ fontSize: '9px', color: '#a16207', marginTop: '6px' }}>
                "Estancado" se mide desde la fecha del último cambio de etapa. Para clientes movidos antes de este cambio, se usa su fecha de alta como respaldo.
              </p>
            </div>
          )
        })()}

        {/* KPIs row — embudo + financieros, unidos en una sola tira */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '8px' }}>
          {[
            { label: 'Clientes activos', value: clientesActivos.length.toString(), color: AZUL },
            { label: 'Prospectos', value: prospectos.length.toString(), sub: `+${clientesNuevosPeriodo} en el periodo`, color: AZUL, filled: true, delta: deltaClientesNuevos },
            { label: 'En diagnóstico', value: enDiagnostico.length.toString(), sub: 'propuesta enviada', color: '#3b82f6', filled: true },
            { label: 'En recopilación', value: enRecopilacion.length.toString(), sub: 'armando expediente', color: '#0d9488', filled: true },
            { label: 'En trámite', value: enTramite.length.toString(), color: '#f59e0b' },
            { label: 'Cierres exitosos', value: pensionados.length.toString(), sub: `${cierresPeriodo} en el periodo`, color: VERDE, filled: true, delta: deltaCierres },
            { label: 'Cobrado hoy', value: fmtMXN(ingresosTotal), color: VERDE, delta: deltaIngresos },
            { label: 'Por cobrar', value: fmtMXN(porCobrar), color: '#f59e0b' },
            { label: 'Ticket prom.', value: fmtMXN(ticketPromedio), color: AZUL, sub: `periodo: ${fmtMXN(ticketPeriodo)}`, delta: deltaTicket },
          ].map((k: any, i) => kpi(k.label, k.value, k.sub, k.color, k.filled, k.delta))}
        </div>

        {/* ═══ SECCIÓN: TENDENCIAS (vista rápida) ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📈 Tendencias — vista rápida</span>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', alignItems: 'start' }}>
          {card(<>
            {sTitle('📈 Tendencia de ingresos', 'Últimos 6 meses')}
            {(() => {
              const hoy = new Date()
              const meses: { label: string; total: number }[] = []
              for (let i = 5; i >= 0; i--) {
                const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
                const total = pagos
                  .filter(p => {
                    const f = new Date(p.fecha_pago)
                    return f.getFullYear() === d.getFullYear() && f.getMonth() === d.getMonth()
                  })
                  .reduce((s, p) => s + (Number(p.monto) || 0), 0)
                meses.push({ label: d.toLocaleDateString('es-MX', { month: 'short' }), total })
              }
              const max = Math.max(...meses.map(m => m.total), 1)
              const W = 560, H = 90, padL = 16, padR = 16
              const stepX = (W - padL - padR) / (meses.length - 1)
              const yFor = (v: number) => H - (max > 0 ? (v / max) * (H - 16) : 0)
              const puntos = meses.map((m, i) => ({ x: padL + i * stepX, y: yFor(m.total), ...m }))
              const pathLinea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
              const pathArea = `${pathLinea} L ${puntos[puntos.length - 1].x} ${H} L ${puntos[0].x} ${H} Z`
              return (
                <svg viewBox={`0 0 ${W} ${H + 22}`} style={{ width: '100%', height: 'auto' }}>
                  <path d={pathArea} fill={NARANJA} opacity={0.08} />
                  <path d={pathLinea} fill="none" stroke={NARANJA} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                  {puntos.map((p, i) => (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r={i === puntos.length - 1 ? 5 : 3.5} fill="white" stroke={NARANJA} strokeWidth={2.5} />
                      <text x={p.x} y={H + 16} textAnchor="middle" fontSize="9" fill="#94a3b8">{p.label}</text>
                      {p.total > 0 && (
                        <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#374151">
                          {p.total >= 1000 ? `${(p.total / 1000).toFixed(0)}k` : p.total.toFixed(0)}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
              )
            })()}
          </>)}

          {card(<>
            {sTitle('🔻 Embudo de clientes', 'Por etapa del pipeline')}
            {(() => {
              const etapas = [
                { id: 'prospecto', label: 'Prospecto', color: AZUL },
                { id: 'diagnostico', label: 'Diagnóstico', color: '#3b82f6' },
                { id: 'recopilacion', label: 'Recopilación', color: '#0d9488' },
                { id: 'tramite', label: 'Trámite', color: '#f59e0b' },
                { id: 'cierre', label: 'Cierre', color: VERDE },
              ]
              const counts = etapas.map(e => ({ ...e, n: clientes.filter(c => (c.etapa_kanban || 'prospecto') === e.id).length }))
              const max = Math.max(...counts.map(c => c.n), 1)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {counts.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10px', color: '#64748b', width: '78px', flexShrink: 0 }}>{c.label}</span>
                      <div style={{ flex: 1, background: '#F4F6FB', borderRadius: '4px', height: '18px', position: 'relative' as const }}>
                        <div style={{ width: `${(c.n / max) * 100}%`, height: '100%', background: c.color, borderRadius: '4px', minWidth: c.n > 0 ? '4px' : 0, transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151', width: '20px', textAlign: 'right' as const, flexShrink: 0 }}>{c.n}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </>)}
        </div>

        {/* ═══ SECCIÓN: FINANZAS Y COMERCIAL ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💰 Finanzas y comercial</span>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

          {/* Bloque Financiero — dona */}
          {card(<>
            {sTitle('💰 Ingresos reales', filtroPeriodo)}
            <div style={{ marginBottom: '6px' }}>{deltaBadge(deltaIngresos)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
              {/* Donut grande */}
              {(() => {
                const items = [
                  { label: 'Asesoría', value: ingresosAsesoria, color: AZUL },
                  { label: 'Trámite de Pensión', value: ingresosGestoria, color: VERDE },
                  { label: 'Financiamiento', value: ingresosFinanciamiento, color: '#eab308' },
                  { label: 'Gestoría Global', value: ingresosGestoriaGlobal, color: '#8b5cf6' },
                  { label: 'Comisiones Financieras', value: comisionesFinancieras, color: NARANJA },
                  { label: 'Sin clasificar', value: ingresosSinClasificar, color: '#94a3b8' },
                ]
                const total = items.reduce((s, it) => s + it.value, 0)
                const R = 40, CIRC = 2 * Math.PI * R
                let acc = 0
                return (
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <svg width="180" height="180" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f5f9" strokeWidth="20" />
                      {items.map((it, i) => {
                        const pct = total > 0 ? it.value / total : 0
                        const dash = pct * CIRC
                        const offset = -acc * CIRC
                        acc += pct
                        if (pct === 0) return null
                        return <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={it.color} strokeWidth="20"
                          strokeDasharray={`${dash} ${CIRC}`} strokeDashoffset={offset} transform="rotate(-90 50 50)" />
                      })}
                    </svg>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b' }}>{fmtMXN(total)}</div>
                      <div style={{ fontSize: '9px', color: '#94a3b8' }}>total bruto</div>
                    </div>
                  </div>
                )
              })()}
              {/* Leyenda en 2x2 */}
              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px' }}>
                {[
                  { label: 'Asesoría', value: ingresosAsesoria, color: AZUL },
                  { label: 'Trámite de Pensión', value: ingresosGestoria, color: VERDE },
                  { label: 'Financiamiento', value: ingresosFinanciamiento, color: '#eab308' },
                  { label: 'Gestoría Global', value: ingresosGestoriaGlobal, color: '#8b5cf6' },
                  { label: 'Comisiones Financieras', value: comisionesFinancieras, color: NARANJA },
                  { label: 'Sin clasificar', value: ingresosSinClasificar, color: '#94a3b8' },
                ].map((item, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1px' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '2px', background: item.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '9.5px', color: '#64748b' }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '800', color: '#374151' }}>{fmtMXN(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {kpi('Total bruto', fmtMXN(ingresosConComisiones), 'incl. comisiones')}
              {kpi('Ticket promedio', fmtMXN(ticketPromedio), 'por cliente')}
            </div>
          </>)}

          {/* Bloque Comercial */}
          {card(<>
            {sTitle('📊 Efectividad comercial')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
              {kpi('Conv. general', fmtPct(tasaConversion), 'prospecto → cliente')}
              {kpi('Éxito gestiones', fmtPct(tasaExitoGestiones), 'trámites resueltos')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                  <span style={{ color: '#64748b' }}>Bateo Diagnóstico</span>
                  <span style={{ fontWeight: '700', color: AZUL }}>{fmtPct(bateoDiag)}</span>
                </div>
                {bar(bateoDiag, 100, AZUL)}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                  <span style={{ color: '#64748b' }}>Bateo Gestoría</span>
                  <span style={{ fontWeight: '700', color: VERDE }}>{fmtPct(bateoTramite)}</span>
                </div>
                {bar(bateoTramite, 100, VERDE)}
              </div>
              <div style={{ marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                  <span style={{ color: '#64748b' }}>Pipeline por etapa (embudo)</span>
                </div>
                {(() => {
                  const etapas = [
                    { label: 'Prospecto', val: clientes.filter(c => c.etapa_kanban === 'prospecto').length, color: AZUL, text: 'white' },
                    { label: 'Diagnóstico', val: clientes.filter(c => c.etapa_kanban === 'diagnostico').length, color: '#639922', text: 'white' },
                    { label: 'Recopilación', val: clientes.filter(c => c.etapa_kanban === 'recopilacion').length, color: '#eab308', text: 'white' },
                    { label: 'Trámite', val: enTramite.length, color: '#f97316', text: 'white' },
                    { label: 'Cierre', val: pensionados.length, color: VERDE, text: 'white' },
                  ]
                  const maxVal = Math.max(...etapas.map(e => e.val), 1)
                  const cancelados = clientes.filter(c => c.etapa_kanban === 'cancelado').length
                  return (
                    <>
                      {etapas.map((e, i) => {
                        const widthPct = 35 + (e.val / maxVal) * 65
                        return (
                          <div key={i} style={{ display: 'flex', justifyContent: 'center', marginBottom: '2px' }}>
                            <div style={{ width: `${widthPct}%`, minWidth: '60px', background: e.color, borderRadius: '6px', padding: '4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '11px', fontWeight: '600', color: e.text }}>{e.label}</span>
                              <span style={{ fontSize: '12px', fontWeight: '800', color: e.text }}>{e.val}</span>
                            </div>
                          </div>
                        )
                      })}
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '6px' }}>
                        <div style={{ width: '50%', minWidth: '60px', background: '#f1f5f9', borderRadius: '6px', padding: '4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Cancelado</span>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: '#64748b' }}>{cancelados}</span>
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          </>)}
        </div>

        {/* ═══ SECCIÓN: OPERACIÓN ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚙️ Operación</span>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>

          {/* Bloque Operación */}
          {card(<>
            {sTitle('⚙️ Operación y volumen')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
              {kpi('Cycle time prom.', fmtWeeks(cycleTime), 'firma → pensión', AZUL)}
              {kpi('Activos este mes', diagMes.length.toString(), 'diagnósticos', '#8b5cf6')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <p style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Servicios activos por fase</p>
              {[
                { label: 'En diagnóstico', val: clientes.filter(c => c.etapa_kanban === 'diagnostico').length, color: '#3b82f6' },
                { label: 'En trámite', val: enTramite.length, color: NARANJA },
                { label: 'Cierre exitoso ✓', val: pensionados.length, color: VERDE },
                { label: 'Cancelados', val: clientes.filter(c => c.etapa_kanban === 'cancelado').length, color: '#ef4444' },
              ].map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', background: '#FAFAFA', borderRadius: '5px', border: '1px solid #f1f5f9' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: e.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '11px', color: '#64748b', flex: 1 }}>{e.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>{e.val}</span>
                </div>
              ))}
            </div>
          </>)}

          {/* Agenda hoy */}
          {card(<>
            {sTitle('📅 Agenda de hoy', agendaHoy.length === 0 ? 'Sin actividades' : `${agendaHoy.length} actividad${agendaHoy.length !== 1 ? 'es' : ''}`)}
            {agendaHoy.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '12px' }}>
                <div style={{ fontSize: '22px', marginBottom: '6px' }}>✅</div>
                Día libre
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {agendaHoy.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 9px', background: '#FAFAFA', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                    <div style={{ width: '2px', minHeight: '28px', background: a.estatus === 'completado' ? VERDE : NARANJA, borderRadius: '1px', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{a.titulo}</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                        {new Date(a.fecha_programada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        {a.clientes?.nombre && ` · ${a.clientes.nombre}`}
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: a.estatus === 'completado' ? '#f0fdf4' : '#fff5f2', color: a.estatus === 'completado' ? VERDE : NARANJA, fontWeight: '600' }}>
                      {a.estatus === 'completado' ? '✓' : '⏳'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <a href="/seguimiento" style={{ display: 'block', textAlign: 'center', marginTop: '8px', fontSize: '11px', color: NARANJA, textDecoration: 'none', fontWeight: '600' }}>
              Ver agenda completa →
            </a>
          </>)}

          {/* Bloque Financieras */}
          {card(<>
            {sTitle('🏦 Financieras aliadas', financieras.length === 0 ? 'Sin financieras configuradas' : `${financieras.length} aliadas`)}
            {financieras.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '11px' }}>
                <div style={{ fontSize: '22px', marginBottom: '6px' }}>🏦</div>
                Configura tus financieras aliadas<br />en el panel de administración
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {financieras.map((fin, i) => {
                  const solFin = solicitudes.filter(s => s.financiera_id === fin.id)
                  const aprobadas = solFin.filter(s => s.aprobada === true).length
                  const rechazadas = solFin.filter(s => s.aprobada === false).length
                  const pendientes = solFin.filter(s => s.aprobada === null).length
                  const efectividad = solFin.length > 0 ? Math.round((aprobadas / solFin.length) * 100) : 0
                  const comisionTotal = solFin.reduce((s, sol) => s + (sol.comision_cobrada || 0), 0)
                  return (
                    <div key={fin.id} style={{ padding: '8px 10px', background: '#FAFAFA', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151' }}>{fin.nombre}</span>
                        <span style={{ fontSize: '11px', color: AZUL, fontWeight: '700' }}>{fin.tasa_anual}%</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginBottom: '4px' }}>
                        <div style={{ textAlign: 'center', fontSize: '10px' }}>
                          <div style={{ fontWeight: '700', color: VERDE }}>{aprobadas}</div>
                          <div style={{ color: '#94a3b8' }}>Aprobadas</div>
                        </div>
                        <div style={{ textAlign: 'center', fontSize: '10px' }}>
                          <div style={{ fontWeight: '700', color: '#ef4444' }}>{rechazadas}</div>
                          <div style={{ color: '#94a3b8' }}>Rechazadas</div>
                        </div>
                        <div style={{ textAlign: 'center', fontSize: '10px' }}>
                          <div style={{ fontWeight: '700', color: '#f59e0b' }}>{efectividad}%</div>
                          <div style={{ color: '#94a3b8' }}>Efectividad</div>
                        </div>
                      </div>
                      {comisionTotal > 0 && (
                        <div style={{ fontSize: '10px', color: VERDE, fontWeight: '600' }}>
                          💰 {fmtMXN(comisionTotal)} en comisiones
                        </div>
                      )}
                      <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>
                        {solFin.length} solicitudes · {pendientes} pendientes
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>)}
        </div>

        {/* ═══ SECCIÓN: COMERCIAL AVANZADO ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📊 Comercial avanzado</span>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>

          {/* Bloque Mercado */}
          {card(<>
            {sTitle('🎯 Inteligencia de mercado')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
              {kpi('Pensión prom.', pensionPromedio > 0 ? fmtMXN(pensionPromedio) : '—', 'E4 óptimo', VERDE)}
              {kpi('Diagnósticos', diagConResultado.length.toString(), 'con resultado', '#8b5cf6')}
            </div>

            {/* Pastel Ley 73/97 grande + leyenda */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
              {(() => {
                const l73 = totalL73
                const l97 = totalL97
                const total = l73 + l97
                const R = 42, CIRC = 2 * Math.PI * R
                const pct73 = total > 0 ? l73 / total : 0
                return (
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <svg width="116" height="116" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r={R} fill="none" stroke={AZUL} strokeWidth="15"
                        strokeDasharray={`${pct73 * CIRC} ${CIRC}`} transform="rotate(-90 50 50)" />
                      <circle cx="50" cy="50" r={R} fill="none" stroke={VERDE} strokeWidth="15"
                        strokeDasharray={`${(1-pct73) * CIRC} ${CIRC}`} strokeDashoffset={-pct73 * CIRC} transform="rotate(-90 50 50)" />
                    </svg>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                      <div style={{ fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>{total}</div>
                      <div style={{ fontSize: '9px', color: '#94a3b8' }}>clientes</div>
                    </div>
                  </div>
                )
              })()}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: AZUL, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Ley 73 (pre-1997)</span>
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: '800', color: '#374151' }}>{totalL73}</span>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: VERDE, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Ley 97 (post-1997)</span>
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: '800', color: '#374151' }}>{totalL97}</span>
                </div>
              </div>
            </div>

            {/* Rangos de pensión */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Distribución por rangos de pensión</p>
              {rangos.map((r, i) => {
                const count = diagConResultado.filter(d => d.resultado_e4 >= r.min && d.resultado_e4 < r.max).length
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', width: '78px', flexShrink: 0 }}>{r.label}</span>
                    <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${diagConResultado.length > 0 ? (count/diagConResultado.length)*100 : 0}%`, background: r.color, borderRadius: '4px' }} />
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#374151', minWidth: '20px', textAlign: 'right' }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </>)}
        </div>

        {/* ═══ SECCIÓN: SERVICIOS ACTIVOS POR ETAPA ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📦 Servicios activos por etapa</span>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
          {card(<>
            {(() => {
              const SERVICIOS = [
                { id: 'asesoria', label: 'Asesoría' },
                { id: 'gestion', label: 'Trámite' },
                { id: 'financiamiento', label: 'Financiamiento' },
                { id: 'gestoria_global', label: 'Gestión Global' },
              ]
              const ETAPAS = [
                { id: 'prospecto', label: 'Prospecto', color: AZUL },
                { id: 'diagnostico', label: 'Diagnóstico', color: '#f59e0b' },
                { id: 'recopilacion', label: 'Recopilación', color: '#0d9488' },
                { id: 'tramite', label: 'Trámite', color: '#38bdf8' },
                { id: 'cierre', label: 'Cierre', color: '#a855f7' },
                { id: 'cancelado', label: 'Cancelado', color: '#94a3b8' },
              ]
              const datos = SERVICIOS.map(s => ({
                ...s,
                etapas: ETAPAS.map(e => ({ ...e, n: clientesFiltrados.filter(c => c.tipo_servicio === s.id && (c.etapa_kanban || 'prospecto') === e.id).length }))
              }))
              const max = Math.max(...datos.flatMap(d => d.etapas.map(e => e.n)), 1)
              const W = 760, H = 160, padL = 30, padR = 10, groupGap = 28
              const groupW = (W - padL - padR - groupGap * (datos.length - 1)) / datos.length
              const barW = groupW / ETAPAS.length
              return (
                <>
                  <svg viewBox={`0 0 ${W} ${H + 24}`} style={{ width: '100%', height: 'auto' }}>
                    {[0, 0.5, 1].map((f, i) => (
                      <line key={i} x1={padL} x2={W - padR} y1={H - f * (H - 20)} y2={H - f * (H - 20)} stroke="#f1f5f9" strokeWidth="1" />
                    ))}
                    {datos.map((g, gi) => {
                      const gx = padL + gi * (groupW + groupGap)
                      return (
                        <g key={gi}>
                          {g.etapas.map((e, ei) => {
                            const h = (e.n / max) * (H - 20)
                            const x = gx + ei * barW
                            const y = H - h
                            return (
                              <g key={ei}>
                                <rect x={x + 1} y={y} width={barW - 2} height={h} rx={2} fill={e.color} />
                                {e.n > 0 && <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="8" fontWeight="700" fill="#374151">{e.n}</text>}
                              </g>
                            )
                          })}
                          <text x={gx + groupW / 2} y={H + 16} textAnchor="middle" fontSize="10" fontWeight="600" fill="#64748b">{g.label}</text>
                        </g>
                      )
                    })}
                  </svg>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '10px', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                    {ETAPAS.map((e, i) => (
                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#64748b' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: e.color, display: 'inline-block' }} />
                        {e.label}
                      </span>
                    ))}
                  </div>
                </>
              )
            })()}
          </>)}
        </div>

        {/* ═══ SECCIÓN: PAGOS Y RESUMEN ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📋 Pagos y resumen</span>
          <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>

          {/* Tubería de dinero */}
          {card(<>
            {sTitle('💳 Pagos pendientes', `${fmtMXN(porCobrar)} en camino`)}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '10px' }}>
              {kpi('Trámites activos', enTramite.length.toString(), 'clientes', NARANJA)}
              {kpi('Por cobrar', fmtMXN(porCobrar), 'honorarios pend.', '#f59e0b')}
              {kpi('Cobrado', fmtMXN(ingresosTotal), filtroPeriodo, VERDE)}
            </div>
            {enTramite.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>Sin clientes en trámite activo</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                {enTramite.slice(0, 6).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 9px', background: '#FAFAFA', borderRadius: '5px', border: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onClick={() => router.push('/clientes')}>
                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: NARANJA, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '11px', color: '#374151', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                    <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>{fmtMXN(Math.max(0, (c.monto_acordado||0)-(c.total_pagado||0)))}</span>
                  </div>
                ))}
              </div>
            )}
          </>)}

          {/* Resumen rápido */}
          {card(<>
            {sTitle('📋 Resumen')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {[
                { label: 'Total clientes', val: clientes.length, color: AZUL },
                { label: 'Diagnósticos total', val: diagnosticos.length, color: '#8b5cf6' },
                { label: 'Actividades hoy', val: agendaHoy.length, color: NARANJA },
                { label: 'Completadas hoy', val: agendaHoy.filter(a => a.estatus === 'completado').length, color: VERDE },
                                              ].map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: '5px', background: i % 2 === 0 ? '#FAFAFA' : 'white' }}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{e.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: e.color }}>{e.val}</span>
                </div>
              ))}
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
