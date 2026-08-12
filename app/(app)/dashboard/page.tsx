'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#334E7B'
const VERDE = '#2E8B57'
const NARANJA = '#E8724A'

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
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [noVolverAMostrar, setNoVolverAMostrar] = useState(false)

  const [clientes, setClientes] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const [pgErrorMsg, setPgErrorMsg] = useState<string | null>(null)
  const [diagnosticos, setDiagnosticos] = useState<any[]>([])
  const [chartModal, setChartModal] = useState<{ titulo: string; sub?: string; contenido: React.ReactNode } | null>(null)
  const [actividades, setActividades] = useState<any[]>([])
  const [financieras, setFinancieras] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [costoIA, setCostoIA] = useState(0)
  const [diagsUrgencia, setDiagsUrgencia] = useState<{ rojo: number; amarillo: number; verde: number; gris: number }>({ rojo: 0, amarillo: 0, verde: 0, gris: 0 })
  const [clientesEstancados, setClientesEstancados] = useState(0)
  const [actividadesSemana, setActividadesSemana] = useState(0)
  const [actividadesSemanaAnt, setActividadesSemanaAnt] = useState(0)
  const [encuestaStats, setEncuestaStats] = useState({ promedio: 0, nps: 0, respondidas: 0, enviadas: 0 })

  const hoy = new Date()
  const fechaStr = hoy.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      loadData(session.user.id)
    })
    // Se muestra cada vez que inicias sesión, salvo que el usuario marque
    // explícitamente "No volver a mostrar este mensaje" (flag distinto a "ya la vi una vez")
    if (typeof window !== 'undefined' && localStorage.getItem('kse_onboarding_oculto') !== '1') {
      setShowOnboarding(true)
    }
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

    // Nuevas consultas para KPIs adicionales
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0)
    const inicioSemana = new Date(); inicioSemana.setDate(inicioSemana.getDate() - 7)
    const inicioSemanaAnt = new Date(); inicioSemanaAnt.setDate(inicioSemanaAnt.getDate() - 14)
    const hace60dias = new Date(); hace60dias.setDate(hace60dias.getDate() - 60)

    const [{ data: iaData }, { data: actSem }, { data: actSemAnt }, { data: encuestas }] = await Promise.all([
      supabase.from('uso_ia').select('costo_usd').eq('asesor_id', uid).gte('created_at', inicioMes.toISOString()),
      supabase.from('actividades').select('id').eq('asesor_id', uid).gte('created_at', inicioSemana.toISOString()),
      supabase.from('actividades').select('id').eq('asesor_id', uid).gte('created_at', inicioSemanaAnt.toISOString()).lt('created_at', inicioSemana.toISOString()),
      supabase.from('encuestas_satisfaccion').select('calificacion, recomendaria, respondida_at').eq('asesor_id', uid).gte('created_at', inicioMes.toISOString()),
    ])

    // KPIs encuesta
    const respondidas = (encuestas ?? []).filter((e: any) => e.respondida_at)
    const promedio = respondidas.length > 0
      ? respondidas.reduce((s: number, e: any) => s + (e.calificacion ?? 0), 0) / respondidas.length
      : 0
    const promotores = respondidas.filter((e: any) => e.recomendaria === 'si').length
    const detractores = respondidas.filter((e: any) => e.recomendaria === 'no').length
    const nps = respondidas.length > 0 ? Math.round(((promotores - detractores) / respondidas.length) * 100) : 0
    setEncuestaStats({ promedio: Math.round(promedio * 10) / 10, nps, respondidas: respondidas.length, enviadas: (encuestas ?? []).length })

    setCostoIA((iaData ?? []).reduce((s: number, r: any) => s + (Number(r.costo_usd) || 0), 0))
    setActividadesSemana((actSem ?? []).length)
    setActividadesSemanaAnt((actSemAnt ?? []).length)

    // Clientes estancados: activos sin cambio de etapa en 60+ días
    const estancados = (cl ?? []).filter((c: any) => {
      if (c.activo === false) return false
      const fechaEtapa = c.fecha_etapa ? new Date(c.fecha_etapa) : new Date(c.created_at)
      return fechaEtapa < hace60dias && !['cierre_exitoso', 'cancelado'].includes(c.etapa_kanban ?? '')
    }).length
    setClientesEstancados(estancados)

    // Semáforo de urgencia basado en diagnósticos
    const urgencia = { rojo: 0, amarillo: 0, verde: 0, gris: 0 }
    ;(cl ?? []).filter((c: any) => c.activo !== false).forEach((c: any) => {
      const diag = (dg ?? []).find((d: any) => d.cliente_id === c.id)
      if (!diag && !c.fecha_nac) { urgencia.gris++; return }
      let edadActual = 0
      if (c.fecha_nac) {
        const nac = new Date(c.fecha_nac)
        edadActual = new Date().getFullYear() - nac.getFullYear()
      } else if (diag?.edad_retiro) { edadActual = diag.edad_retiro - 5 }
      const aniosRestantes = Math.max(0, (diag?.edad_retiro ?? 65) - edadActual)
      const semanas = diag?.semanas ?? 0
      if (aniosRestantes <= 2 || (aniosRestantes <= 3 && semanas < 450)) urgencia.rojo++
      else if (aniosRestantes <= 5) urgencia.amarillo++
      else urgencia.verde++
    })
    setDiagsUrgencia(urgencia)
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

  // Bateo por tipo de servicio — usa tipo_servicio (campo actual), antes usaba servicio_contratado (campo legado que ya no se llena)
  const clientesDiag = clientesFiltrados.filter(c => c.tipo_servicio === 'asesoria')
  const clientesTramite = clientesFiltrados.filter(c => c.tipo_servicio === 'gestion')
  const bateoDiag = clientesDiag.length > 0
    ? (clientesDiag.filter(c => c.etapa_kanban !== 'prospecto').length / clientesDiag.length) * 100 : 0
  const bateoTramite = clientesTramite.length > 0
    ? (clientesTramite.filter(c => ['tramite','cierre'].includes(c.etapa_kanban || '')).length / clientesTramite.length) * 100 : 0

  // ── CYCLE TIME ── Duración firma -> cierre, usando fecha_etapa real del cierre (no "hoy", que seguiria creciendo para clientes ya cerrados)
  const clientesPensionados = clientesFiltrados.filter(c => c.etapa_kanban === 'cierre' && c.created_at && c.fecha_etapa)
  const cycleTime = clientesPensionados.length > 0
    ? clientesPensionados.reduce((s, c) => {
        const weeks = (new Date(c.fecha_etapa).getTime() - new Date(c.created_at).getTime()) / (7 * 86400000)
        return s + Math.max(0, weeks)
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
    { label: '< $5,000', min: 0, max: 5000, color: '#DC2626' },
    { label: '$5k-$10k', min: 5000, max: 10000, color: NARANJA },
    { label: '$10k-$15k', min: 10000, max: 15000, color: '#F59E0B' },
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

  // ── ALERTAS ACCIONABLES ──
  const DIAS_PAGO_VENCIDO = 7
  const DIAS_SIN_SEGUIMIENTO = 14
  const totalPagadoPorClienteAlerta = pagos.reduce((acc: Record<string, number>, p: any) => {
    acc[p.cliente_id] = (acc[p.cliente_id] ?? 0) + (Number(p.monto) || 0)
    return acc
  }, {} as Record<string, number>)
  const ultimaActividadPorCliente = new Map<string, string>()
  for (const a of actividades) {
    if (!a.cliente_id) continue
    const prev = ultimaActividadPorCliente.get(a.cliente_id)
    if (!prev || new Date(a.fecha_programada) > new Date(prev)) ultimaActividadPorCliente.set(a.cliente_id, a.fecha_programada)
  }
  const alertasPago = clientes
    .filter(c => c.etapa_kanban !== 'cancelado' && c.etapa_kanban !== 'cierre')
    .map(c => {
      const saldo = Math.max(0, (c.monto_acordado || 0) - (totalPagadoPorClienteAlerta[c.id] ?? 0))
      const diasDesdeEtapa = Math.floor((Date.now() - new Date(c.fecha_etapa || c.created_at).getTime()) / 86400000)
      return { cliente: c, saldo, diasDesdeEtapa }
    })
    .filter(a => a.saldo > 0 && a.diasDesdeEtapa >= DIAS_PAGO_VENCIDO)
    .sort((a, b) => b.diasDesdeEtapa - a.diasDesdeEtapa)
  const alertasSeguimiento = clientes
    .filter(c => ['prospecto', 'diagnostico', 'recopilacion', 'tramite'].includes(c.etapa_kanban || 'prospecto'))
    .map(c => {
      const ultima = ultimaActividadPorCliente.get(c.id)
      const diasSinContacto = Math.floor((Date.now() - new Date(ultima || c.created_at).getTime()) / 86400000)
      return { cliente: c, diasSinContacto }
    })
    .filter(a => a.diasSinContacto >= DIAS_SIN_SEGUIMIENTO)
    .sort((a, b) => b.diasSinContacto - a.diasSinContacto)
  const totalAlertas = alertasPago.length + alertasSeguimiento.length

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 48px)', color: '#94A3B8', fontSize: '14px' }}>
      Cargando tu día...
    </div>
  )

  const card = (content: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '14px 16px', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' as const, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', ...style }}>
      {content}
    </div>
  )

  const sTitle = (title: string, sub?: string) => (
    <div style={{ marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid #F3F4F6' }}>
      <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#111827', margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{title}</p>
      {sub && <p style={{ fontSize: '10px', color: '#94A3B8', margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )

  // Wrapper de gráfica con botón de maximizar
  // contenidoExpandido opcional — si no se pasa, usa el mismo contenido ampliado
  const MODAL_H = '380px' // altura estándar de todas las gráficas en modal
  const chartCard = (titulo: string, sub: string | undefined, contenidoCompacto: React.ReactNode, contenidoExpandido?: React.ReactNode) => (
    <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '12px 14px', display: 'flex', flexDirection: 'column' as const, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px', flexShrink: 0 }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: '700' as const, color: '#111827', margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{titulo}</p>
          {sub && <p style={{ fontSize: '10px', color: '#94A3B8', margin: '2px 0 0' }}>{sub}</p>}
        </div>
        <button onClick={() => setChartModal({ titulo, sub, contenido: contenidoExpandido ?? contenidoCompacto })}
          title="Maximizar"
          style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px', width: '26px', height: '26px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: '#94A3B8', flexShrink: 0 }}>
          ⛶
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, minHeight: 0 }}>
        {contenidoCompacto}
      </div>
    </div>
  )

  const kpi = (label: string, value: string, sub?: string, color = '#374151', filled = false, delta?: number | null) => {
    const tintMap: Record<string, string> = {
      '#334E7B': '#EEF2F8', '#1D4ED8': '#EFF6FF', '#0891B2': '#ECFEFF',
      '#F59E0B': '#FFFBEB', '#16A34A': '#F0FDF4', '#DC2626': '#FEF2F2',
      [VERDE]: '#F0FDF4', [AZUL]: '#EEF2F8', [NARANJA]: '#FFF7ED',
    }
    const tint = tintMap[color] ?? '#F8FAFC'
    return (
      <div style={{ background: filled ? color : tint, border: `1px solid ${color}22`, borderLeft: `4px solid ${color}`, padding: '8px 10px', textAlign: 'center' as const, borderRadius: '6px' }}>
        <div style={{ fontSize: '9.5px', color: filled ? 'rgba(255,255,255,0.8)' : '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '600' as const, marginBottom: '3px' }}>{label}</div>
        <div style={{ fontSize: '18px', fontWeight: '800' as const, color: filled ? 'white' : color, letterSpacing: '-0.3px' }}>{value}</div>
        {sub && <div style={{ fontSize: '10px', color: filled ? 'rgba(255,255,255,0.75)' : '#6B7280', marginTop: '2px' }}>{sub}</div>}
        {delta !== undefined && delta !== null && (
          <div style={{ fontSize: '10px', fontWeight: '700' as const, color: filled ? 'white' : (delta >= 0 ? VERDE : '#DC2626'), marginTop: '2px' }}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% vs anterior
          </div>
        )}
      </div>
    )
  }

  // Insignia de comparativo vs periodo anterior (↑/↓ %). null = sin datos del periodo anterior para comparar.
  const deltaBadge = (delta: number | null) => {
    if (delta === null) return <span style={{ fontSize: '11px', color: '#D1D5DB' }}>sin comparativo</span>
    const subio = delta >= 0
    return (
      <span style={{ fontSize: '12px', fontWeight: '700', color: subio ? VERDE : '#DC2626', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        {subio ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
        <span style={{ fontSize: '10px', fontWeight: '500', color: '#94A3B8', marginLeft: '2px' }}>vs periodo anterior</span>
      </span>
    )
  }

  const bar = (val: number, max: number, color: string) => (
    <div style={{ height: '5px', background: '#F3F4F6', overflow: 'hidden', marginTop: '4px' }}>
      <div style={{ height: '100%', width: `${max > 0 ? Math.min(100, (val/max)*100) : 0}%`, background: color, transition: 'width 0.4s' }} />
    </div>
  )

  return (
    <div style={{ height: 'calc(100vh - 48px)', overflow: 'auto', background: '#F4F6F9' }}>

      {/* ── Modal de gráfica maximizada ── */}
      {chartModal && (
        <div onClick={() => setChartModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(2px)' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '720px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#111827', margin: 0 }}>{chartModal.titulo}</p>
                {chartModal.sub && <p style={{ fontSize: '11px', color: '#94A3B8', margin: '2px 0 0' }}>{chartModal.sub}</p>}
              </div>
              <button onClick={() => setChartModal(null)}
                style={{ background: '#F4F6F9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✕
              </button>
            </div>
            <div style={{ padding: '20px', minHeight: '400px', display: 'flex', flexDirection: 'column' as const }}>
              <div style={{ flex: 1 }}>
                {chartModal.contenido}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header de bienvenida ── */}
      <div style={{ background: AZUL, padding: '14px 20px' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.5px', marginBottom: '2px' }}>
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <div style={{ fontSize: '17px', fontWeight: '700', color: 'white' }}>
          Buenos días, {nombreAsesor.split(' ')[0]} 👋
        </div>
      </div>

      {/* ── Barra de alertas ── */}
      {totalAlertas > 0 && (
        <a href="/clientes" style={{ textDecoration: 'none', display: 'block', background: '#FEF2F2', borderBottom: '1px solid #FECACA', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <span style={{ fontSize: '14px' }}>🔔</span>
          <span style={{ fontSize: '12px', color: '#991B1B', fontWeight: '600' }}>
            Tienes {totalAlertas} pendiente{totalAlertas !== 1 ? 's' : ''} que requiere{totalAlertas !== 1 ? 'n' : ''} atención
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#991B1B', background: '#FEE2E2', padding: '2px 8px', borderRadius: '10px' }}>Ver clientes →</span>
        </a>
      )}
      <style>{`
        .db-outer { display: grid; grid-template-columns: 1fr 12px 190px; gap: 12px; align-items: stretch; }
        .db-kpis  { display: grid; grid-template-columns: repeat(9, 1fr); gap: 8px; }
        .db-charts{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; align-items: stretch; }
        .db-bottom{ display: grid; grid-template-columns: 1fr 12px 320px; gap: 12px; align-items: start; }
        @media (max-width: 1100px) {
          .db-outer  { grid-template-columns: 1fr; }
          .db-kpis   { grid-template-columns: repeat(3, 1fr); }
          .db-charts { grid-template-columns: 1fr; }
          .db-bottom { grid-template-columns: 1fr; }
          .db-sidebar{ display: none; }
          .db-divider{ display: none; }
        }
        @media (max-width: 700px) {
          .db-kpis   { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
      {/* Header */}
      <div style={{ background: '#FFFFFF', borderBottom: '2px solid #E5E7EB', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '15px', fontWeight: '700', color: '#111827', margin: 0 }}>
            Buenos días, <span style={{ color: NARANJA }}>{nombreAsesor}</span>
          </h1>
          <p style={{ fontSize: '12px', color: '#94A3B8', margin: '1px 0 0', textTransform: 'capitalize' }}>{fechaStr}</p>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {/* Botón persistente para reabrir la guía, siempre disponible */}
          <button onClick={() => setShowOnboarding(true)} title="Ver guía de primeros pasos"
            style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F6F9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderRadius: '50%', cursor: 'pointer', fontSize: '13px', color: AZUL, flexShrink: 0 }}>
            ❓
          </button>
          {/* Filtro período */}
          <div style={{ display: 'flex', gap: '2px', background: '#F4F6F9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '3px' }}>
            {(['mes','trimestre','año'] as const).map(p => (
              <button key={p} onClick={() => setFiltroPeriodo(p)}
                style={{ padding: '5px 11px', border: 'none', borderLeft: filtroPeriodo === p ? `2px solid ${NARANJA}` : '2px solid transparent', background: filtroPeriodo === p ? 'white' : 'transparent', color: filtroPeriodo === p ? NARANJA : '#6B7280', fontSize: '11px', fontWeight: filtroPeriodo === p ? '700' as const : '400' as const, cursor: 'pointer', boxShadow: filtroPeriodo === p ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                {p === 'mes' ? 'Mes' : p === 'trimestre' ? 'Trimestre' : 'Año'}
              </button>
            ))}
          </div>
          {/* Filtro tipo */}
          <div style={{ display: 'flex', gap: '2px', background: '#F4F6F9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '3px' }}>
            {([['todos','Todos'],['mod10','Mod 10'],['mod40','Mod 40'],['combo','Combo']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setFiltroTipo(val)}
                style={{ padding: '5px 11px', border: 'none', borderLeft: filtroTipo === val ? `2px solid ${AZUL}` : '2px solid transparent', background: filtroTipo === val ? 'white' : 'transparent', color: filtroTipo === val ? AZUL : '#6B7280', fontSize: '11px', fontWeight: filtroTipo === val ? '700' as const : '400' as const, cursor: 'pointer', boxShadow: filtroTipo === val ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => router.push('/clientes?nuevo=true')}
            style={{ padding: '7px 16px', border: 'none', background: NARANJA, color: 'white', fontSize: '12px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Nuevo cliente
          </button>
        </div>
      </div>

      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Layout general: contenido principal (todas las filas apiladas) | divisor | barra lateral continua de extremo a extremo */}
        <div className="db-outer" style={{ display: 'grid', gridTemplateColumns: '1fr 12px 190px', gap: '12px', alignItems: 'stretch' }}>

          {/* Columna principal: las 4 filas de contenido, apiladas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* Alertas accionables — pendientes que requieren atención hoy */}
            {totalAlertas > 0 && (
              <div style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: '3px solid #DC2626', padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize: '11px', fontWeight: '700' as const, color: '#991B1B', margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                  🔔 Tienes {totalAlertas} pendiente{totalAlertas !== 1 ? 's' : ''} que requiere{totalAlertas === 1 ? '' : 'n'} atención
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '8px' }}>
                  {alertasPago.slice(0, 4).map(a => (
                    <a key={'pago-' + a.cliente.id} href="/clientes"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: '#FEF2F2', border: '1px solid #FCA5A5', fontSize: '11px', color: '#991B1B', textDecoration: 'none' }}>
                      🔴 <strong>{a.cliente.nombre}</strong> — {fmtMXN(a.saldo)} pendiente ({a.diasDesdeEtapa}d)
                    </a>
                  ))}
                  {alertasSeguimiento.slice(0, 4).map(a => (
                    <a key={'seg-' + a.cliente.id} href="/clientes"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: '#FFFBEB', border: '1px solid #FCD34D', fontSize: '11px', color: '#92400E', textDecoration: 'none' }}>
                      🟡 <strong>{a.cliente.nombre}</strong> — sin seguimiento {a.diasSinContacto}d
                    </a>
                  ))}
                  {totalAlertas > 8 && (
                    <span style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', fontSize: '11px', color: '#94A3B8' }}>+{totalAlertas - 8} más</span>
                  )}
                </div>
              </div>
            )}

            {/* Fila 1: KPIs */}
            <div className="db-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '8px' }}>
              {[
                { label: 'Clientes activos', value: clientesActivos.length.toString(), sub: 'en pipeline', color: AZUL },
                { label: 'Prospectos', value: prospectos.length.toString(), sub: `+${clientesNuevosPeriodo} en el periodo`, color: AZUL, filled: true, delta: deltaClientesNuevos },
                { label: 'En diagnóstico', value: enDiagnostico.length.toString(), sub: 'propuesta enviada', color: '#1D4ED8', filled: true },
                { label: 'En recopilación', value: enRecopilacion.length.toString(), sub: 'armando expediente', color: '#0891B2', filled: true },
                { label: 'En trámite', value: enTramite.length.toString(), sub: 'en proceso IMSS', color: '#F59E0B' },
                { label: 'Cierres Exitosos', value: pensionados.length.toString(), sub: `${cierresPeriodo} en el periodo`, color: VERDE, filled: true, delta: deltaCierres },
                { label: 'Cobrado', value: fmtMXN(ingresosTotal), sub: filtroPeriodo, color: VERDE, delta: deltaIngresos },
                { label: 'Por Cobrar', value: fmtMXN(porCobrar), sub: 'saldo pendiente', color: '#F59E0B' },
                { label: 'Ventas Totales', value: fmtMXN(ingresosConComisiones), sub: 'incl. comisiones', color: AZUL },
              ].map((k: any, i) => kpi(k.label, k.value, k.sub, k.color, k.filled, k.delta))}
            </div>

            {/* Fila 2: Tendencias | Embudo | Ventas | Rangos | Servicios activos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px', alignItems: 'stretch' }}>

              {/* Tendencias de ingresos */}
              {chartCard('📈 Tendencias de ingresos', 'Comparativo por año', (() => {
                  const anioActual = new Date().getFullYear()
                  const anios = [anioActual - 2, anioActual - 1, anioActual]
                  const coloresAnio = ['#9CA3AF', NARANJA, AZUL]
                  const MESES_LABEL = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
                  const series = anios.map(anio => MESES_LABEL.map((label, mi) => ({
                    label,
                    total: pagos.filter(p => { const f = new Date(p.fecha_pago); return f.getFullYear() === anio && f.getMonth() === mi }).reduce((s, p) => s + (Number(p.monto) || 0), 0)
                  })))
                  const max = Math.max(...series.flatMap(s => s.map(m => m.total)), 1)
                  const W = 213, H = 80, padL = 12, padR = 8
                  const stepX = (W - padL - padR) / 11
                  const yFor = (v: number) => H - (max > 0 ? (v / max) * (H - 20) : 0) + 10
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%', flex: 1 }}>
                      <svg viewBox={`0 0 ${W} ${H + 16}`} style={{ width: '100%', flex: 1 }}>
                        {series.map((serie, si) => {
                          const puntos = serie.map((m, i) => ({ x: padL + i * stepX, y: yFor(m.total), ...m }))
                          const pathLinea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
                          return (
                            <g key={si}>
                              <path d={pathLinea} fill="none" stroke={coloresAnio[si]} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
                              {puntos.map((p, i) => p.total > 0 && (
                                <circle key={i} cx={p.x} cy={p.y} r={2} fill={coloresAnio[si]} />
                              ))}
                            </g>
                          )
                        })}
                        {MESES_LABEL.map((label, i) => (i % 3 === 0) && (
                          <text key={i} x={padL + i * stepX} y={H + 12} textAnchor="middle" fontSize="8" fill="#9CA3AF">{label}</text>
                        ))}
                      </svg>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        {anios.map((a, i) => (
                          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#64748B' }}>
                            <span style={{ width: '10px', height: '2px', background: coloresAnio[i], display: 'inline-block' }} />{a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
              })())}

              {/* Embudo de clientes */}
              {chartCard('🔻 Embudo de Clientes', 'Por etapa del pipeline', (() => {
                  const etapas = [
                    { id: 'cierre', label: 'Cierre', color: VERDE },
                    { id: 'tramite', label: 'Trámite', color: '#F59E0B' },
                    { id: 'recopilacion', label: 'Recopilación', color: '#0891B2' },
                    { id: 'diagnostico', label: 'Diagnóstico', color: '#1D4ED8' },
                    { id: 'prospecto', label: 'Prospecto', color: AZUL },
                  ]
                  const counts = etapas.map(e => ({ ...e, n: clientesFiltrados.filter(c => (c.etapa_kanban || 'prospecto') === e.id).length }))
                  const max = Math.max(...counts.map(c => c.n), 1)
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '5px', height: '100%', justifyContent: 'space-evenly' }}>
                      {counts.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10px', color: '#64748B', width: '72px', flexShrink: 0 }}>{c.label}</span>
                          <div style={{ flex: 1, background: '#F4F6F9', height: '14px', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${(c.n / max) * 100}%`, height: '100%', background: c.color, minWidth: c.n > 0 ? '4px' : 0, borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151', width: '16px', textAlign: 'right' as const, flexShrink: 0 }}>{c.n}</span>
                        </div>
                      ))}
                    </div>
                  )
              })())}

              {/* Ventas — donut */}
              {chartCard('🍩 Ventas', 'Monto acordado por servicio', (() => {
                  const SERVICIOS_VENTAS = [
                    { id: 'asesoria', label: 'Asesoría', color: AZUL },
                    { id: 'gestion', label: 'Trámite', color: NARANJA },
                    { id: 'gestoria_global', label: 'Gestoría Global', color: '#7C3AED' },
                  ]
                  const items = SERVICIOS_VENTAS.map(s => ({
                    ...s,
                    value: clientesFiltrados.filter(c => c.tipo_servicio === s.id).reduce((sum, c) => sum + (c.monto_acordado || 0), 0)
                  }))
                  const sinClasificarVentas = clientesFiltrados.filter(c => !SERVICIOS_VENTAS.some(s => s.id === c.tipo_servicio)).reduce((sum, c) => sum + (c.monto_acordado || 0), 0)
                  if (sinClasificarVentas > 0) items.push({ id: 'sin_clasificar', label: 'Sin clasificar', color: '#94A3B8', value: sinClasificarVentas })
                  const total = items.reduce((s, it) => s + it.value, 0)
                  const R = 38, CIRC = 2 * Math.PI * R
                  let acc = 0
                  const segmentos = items.filter(it => it.value > 0).map(it => {
                    const pct = total > 0 ? it.value / total : 0
                    const startAcc = acc; acc += pct
                    return { ...it, pct, dash: pct * CIRC, offset: -startAcc * CIRC }
                  })
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                        <svg style={{ width: '100%', maxWidth: '135px', height: 'auto' }} viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r={R} fill="none" stroke="#F3F4F6" strokeWidth="20" />
                          {segmentos.map((it, i) => (
                            <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={it.color} strokeWidth="20"
                              strokeDasharray={`${it.dash} ${CIRC}`} strokeDashoffset={it.offset} transform="rotate(-90 50 50)" />
                          ))}
                          <text x="50" y="50" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#334E7B">
                            {total >= 1000 ? `${(total/1000).toFixed(0)}k` : total.toFixed(0)}
                          </text>
                        </svg>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-evenly' }}>
                        {items.filter(it => it.value > 0).map((it, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ width: '10px', height: '10px', background: it.color, borderRadius: '50%', flexShrink: 0 }} />
                            <span style={{ fontSize: '11px', color: '#374151', flex: 1 }}>{it.label}</span>
                            <span style={{ fontSize: '12px', fontWeight: '700', color: '#1E293B' }}>{total > 0 ? `${Math.round(it.value/total*100)}%` : '0%'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
              })())}
              {chartCard('📦 Servicios activos', 'Por servicio y etapa', (() => {
                  const SERVICIOS = [
                    { id: 'asesoria', label: 'Asesoría' },
                    { id: 'gestion', label: 'Trámite' },
                    { id: 'gestoria_global', label: 'G. Global' },
                  ]
                  const ETAPAS = [
                    { id: 'prospecto', label: 'Prospecto', color: AZUL },
                    { id: 'diagnostico', label: 'Diagnóstico', color: '#F59E0B' },
                    { id: 'recopilacion', label: 'Recop.', color: '#0891B2' },
                    { id: 'tramite', label: 'Trámite', color: '#0EA5E9' },
                    { id: 'cierre', label: 'Cierre', color: '#7C3AED' },
                    { id: 'cancelado', label: 'Cancelado', color: '#94A3B8' },
                  ]
                  const datos = SERVICIOS.map(s => ({
                    ...s,
                    etapas: ETAPAS.map(e => ({ ...e, n: clientesFiltrados.filter(c => c.tipo_servicio === s.id && (c.etapa_kanban || 'prospecto') === e.id).length }))
                  }))
                  const max = Math.max(...datos.flatMap(d => d.etapas.map(e => e.n)), 1)
                  const W = 320, H = 80, padL = 16, padR = 10, groupGap = 14
                  const groupW = (W - padL - padR - groupGap * (datos.length - 1)) / datos.length
                  const barW = groupW / ETAPAS.length
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%' }}>
                      <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: '100%', flex: 1 }}>
                        {datos.map((g, gi) => {
                          const gx = padL + gi * (groupW + groupGap)
                          return (
                            <g key={gi}>
                              {g.etapas.map((e, ei) => {
                                const h = (e.n / max) * (H - 12)
                                const x = gx + ei * barW
                                const y = H - h
                                return (
                                  <g key={ei}>
                                    <rect x={x + 0.5} y={y} width={Math.max(barW - 1, 1)} height={h} rx={1} fill={e.color} />
                                    {e.n > 0 && h > 10 && <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize="7" fontWeight="700" fill="#374151">{e.n}</text>}
                                  </g>
                                )
                              })}
                              <text x={gx + groupW / 2} y={H + 14} textAnchor="middle" fontSize="9" fontWeight="600" fill="#6B7280">{g.label}</text>
                            </g>
                          )
                        })}
                      </svg>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '4px 8px', marginTop: '4px', flexShrink: 0 }}>
                        {ETAPAS.map((e, i) => (
                          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: '#64748B' }}>
                            <span style={{ width: '7px', height: '7px', background: e.color, borderRadius: '2px', display: 'inline-block' as const }} />{e.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
              })(), (() => {
                  const SERVICIOS = [{ id: 'asesoria', label: 'Asesoría' }, { id: 'gestion', label: 'Trámite' }, { id: 'gestoria_global', label: 'Gestión Global' }]
                  const ETAPAS = [
                    { id: 'prospecto', label: 'Prospecto', color: AZUL }, { id: 'diagnostico', label: 'Diagnóstico', color: '#F59E0B' },
                    { id: 'recopilacion', label: 'Recopilación', color: '#0891B2' }, { id: 'tramite', label: 'Trámite', color: '#0EA5E9' },
                    { id: 'cierre', label: 'Cierre', color: '#7C3AED' }, { id: 'cancelado', label: 'Cancelado', color: '#94A3B8' },
                  ]
                  const datos = SERVICIOS.map(s => ({ ...s, etapas: ETAPAS.map(e => ({ ...e, n: clientesFiltrados.filter(c => c.tipo_servicio === s.id && (c.etapa_kanban || 'prospecto') === e.id).length })) }))
                  const max = Math.max(...datos.flatMap(d => d.etapas.map(e => e.n)), 1)
                  const W = 560, H = 220, padL = 30, padR = 10, groupGap = 30
                  const groupW = (W - padL - padR - groupGap * (datos.length - 1)) / datos.length
                  const barW = groupW / ETAPAS.length
                  return (
                    <div>
                      <svg viewBox={`0 0 ${W} ${H + 28}`} style={{ width: '100%', height: 'auto' }}>
                        {[0,0.25,0.5,0.75,1].map((f,i) => <line key={i} x1={padL} x2={W-padR} y1={H-f*(H-20)} y2={H-f*(H-20)} stroke="#F3F4F6" strokeWidth="1"/>)}
                        {datos.map((g, gi) => { const gx = padL + gi * (groupW + groupGap); return (
                          <g key={gi}>{g.etapas.map((e, ei) => { const h=(e.n/max)*(H-20),x=gx+ei*barW,y=H-h; return (<g key={ei}><rect x={x+1} y={y} width={barW-2} height={h} rx={3} fill={e.color}/>{e.n>0&&<text x={x+barW/2} y={y-4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#374151">{e.n}</text>}</g>)})}
                          <text x={gx+groupW/2} y={H+18} textAnchor="middle" fontSize="13" fontWeight="600" fill="#6B7280">{g.label}</text></g>
                        )})}
                      </svg>
                      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '10px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #F3F4F6' }}>
                        {ETAPAS.map((e,i) => <span key={i} style={{ display:'flex',alignItems:'center',gap:'5px',fontSize:'12px',color:'#64748B' }}><span style={{ width:'10px',height:'10px',background:e.color,borderRadius:'2px',display:'inline-block' as const }}/>{e.label}</span>)}
                      </div>
                    </div>
                  )
              })())}

              {chartCard('📐 Rangos de Pensión', 'Distribución', (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px', height: '100%', justifyContent: 'space-evenly' }}>
                  {rangos.map((r, i) => {
                    const count = diagConResultado.filter(d => d.resultado_e4 >= r.min && d.resultado_e4 < r.max).length
                    const pct = diagConResultado.length > 0 ? (count / diagConResultado.length) * 100 : 0
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '9px', color: '#64748B', width: '52px', flexShrink: 0, lineHeight: 1.2 }}>{r.label}</span>
                        <div style={{ flex: 1, height: '10px', background: '#F3F4F6', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: r.color, minWidth: count > 0 ? '3px' : 0, borderRadius: '2px' }} />
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#374151', minWidth: '14px', textAlign: 'right' as const }}>{count}</span>
                      </div>
                    )
                  })}
                </div>
              ), (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '14px' }}>
                  {rangos.map((r, i) => {
                    const count = diagConResultado.filter(d => d.resultado_e4 >= r.min && d.resultado_e4 < r.max).length
                    const pct = diagConResultado.length > 0 ? (count / diagConResultado.length) * 100 : 0
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', color: '#374151', fontWeight: '500', width: '100px', flexShrink: 0 }}>{r.label}</span>
                        <div style={{ flex: 1, height: '28px', background: '#F3F4F6', borderRadius: '6px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: r.color, minWidth: count > 0 ? '6px' : 0, borderRadius: '6px', display: 'flex', alignItems: 'center', paddingLeft: '8px' }}>
                            {pct > 15 && <span style={{ fontSize: '11px', fontWeight: '700', color: 'white' }}>{Math.round(pct)}%</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#1E293B', minWidth: '28px', textAlign: 'right' as const }}>{count}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>{/* fin Fila 2 */}

            {/* Fila 3: KPIs */}
            <div className="db-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '8px' }}>
              {[
                { label: '$ Servicio promedio', value: fmtMXN(ticketPromedio), color: AZUL },
                { label: 'Conversión General', value: fmtPct(tasaConversion), color: VERDE },
                { label: 'Éxitos gestiones', value: fmtPct(tasaExitoGestiones), color: VERDE },
                { label: 'Bateo Diagnóstico', value: fmtPct(bateoDiag), color: '#1D4ED8' },
                { label: 'Bateo Gestoría', value: fmtPct(bateoTramite), color: '#0891B2' },
                { label: 'Cycle time prom.', value: fmtWeeks(cycleTime), color: '#F59E0B' },
                { label: 'Activos este mes', value: diagMes.length.toString(), color: '#7C3AED' },
                { label: 'Promedio Pensión', value: pensionPromedio > 0 ? fmtMXN(pensionPromedio) : '—', color: AZUL },
                { label: '$ Comisiones', value: fmtMXN(comisionesFinancieras), color: NARANJA },
              ].map((k, i) => kpi(k.label, k.value, undefined, k.color))}
            </div>
          </div>

          {/* Divisor vertical continuo, a lo largo de las 4 filas */}
          <div className="db-divider" style={{ width: '1px', background: '#E5E7EB' }} />

          {/* Barra lateral: Agenda + Financieras + Servicios (Ley) — un solo panel continuo, 3 secciones de tamaño fijo (1/3 cada una) */}
          <div className="db-sidebar">
          {card(
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

              {/* Sección 1/3 — Agenda */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <p style={{ fontSize: '12px', fontWeight: '700' as const, color: AZUL, margin: '0 0 10px', textAlign: 'center' as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px', background: '#EEF2F8', borderLeft: `3px solid ${AZUL}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '8px 0', flexShrink: 0 }}>Agenda</p>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: agendaHoy.length === 0 ? 'center' : 'space-evenly', overflow: 'hidden' }}>
                  {agendaHoy.length === 0 ? (
                    <p style={{ fontSize: '12px', color: '#94A3B8', textAlign: 'center' as const }}>Día libre ✅</p>
                  ) : (
                    agendaHoy.slice(0, 4).map(a => (
                      <div key={a.id} style={{ padding: '7px 10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: `2px solid ${NARANJA}`, textAlign: 'center' as const, background: '#FFFBF8' }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titulo}</div>
                        <div style={{ fontSize: '10px', color: '#94A3B8' }}>{new Date(a.fecha_programada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    ))
                  )}
                </div>
                <a href="/seguimiento" style={{ display: 'block', textAlign: 'center' as const, marginTop: '8px', fontSize: '11px', color: '#64748B', textDecoration: 'none', flexShrink: 0 }}>
                  Ver agenda completa →
                </a>
              </div>

              <div style={{ height: '1px', background: '#E5E7EB', margin: '14px 0', flexShrink: 0 }} />

              {/* Sección 2/3 — Financieras */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <p style={{ fontSize: '11px', fontWeight: '700' as const, color: '#374151', margin: '0 0 8px', textAlign: 'center' as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px', flexShrink: 0, paddingBottom: '6px', borderBottom: '1px solid #F3F4F6' }}>Financieras</p>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: financieras.length === 0 ? 'center' : 'space-evenly' }}>
                  {financieras.length === 0 ? (
                    <p style={{ fontSize: '12px', color: '#94A3B8', textAlign: 'center' as const }}>Sin financieras</p>
                  ) : (
                    financieras.slice(0, 5).map((fin) => (
                      <div key={fin.id} style={{ padding: '7px 10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: `2px solid ${VERDE}`, textAlign: 'center' as const, background: '#F9FAFB' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#374151' }}>{fin.nombre}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ height: '1px', background: '#E5E7EB', margin: '14px 0', flexShrink: 0 }} />

              {/* Sección 3/3 — Servicios */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <p style={{ fontSize: '11px', fontWeight: '700' as const, color: '#374151', margin: '0 0 8px', textAlign: 'center' as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px', flexShrink: 0, paddingBottom: '6px', borderBottom: '1px solid #F3F4F6' }}>Servicios</p>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {(() => {
                    const max = Math.max(totalL73, totalL97, 1)
                    const barW = 26
                    const H = 68
                    return (
                      <svg viewBox={`0 0 100 ${H + 16}`} style={{ width: '110px', height: 'auto' }}>
                        {[totalL73, totalL97].map((v, i) => {
                          const h = (v / max) * (H - 8)
                          const x = i === 0 ? 14 : 60
                          return (
                            <g key={i}>
                              <rect x={x} y={H - h} width={barW} height={h} rx={3} fill={i === 0 ? AZUL : VERDE} />
                              <text x={x + barW / 2} y={H - h - 4} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#374151">{v}</text>
                              <text x={x + barW / 2} y={H + 12} textAnchor="middle" fontSize="9.5" fill="#9CA3AF">Ley {i === 0 ? '73' : '97'}</text>
                            </g>
                          )
                        })}
                      </svg>
                    )
                  })()}
                </div>
              </div>

            </div>
          )}
          </div>
        </div>

      </div>

      {/* ── NUEVOS KPIs: Urgencia, Actividad, Costo IA, Pipeline ── */}
      <div style={{ padding: '0 16px 16px' }}>

        {/* Fila: Semáforo de urgencia + Actividad semanal + Costo IA */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>

          {/* Semáforo de urgencia */}
          <div style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderRadius: '10px', padding: '14px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>🚦 Urgencia pensional</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
              {[
                { nivel: 'rojo', label: 'Urgente', val: diagsUrgencia.rojo, color: '#DC2626', bg: '#FEF2F2', desc: 'menos de 2 años' },
                { nivel: 'amarillo', label: 'Pronto', val: diagsUrgencia.amarillo, color: '#D97706', bg: '#FFFBEB', desc: '3 a 5 años' },
                { nivel: 'verde', label: 'Con tiempo', val: diagsUrgencia.verde, color: '#16A34A', bg: '#F0FDF4', desc: 'más de 5 años' },
                { nivel: 'gris', label: 'Sin datos', val: diagsUrgencia.gris, color: '#94A3B8', bg: '#F9FAFB', desc: 'sin diagnóstico' },
              ].map(s => (
                <div key={s.nivel} style={{ background: s.bg, borderRadius: '6px', padding: '8px', borderLeft: `3px solid ${s.color}` }}>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: '10px', fontWeight: '700', color: s.color }}>{s.label}</div>
                  <div style={{ fontSize: '9px', color: '#94A3B8' }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Actividad semanal */}
          <div style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderRadius: '10px', padding: '14px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>📞 Actividad esta semana</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '32px', fontWeight: '800', color: AZUL }}>{actividadesSemana}</div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>actividades registradas</div>
              </div>
              {actividadesSemanaAnt > 0 && (
                <div style={{ fontSize: '12px', fontWeight: '700', color: actividadesSemana >= actividadesSemanaAnt ? '#16A34A' : '#DC2626' }}>
                  {actividadesSemana >= actividadesSemanaAnt ? '↑' : '↓'} {Math.abs(actividadesSemana - actividadesSemanaAnt)} vs semana ant.
                </div>
              )}
            </div>
            <div style={{ height: '6px', background: '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: AZUL, borderRadius: '3px', width: `${Math.min(100, actividadesSemana * 10)}%` }} />
            </div>
            <p style={{ fontSize: '10px', color: '#94A3B8', margin: '4px 0 0' }}>Meta sugerida: 10 actividades/semana</p>
          </div>

          {/* Costo IA este mes */}
          <div style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderRadius: '10px', padding: '14px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>🤖 Costo IA este mes</p>
            <div style={{ fontSize: '28px', fontWeight: '800', color: costoIA > 5 ? '#DC2626' : VERDE, marginBottom: '4px' }}>
              ${costoIA.toFixed(2)} <span style={{ fontSize: '14px', fontWeight: '400', color: '#64748B' }}>USD</span>
            </div>
            <p style={{ fontSize: '11px', color: '#64748B', margin: '0 0 8px' }}>
              ~${(costoIA * 17.5).toFixed(0)} MXN · límite: $10 USD/mes
            </p>
            <div style={{ height: '6px', background: '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: costoIA > 8 ? '#DC2626' : costoIA > 5 ? '#D97706' : VERDE, borderRadius: '3px', width: `${Math.min(100, (costoIA / 10) * 100)}%` }} />
            </div>
            <p style={{ fontSize: '10px', color: '#94A3B8', margin: '4px 0 0' }}>{Math.round((costoIA / 10) * 100)}% del límite mensual usado</p>
          </div>
        </div>

        {/* Fila: Clientes estancados + Valor del pipeline */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

          {/* Clientes estancados */}
          <div style={{ background: '#FFFFFF', border: `1px solid ${clientesEstancados > 0 ? '#FCA5A5' : '#E5E7EB'}`, borderRadius: '10px', padding: '14px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>
              ⏸ Clientes sin avance
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px' }}>
              <div style={{ fontSize: '32px', fontWeight: '800', color: clientesEstancados > 0 ? '#DC2626' : '#16A34A' }}>
                {clientesEstancados}
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', paddingBottom: '4px' }}>
                {clientesEstancados === 0 ? 'Sin clientes estancados ✓' : `cliente${clientesEstancados !== 1 ? 's' : ''} sin cambio de etapa en 60+ días`}
              </div>
            </div>
            {clientesEstancados > 0 && (
              <p style={{ fontSize: '11px', color: '#DC2626', margin: '6px 0 0', fontWeight: '600' }}>
                ⚠️ Revisa su seguimiento — pueden estar en riesgo de cancelación
              </p>
            )}
          </div>

          {/* Valor estimado del pipeline */}
          {(() => {
            const probPorEtapa: Record<string, number> = {
              prospecto: 0.15, diagnostico: 0.35, propuesta_enviada: 0.50,
              recopilacion: 0.65, tramite: 0.80, cierre_exitoso: 1, cancelado: 0,
            }
            const valorPipeline = clientes
              .filter((c: any) => c.activo !== false && !['cierre_exitoso', 'cancelado'].includes(c.etapa_kanban ?? ''))
              .reduce((sum: number, c: any) => {
                const prob = probPorEtapa[c.etapa_kanban ?? 'prospecto'] ?? 0.2
                return sum + ((c.monto_acordado ?? 0) * prob)
              }, 0)
            const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
            return (
              <div style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderRadius: '10px', padding: '14px' }}>
                <p style={{ fontSize: '11px', fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px' }}>
                  💰 Valor estimado del pipeline
                </p>
                <div style={{ fontSize: '28px', fontWeight: '800', color: AZUL }}>
                  {fmtMXN(valorPipeline)}
                </div>
                <p style={{ fontSize: '11px', color: '#64748B', margin: '4px 0 0' }}>
                  Ingresos probables ponderados por probabilidad de cierre por etapa
                </p>
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {Object.entries(probPorEtapa).filter(([k]) => !['cierre_exitoso', 'cancelado'].includes(k)).map(([etapa, prob]) => (
                    <span key={etapa} style={{ fontSize: '9px', padding: '2px 6px', background: '#F4F6F9', color: '#64748B', borderRadius: '4px' }}>
                      {etapa.replace('_', ' ')}: {Math.round(prob * 100)}%
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* ── KPIs Satisfacción del cliente ── */}
        <div style={{ background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: '4px solid #F59E0B', borderRadius: '10px', padding: '14px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 12px' }}>⭐ Satisfacción del cliente — este mes</p>
          {encuestaStats.enviadas === 0 ? (
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>Sin encuestas enviadas este mes. Envíalas desde el expediente de cada cliente al cerrar un caso.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: encuestaStats.promedio >= 4 ? VERDE : encuestaStats.promedio >= 3 ? '#D97706' : '#DC2626' }}>
                  {encuestaStats.promedio > 0 ? encuestaStats.promedio.toFixed(1) : '—'}
                </div>
                <div style={{ fontSize: '16px', letterSpacing: '2px', margin: '2px 0' }}>
                  {'⭐'.repeat(Math.round(encuestaStats.promedio))}
                </div>
                <p style={{ fontSize: '10px', color: '#94A3B8', margin: '4px 0 0', textTransform: 'uppercase' as const }}>Satisfacción</p>
              </div>
              <div style={{ textAlign: 'center' as const, borderLeft: '1px solid #F3F4F6', borderRight: '1px solid #F3F4F6' }}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: encuestaStats.nps >= 50 ? VERDE : encuestaStats.nps >= 0 ? '#D97706' : '#DC2626' }}>
                  {encuestaStats.respondidas > 0 ? `${encuestaStats.nps > 0 ? '+' : ''}${encuestaStats.nps}` : '—'}
                </div>
                <div style={{ fontSize: '11px', color: encuestaStats.nps >= 50 ? VERDE : '#D97706', fontWeight: '600', margin: '2px 0' }}>
                  {encuestaStats.nps >= 70 ? 'Excelente' : encuestaStats.nps >= 50 ? 'Bueno' : encuestaStats.nps >= 0 ? 'Regular' : 'Malo'}
                </div>
                <p style={{ fontSize: '10px', color: '#94A3B8', margin: '4px 0 0', textTransform: 'uppercase' as const }}>NPS</p>
              </div>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: AZUL }}>
                  {encuestaStats.respondidas}<span style={{ fontSize: '16px', color: '#94A3B8' }}>/{encuestaStats.enviadas}</span>
                </div>
                <div style={{ height: '4px', background: '#F3F4F6', borderRadius: '2px', overflow: 'hidden', margin: '6px auto', maxWidth: '60px' }}>
                  <div style={{ height: '100%', background: AZUL, width: `${encuestaStats.enviadas > 0 ? (encuestaStats.respondidas / encuestaStats.enviadas) * 100 : 0}%` }} />
                </div>
                <p style={{ fontSize: '10px', color: '#94A3B8', margin: '4px 0 0', textTransform: 'uppercase' as const }}>Respondidas</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Onboarding — primeros pasos ── */}
      {showOnboarding && (
        <div style={{ position: 'fixed' as const, inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#FFFFFF', width: '100%', maxWidth: '460px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ background: AZUL, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '18px', fontWeight: '800' as const, color: 'white', margin: '0 0 6px' }}>👋 ¡Bienvenido a KSE Pensiones!</p>
                <p style={{ fontSize: '13px', color: '#93C5FD', margin: 0, lineHeight: 1.4 }}>Estos son tus primeros pasos para empezar a trabajar</p>
              </div>
              <button onClick={() => setShowOnboarding(false)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '6px 8px', borderRadius: '6px', flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ padding: '22px 24px' }}>
              {[
                { n: 1, icon: '👤', title: 'Registra tu primer cliente', desc: 'Ve a Clientes → + Nuevo cliente. Solo necesitas nombre y teléfono para empezar.' },
                { n: 2, icon: '🧮', title: 'Corre tu primer diagnóstico', desc: 'Desde la tarjeta del cliente, abre la Calculadora y carga su constancia IMSS de semanas cotizadas.' },
                { n: 3, icon: '📄', title: 'Genera el PDF y autorízalo', desc: 'Cuando el diagnóstico esté listo, autorízalo para generar el PDF oficial que entregarás al cliente.' },
                { n: 4, icon: '📊', title: 'Da seguimiento desde Mi Día', desc: 'Aquí verás tus pendientes, alertas de pago y el progreso de todo tu pipeline cada día.' },
              ].map(s => (
                <div key={s.n} style={{ display: 'flex', gap: '14px', marginBottom: '16px', alignItems: 'flex-start' }}>
                  <div style={{ width: '34px', height: '34px', background: '#EEF2F8', border: `2px solid ${AZUL}`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '15px', fontWeight: '800' as const, color: AZUL }}>{s.n}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '14px', fontWeight: '700' as const, color: '#111827', margin: '0 0 3px' }}>{s.icon} {s.title}</p>
                    <p style={{ fontSize: '13px', color: '#4B5563', margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
                  </div>
                </div>
              ))}

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#4B5563', cursor: 'pointer', marginBottom: '14px', marginTop: '6px' }}>
                <input type="checkbox" checked={noVolverAMostrar} onChange={e => setNoVolverAMostrar(e.target.checked)} />
                No volver a mostrar este mensaje al iniciar sesión
              </label>

              <button onClick={() => { if (noVolverAMostrar) localStorage.setItem('kse_onboarding_oculto', '1'); setShowOnboarding(false) }}
                style={{ width: '100%', padding: '13px', background: NARANJA, color: 'white', border: 'none', fontSize: '14px', fontWeight: '700' as const, cursor: 'pointer', fontFamily: 'inherit', borderRadius: '8px' }}>
                Entendido, ¡empecemos! →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MiDiaPage() {
  return <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 48px)', color: '#94A3B8' }}>Cargando...</div>}><MiDiaInner /></Suspense>
}
