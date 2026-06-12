'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

interface Alerta {
  id: string
  tipo: 'urgente' | 'atencion' | 'info' | 'positivo'
  texto: string
  accion: string
  href: string
}

interface AgendaItem {
  id: string
  titulo: string
  tipo: string
  hora: string
  cliente: string
  notas: string | null
}

interface PipelineItem {
  id: string
  nombre: string
  etapa_desde: string
  etapa_kanban: string
  servicio_contratado: string | null
}

interface CobroPendiente {
  id: string
  nombre: string
  monto_acordado: number
  total_pagado: number
  saldo: number
}

interface KPIs {
  clientes: number
  diagnosticos: number
  cobrado: number
  porCobrar: number
  acordado: number
  cierres1: number
  cierres2: number
}

const TIPO_ICONS: Record<string, string> = { llamada: '📞', whatsapp: '💬', cita: '📅', email: '✉️', nota: '📝' }

const ETAPAS: Record<string, { label: string; color: string; bg: string }> = {
  prospecto:   { label: 'Prospecto',       color: '#64748b', bg: '#f1f5f9' },
  diagnostico: { label: 'Diagnóstico',     color: '#3b82f6', bg: '#eff6ff' },
  propuesta:   { label: 'Propuesta',       color: '#8b5cf6', bg: '#f5f3ff' },
  cierre1:     { label: '⭐ Cierre 1',     color: NARANJA,   bg: '#fff7ed' },
  seguimiento: { label: 'Seguimiento',     color: '#0891b2', bg: '#ecfeff' },
  cierre2:     { label: '⭐ Cierre 2',     color: '#dc2626', bg: '#fef2f2' },
  tramite:     { label: 'Trámite IMSS',    color: VERDE,     bg: '#f0fdf4' },
  pensionado:  { label: 'Pensionado ✅',   color: AZUL,      bg: '#eef2f8' },
}

const fmtMXN = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`
const fmtHora = (d: string | null) => d ? new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
const fmtDias = (d: string | null) => {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'ayer'
  return `hace ${diff} días`
}

const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

function MiDiaInner() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [nombreAsesor, setNombreAsesor] = useState('Asesor')
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [pipeline, setPipeline] = useState<PipelineItem[]>([])
  const [cobros, setCobros] = useState<CobroPendiente[]>([])
  const [kpis, setKpis] = useState<KPIs>({ clientes: 0, diagnosticos: 0, cobrado: 0, porCobrar: 0, acordado: 0, cierres1: 0, cierres2: 0 })

  const hoy = new Date()
  const fechaStr = `${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      loadData(session.user.id)
    })
  }, [])

  async function loadData(uid: string) {
    setLoading(true)

    const startHoy = new Date(); startHoy.setHours(0,0,0,0)
    const endHoy = new Date(); endHoy.setHours(23,59,59,999)
    const hace7dias = new Date(Date.now() - 7 * 86400000).toISOString()
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString()

    const [
      { data: perfil },
      { data: clientes },
      { data: actividadesHoy },
      { data: diagnosticosMes },
      { data: pagosData },
    ] = await Promise.all([
      supabase.from('perfiles_usuario').select('nombre').eq('id', uid).single(),
      supabase.from('clientes').select('*').eq('asesor_id', uid),
      supabase.from('actividades').select('*, clientes(nombre)').eq('asesor_id', uid).eq('estatus', 'pendiente').gte('fecha_programada', startHoy.toISOString()).lte('fecha_programada', endHoy.toISOString()).order('fecha_programada'),
      supabase.from('diagnosticos').select('id').eq('asesor_id', uid).gte('created_at', inicioMes),
      supabase.from('pagos').select('cliente_id, monto').eq('asesor_id', uid),
    ])

    if (perfil?.nombre) setNombreAsesor(perfil.nombre.split(' ')[0])

    // Calcular totales de pago por cliente
    const totalesPagados: Record<string, number> = {}
    pagosData?.forEach((p: any) => { totalesPagados[p.cliente_id] = (totalesPagados[p.cliente_id] ?? 0) + p.monto })

    // KPIs
    const clientesList = (clientes ?? []) as any[]
    const totalCobrado = Object.values(totalesPagados).reduce((s, v) => s + v, 0)
    const totalAcordado = clientesList.reduce((s, c) => s + (c.monto_acordado ?? 0), 0)
    const totalPorCobrar = clientesList.reduce((s, c) => s + Math.max(0, (c.monto_acordado ?? 0) - (totalesPagados[c.id] ?? 0)), 0)
    const cierres1 = clientesList.filter(c => ['seguimiento','tramite','pensionado'].includes(c.etapa_kanban)).length
    const cierres2 = clientesList.filter(c => ['tramite','pensionado'].includes(c.etapa_kanban)).length

    setKpis({
      clientes: clientesList.length,
      diagnosticos: diagnosticosMes?.length ?? 0,
      cobrado: totalCobrado,
      porCobrar: totalPorCobrar,
      acordado: totalAcordado,
      cierres1, cierres2,
    })

    // Cobros pendientes (saldo > 0)
    const cobrosP = clientesList
      .filter(c => (c.monto_acordado ?? 0) > 0 && (totalesPagados[c.id] ?? 0) < (c.monto_acordado ?? 0))
      .map(c => ({ id: c.id, nombre: c.nombre, monto_acordado: c.monto_acordado, total_pagado: totalesPagados[c.id] ?? 0, saldo: c.monto_acordado - (totalesPagados[c.id] ?? 0) }))
      .sort((a, b) => b.saldo - a.saldo)
    setCobros(cobrosP)

    // Alertas inteligentes
    const nuevasAlertas: Alerta[] = []

    // Sin contacto en +7 días
    const sinContacto = clientesList.filter(c => {
      const ult = c.ultimo_contacto ?? c.created_at
      return new Date(ult) < new Date(hace7dias) && !['pensionado'].includes(c.etapa_kanban)
    })
    if (sinContacto.length > 0) {
      nuevasAlertas.push({ id: 'sc', tipo: 'urgente', texto: `${sinContacto.length} cliente${sinContacto.length > 1 ? 's' : ''} sin contacto en más de 7 días`, accion: 'Ver clientes →', href: '/clientes' })
    }

    // Propuestas sin mover
    const enPropuesta = clientesList.filter(c => c.etapa_kanban === 'propuesta')
    if (enPropuesta.length > 0) {
      nuevasAlertas.push({ id: 'prop', tipo: 'atencion', texto: `${enPropuesta.length} propuesta${enPropuesta.length > 1 ? 's' : ''} enviada${enPropuesta.length > 1 ? 's' : ''} esperando respuesta`, accion: 'Ver pipeline →', href: '/clientes' })
    }

    // Pagos pendientes
    if (cobrosP.length > 0) {
      nuevasAlertas.push({ id: 'pago', tipo: 'atencion', texto: `${fmtMXN(totalPorCobrar)} pendientes de cobro en ${cobrosP.length} cliente${cobrosP.length > 1 ? 's' : ''}`, accion: 'Ver cartera →', href: '/clientes' })
    }

    // Cierres en seguimiento
    const enSeguimiento = clientesList.filter(c => c.etapa_kanban === 'seguimiento')
    if (enSeguimiento.length > 0) {
      nuevasAlertas.push({ id: 'seg', tipo: 'info', texto: `${enSeguimiento.length} cliente${enSeguimiento.length > 1 ? 's' : ''} en seguimiento — pendiente de confirmar Cierre 2`, accion: 'Revisar →', href: '/clientes' })
    }

    // Positivo si hay pensionados
    const pensionados = clientesList.filter(c => c.etapa_kanban === 'pensionado')
    if (pensionados.length > 0) {
      nuevasAlertas.push({ id: 'pen', tipo: 'positivo', texto: `${pensionados.length} cliente${pensionados.length > 1 ? 's' : ''} pensionado${pensionados.length > 1 ? 's' : ''} este mes`, accion: 'Ver →', href: '/clientes' })
    }

    if (nuevasAlertas.length === 0) {
      nuevasAlertas.push({ id: 'ok', tipo: 'positivo', texto: '¡Todo al día! No hay alertas pendientes', accion: '', href: '' })
    }

    setAlertas(nuevasAlertas)

    // Agenda hoy
    const agendaItems = (actividadesHoy ?? []).map((a: any) => ({
      id: a.id, titulo: a.titulo, tipo: a.tipo,
      hora: fmtHora(a.fecha_programada),
      cliente: a.clientes?.nombre ?? 'Sin cliente',
      notas: a.notas,
    }))
    setAgenda(agendaItems)

    // Pipeline — clientes en etapas activas ordenados por reciente
    const pipelineItems = clientesList
      .filter(c => !['pensionado'].includes(c.etapa_kanban || 'prospecto'))
      .sort((a, b) => new Date(b.ultimo_contacto ?? b.created_at).getTime() - new Date(a.ultimo_contacto ?? a.created_at).getTime())
      .slice(0, 5)
      .map((c: any) => ({ id: c.id, nombre: c.nombre, etapa_desde: '', etapa_kanban: c.etapa_kanban || 'prospecto', servicio_contratado: c.servicio_contratado }))
    setPipeline(pipelineItems)

    setLoading(false)
  }

  const ALERTA_CONFIG = {
    urgente:  { dot: '#ef4444', bg: '#fff5f5', border: '#fecaca' },
    atencion: { dot: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
    info:     { dot: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
    positivo: { dot: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0' },
  }

  const cardSt: React.CSSProperties = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: '#94a3b8', fontSize: '14px' }}>
      Cargando tu día...
    </div>
  )

  const pctCobrado = kpis.acordado > 0 ? Math.min(100, Math.round((kpis.cobrado / kpis.acordado) * 100)) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ color: AZUL, fontSize: '18px', fontWeight: '800', margin: 0 }}>
            Buenos días, <span style={{ color: NARANJA }}>{nombreAsesor}</span> — aquí está tu día
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0', textTransform: 'capitalize' }}>{fechaStr}</p>
        </div>
        <button onClick={() => router.push('/clientes?nuevo=true')}
          style={{ background: AZUL, color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          + Nuevo cliente
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Acciones rápidas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {[
            { icon: '⊞', label: 'Nuevo diagnóstico', color: AZUL, bg: '#EEF2F8', href: '/calculadora' },
            { icon: '👥', label: 'Ver clientes', color: VERDE, bg: '#f0fdf4', href: '/clientes' },
            { icon: '📞', label: 'Registrar contacto', color: NARANJA, bg: '#fff7ed', href: '/seguimiento' },
            { icon: '📅', label: 'Ver agenda', color: '#8b5cf6', bg: '#f5f3ff', href: '/seguimiento' },
          ].map((a, i) => (
            <a key={i} href={a.href} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', textDecoration: 'none', cursor: 'pointer', transition: 'all 0.15s' }}>
              <div style={{ width: '36px', height: '36px', background: a.bg, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>{a.icon}</div>
              <span style={{ fontSize: '12px', fontWeight: '600', color: a.color }}>{a.label}</span>
            </a>
          ))}
        </div>

        {/* Alertas + Agenda */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Alertas */}
          <div style={cardSt}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px' }}>Requiere tu atención</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {alertas.map(a => {
                const cfg = ALERTA_CONFIG[a.tipo]
                return (
                  <div key={a.id} onClick={() => a.href && router.push(a.href)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '8px', cursor: a.href ? 'pointer' : 'default' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '12px', color: '#374151' }}>{a.texto}</span>
                    {a.accion && <span style={{ fontSize: '11px', color: AZUL, fontWeight: '600', whiteSpace: 'nowrap' }}>{a.accion}</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Agenda hoy */}
          <div style={cardSt}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>Agenda de hoy</p>
              <a href="/seguimiento" style={{ fontSize: '11px', color: NARANJA, fontWeight: '600', textDecoration: 'none' }}>Ver todo →</a>
            </div>
            {agenda.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
                Sin actividades programadas hoy
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {agenda.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8', minWidth: '44px', paddingTop: '1px' }}>{item.hora}</span>
                    <span style={{ fontSize: '16px' }}>{TIPO_ICONS[item.tipo] ?? '📌'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b' }}>{item.titulo}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{item.cliente}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <a href="/seguimiento" style={{ display: 'block', marginTop: '10px', padding: '8px', textAlign: 'center', border: '1.5px dashed #e2e8f0', borderRadius: '8px', fontSize: '12px', color: '#94a3b8', textDecoration: 'none', fontWeight: '600' }}>
              + Agregar actividad
            </a>
          </div>
        </div>

        {/* Cartera + Pipeline */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Cartera */}
          <div style={cardSt}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px' }}>Cartera del mes</p>
            {/* Barra progreso */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              {[
                { label: 'Acordado', value: fmtMXN(kpis.acordado), color: AZUL },
                { label: 'Cobrado', value: fmtMXN(kpis.cobrado), color: VERDE },
                { label: 'Por cobrar', value: fmtMXN(kpis.porCobrar), color: '#ef4444' },
              ].map((k, i) => (
                <div key={i} style={{ background: '#F4F6FB', borderRadius: '8px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '3px' }}>{k.label}</div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                <span style={{ color: '#64748b', fontWeight: '600' }}>Progreso de cobro</span>
                <span style={{ color: VERDE, fontWeight: '700' }}>{pctCobrado}%</span>
              </div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: `linear-gradient(90deg, ${VERDE}, #34d399)`, width: `${pctCobrado}%`, borderRadius: '4px', transition: 'width 0.5s' }} />
              </div>
            </div>
            {/* Lista cobros pendientes */}
            {cobros.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '12px', color: '#94a3b8', fontSize: '12px' }}>✅ Todo cobrado</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <p style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', margin: '0 0 4px' }}>Pendientes de cobro</p>
                {cobros.slice(0, 4).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: '#fff5f5', borderRadius: '6px', border: '1px solid #fecaca' }}>
                    <div style={{ width: '24px', height: '24px', background: AZUL, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '9px', fontWeight: '700', flexShrink: 0 }}>
                      {c.nombre.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ flex: 1, fontSize: '12px', fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                    <span style={{ fontSize: '12px', fontWeight: '800', color: '#ef4444' }}>{fmtMXN(c.saldo)}</span>
                  </div>
                ))}
                {cobros.length > 4 && <p style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', margin: '4px 0 0' }}>+{cobros.length - 4} más</p>}
              </div>
            )}
          </div>

          {/* Pipeline activo */}
          <div style={cardSt}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>Pipeline activo</p>
              <a href="/clientes" style={{ fontSize: '11px', color: NARANJA, fontWeight: '600', textDecoration: 'none' }}>Ver todos →</a>
            </div>
            {pipeline.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '13px' }}>Sin clientes en pipeline</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {pipeline.map(c => {
                  const etapa = ETAPAS[c.etapa_kanban] ?? ETAPAS.prospecto
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                      onClick={() => router.push('/clientes?nuevo=true')}>
                      <div style={{ width: '28px', height: '28px', background: AZUL, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>
                        {c.nombre.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '8px', fontWeight: '600', background: etapa.bg, color: etapa.color, whiteSpace: 'nowrap' }}>{etapa.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* KPIs resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
          {[
            { label: 'Clientes activos', value: kpis.clientes, color: AZUL },
            { label: 'Diagnósticos (mes)', value: kpis.diagnosticos, color: '#8b5cf6' },
            { label: 'Cierres tipo 1', value: kpis.cierres1, color: NARANJA },
            { label: 'Cierres tipo 2', value: kpis.cierres2, color: '#dc2626' },
            { label: 'Pensionados', value: kpis.clientes > 0 ? (kpis.clientes - kpis.cierres1 > 0 ? 0 : 0) : 0, color: VERDE },
          ].map((k, i) => (
            <div key={i} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>{k.label}</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

export default function MiDiaPage() {
  return <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'calc(100vh - 56px)',color:'#94a3b8'}}>Cargando...</div>}><MiDiaInner /></Suspense>
}
