'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1B3A6B', NARANJA = '#F05B21', VERDE = '#2E8B57', FONDO = '#F4F6FB'

const fmtMXN  = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

interface Financiador {
  id: string
  nombre: string
  descripcion: string | null
  logo_url: string | null
  tasa_anual: number
  plazo_min: number | null
  plazo_max: number | null
  monto_min: number | null
  monto_max: number | null
  comision_apertura: number | null
  comision_porcentaje: number | null
  seguro_mensual: number | null
  contacto_nombre: string | null
  contacto_email: string | null
  contacto_telefono: string | null
  activa: boolean
  orden: number | null
}

interface ClienteOpt {
  id: string
  nombre: string
  etapa_kanban: string
}

interface DiagnosticoOpt {
  id: string
  estatus: string | null
  created_at: string
  pension_sin_mod40: number | null
  pension_con_mod40: number | null
  inversion_mod40: number | null
  mod40_umas: number | null
  mod40_meses: number | null
}

interface Financiera {
  id: string
  cliente_id: string
  diagnostico_id: string | null
  diagnostico_estatus: string | null
  pension_sin_mod40: number | null
  pension_con_mod40: number | null
  inversion_mod40_total: number | null
  mod40_umas: number | null
  mod40_meses: number | null
  modalidad_pago: string
  financiador_id: string | null
  monto_credito: number | null
  tasa_mensual_aplicada: number | null
  plazo_meses: number | null
  pct_banco: number | null
  pct_cliente: number | null
  monto_aportacion_cliente: number | null
  costo_financiamiento: number | null
  monto_maximo_pagar: number | null
  descuento_mensual_pension: number | null
  pension_mensual_inmediata: number | null
  periodo_recuperacion_meses: number | null
  flujos_cobrados_80_anios: number | null
  termometro: string | null
  estatus: string
  notas: string | null
  created_at: string
  clientes?: { nombre: string }
}

// ── Cálculo de financiamiento (lógica replicada del Excel de referencia) ──
function calcularFinanciamiento(params: {
  inversionTotal: number
  pensionSinMod40: number
  pensionConMod40: number
  tasaMensual: number // %
  plazoMeses: number
  pctBanco: number // %
  edadActual: number
}) {
  const { inversionTotal, pensionSinMod40, pensionConMod40, tasaMensual, plazoMeses, pctBanco, edadActual } = params

  const montoBanco = inversionTotal * (pctBanco / 100)
  const montoCliente = inversionTotal * (1 - pctBanco / 100)

  // Costo de financiamiento — interés simple mensual sobre saldo durante el plazo del trámite (12 meses) + amortización
  // Réplica de la lógica del Excel: costo = monto × tasa_mensual × plazo_tramite (12m aprox.)
  const plazoTramiteMeses = 12
  const costoFinanciamiento = montoBanco * (tasaMensual / 100) * plazoTramiteMeses
  const montoMaximoPagar = montoBanco + costoFinanciamiento

  // Descuento mensual a la pensión durante el plazo del crédito (amortización simple)
  const descuentoMensual = plazoMeses > 0 ? montoMaximoPagar / plazoMeses : 0

  // Pensión mejorada = pensión con Mod40; pensión inmediata = mejorada - descuento mientras dura el crédito
  const pensionMensualInmediata = Math.max(0, pensionConMod40 - descuentoMensual)

  // Período de recuperación: meses para que la diferencia de pensión (con-sin) cubra la inversión real
  const incrementoPension = pensionConMod40 - pensionSinMod40
  const periodoRecuperacion = incrementoPension > 0 ? inversionTotal / incrementoPension : 0

  // Flujos cobrados hasta los 80 años (proyección simple, sin inflación compuesta para mantener consistencia con Excel)
  const aniosHasta80 = Math.max(0, 80 - edadActual)
  const mesesHasta80 = aniosHasta80 * 12
  const flujosSinFin = pensionSinMod40 * mesesHasta80
  const mesesConDescuento = Math.min(plazoMeses, mesesHasta80)
  const mesesSinDescuento = Math.max(0, mesesHasta80 - mesesConDescuento)
  const flujosConFin = (pensionMensualInmediata * mesesConDescuento) + (pensionConMod40 * mesesSinDescuento)
  const gananciaTotal = flujosConFin - flujosSinFin

  // Termómetro de inversión
  let termometro: 'buena' | 'regular' | 'mala' = 'regular'
  if (periodoRecuperacion > 0 && periodoRecuperacion <= 48) termometro = 'buena'
  else if (periodoRecuperacion > 48 && periodoRecuperacion <= 84) termometro = 'regular'
  else termometro = 'mala'

  return {
    montoBanco, montoCliente, costoFinanciamiento, montoMaximoPagar,
    descuentoMensual, pensionMensualInmediata, periodoRecuperacion,
    flujosSinFin, flujosConFin, gananciaTotal, termometro,
  }
}

function FinanciamientoInner() {
  const supabase = createClient()
  const router = useRouter()
  const userIdRef = useRef<string>('')

  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<'lista' | 'nueva' | 'financiadores'>('lista')
  const [financieras, setFinancieras] = useState<Financiera[]>([])
  const [financiadores, setFinanciadores] = useState<Financiador[]>([])
  const [clientes, setClientes] = useState<ClienteOpt[]>([])
  const [mensaje, setMensaje] = useState('')

  // Form: nueva corrida
  const [clienteSelId, setClienteSelId] = useState('')
  const [diagnosticosCliente, setDiagnosticosCliente] = useState<DiagnosticoOpt[]>([])
  const [diagSelId, setDiagSelId] = useState('')
  const [diagSel, setDiagSel] = useState<DiagnosticoOpt | null>(null)
  const [edadActual, setEdadActual] = useState(60)
  const [modalidadPago, setModalidadPago] = useState<'contado' | 'financiado'>('contado')
  const [financiadorSelId, setFinanciadorSelId] = useState('')
  const [tasaMensual, setTasaMensual] = useState(2.55)
  const [plazoMeses, setPlazoMeses] = useState(60)
  const [pctBanco, setPctBanco] = useState(100)
  const [saving, setSaving] = useState(false)



  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      userIdRef.current = session.user.id

      const [cliRes, finRes, financiadoresRes] = await Promise.all([
        supabase.from('clientes').select('id, nombre, etapa_kanban').eq('asesor_id', session.user.id).eq('activo', true).order('nombre'),
        supabase.from('financiamientos_corridas').select('*, clientes(nombre)').eq('asesor_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('financieras').select('*').order('orden', { ascending: true }),
      ])
      if (cliRes.data) setClientes(cliRes.data)
      if (finRes.data) setFinancieras(finRes.data as any)
      if (financiadoresRes.data) setFinanciadores(financiadoresRes.data)
      setLoading(false)
    })
  }, [])

  // Cuando se selecciona cliente, cargar sus diagnósticos
  useEffect(() => {
    if (!clienteSelId) { setDiagnosticosCliente([]); return }
    supabase.from('diagnosticos')
      .select('id, estatus, created_at, pension_sin_mod40, pension_con_mod40, inversion_mod40, mod40_umas, mod40_meses')
      .eq('cliente_id', clienteSelId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setDiagnosticosCliente(data as any) })

    supabase.from('clientes').select('edad_actual').eq('id', clienteSelId).single()
      .then(({ data }) => { if (data && (data as any).edad_actual) setEdadActual((data as any).edad_actual) })
  }, [clienteSelId])

  // Cuando se selecciona diagnóstico, traer sus datos
  useEffect(() => {
    const d = diagnosticosCliente.find(d => d.id === diagSelId)
    setDiagSel(d || null)
  }, [diagSelId, diagnosticosCliente])

  // Cuando se selecciona financiador, traer su tasa (anual -> mensual) y plazo
  useEffect(() => {
    const f = financiadores.find(f => f.id === financiadorSelId)
    if (f) {
      setTasaMensual(Math.round((f.tasa_anual / 12) * 100) / 100)
      setPlazoMeses(f.plazo_max || f.plazo_min || 60)
    }
  }, [financiadorSelId, financiadores])



  async function guardarCorrida() {
    if (!clienteSelId || !diagSel) { setMensaje('⚠️ Selecciona cliente y diagnóstico'); setTimeout(() => setMensaje(''), 3000); return }
    setSaving(true)

    const inversionTotal = diagSel.inversion_mod40 || 0
    const pensionSin = diagSel.pension_sin_mod40 || 0
    const pensionCon = diagSel.pension_con_mod40 || 0

    let calc: ReturnType<typeof calcularFinanciamiento> | null = null
    if (modalidadPago === 'financiado') {
      calc = calcularFinanciamiento({
        inversionTotal, pensionSinMod40: pensionSin, pensionConMod40: pensionCon,
        tasaMensual, plazoMeses, pctBanco, edadActual,
      })
    }

    const { data, error } = await supabase.from('financiamientos_corridas').insert({
      asesor_id: userIdRef.current,
      cliente_id: clienteSelId,
      diagnostico_id: diagSel.id,
      diagnostico_estatus: diagSel.estatus,
      pension_sin_mod40: pensionSin,
      pension_con_mod40: pensionCon,
      inversion_mod40_total: inversionTotal,
      mod40_umas: diagSel.mod40_umas,
      mod40_meses: diagSel.mod40_meses,
      modalidad_pago: modalidadPago,
      financiador_id: modalidadPago === 'financiado' ? financiadorSelId || null : null,
      monto_credito: calc ? calc.montoBanco : null,
      tasa_mensual_aplicada: modalidadPago === 'financiado' ? tasaMensual : null,
      plazo_meses: modalidadPago === 'financiado' ? plazoMeses : null,
      pct_banco: modalidadPago === 'financiado' ? pctBanco : null,
      pct_cliente: modalidadPago === 'financiado' ? (100 - pctBanco) : null,
      monto_aportacion_cliente: calc ? calc.montoCliente : null,
      costo_financiamiento: calc ? calc.costoFinanciamiento : null,
      monto_maximo_pagar: calc ? calc.montoMaximoPagar : inversionTotal,
      descuento_mensual_pension: calc ? calc.descuentoMensual : 0,
      pension_mensual_inmediata: calc ? calc.pensionMensualInmediata : pensionCon,
      periodo_recuperacion_meses: calc ? calc.periodoRecuperacion : (pensionCon > pensionSin ? inversionTotal / (pensionCon - pensionSin) : 0),
      flujos_cobrados_80_anios: calc ? calc.flujosConFin : null,
      termometro: calc ? calc.termometro : null,
      estatus: 'borrador',
    }).select('*, clientes(nombre)').single()

    setSaving(false)
    if (!error && data) {
      setFinancieras(prev => [data as any, ...prev])
      setVista('lista')
      setMensaje('✓ Corrida financiera guardada')
      setTimeout(() => setMensaje(''), 3000)
      // reset form
      setClienteSelId(''); setDiagSelId(''); setDiagSel(null); setModalidadPago('contado')
    } else if (error) {
      setMensaje('❌ Error: ' + error.message)
      setTimeout(() => setMensaje(''), 5000)
    }
  }

  const labelSt: React.CSSProperties = { fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: '5px' }
  const inputSt: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none' }
  const cardSt: React.CSSProperties = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }

  function kpiBox(label: string, value: string, sub?: string, tema: 'naranja'|'verde'|'azul'|'rojo'|'gris' = 'gris') {
    const themes = {
      naranja: { bg: '#FFF7ED', border: '#fed7aa', accent: NARANJA, txt: '#92400e' },
      verde:   { bg: '#F0FDF4', border: '#bbf7d0', accent: VERDE, txt: '#15803d' },
      azul:    { bg: '#EEF2F8', border: '#bfdbfe', accent: AZUL, txt: '#1e40af' },
      rojo:    { bg: '#FEF2F2', border: '#fecaca', accent: '#dc2626', txt: '#991b1b' },
      gris:    { bg: '#F4F6FB', border: '#e2e8f0', accent: '#64748b', txt: '#64748b' },
    }
    const th = themes[tema]
    return (
      <div style={{ background: th.bg, border: `0.5px solid ${th.border}`, borderLeft: `3px solid ${th.accent}`, borderRadius: '8px', padding: '12px 14px' }}>
        <p style={{ fontSize: '10px', color: th.txt, textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>{label}</p>
        <p style={{ fontSize: '18px', fontWeight: '700', color: th.accent, margin: 0 }}>{value}</p>
        {sub && <p style={{ fontSize: '10px', color: th.txt, margin: '2px 0 0' }}>{sub}</p>}
      </div>
    )
  }

  // Preview calculation for the form
  const previewCalc = diagSel && modalidadPago === 'financiado'
    ? calcularFinanciamiento({
        inversionTotal: diagSel.inversion_mod40 || 0,
        pensionSinMod40: diagSel.pension_sin_mod40 || 0,
        pensionConMod40: diagSel.pension_con_mod40 || 0,
        tasaMensual, plazoMeses, pctBanco, edadActual,
      })
    : null

  const previewContado = diagSel && modalidadPago === 'contado'
    ? {
        periodoRecuperacion: (diagSel.pension_con_mod40 || 0) > (diagSel.pension_sin_mod40 || 0)
          ? (diagSel.inversion_mod40 || 0) / ((diagSel.pension_con_mod40 || 0) - (diagSel.pension_sin_mod40 || 0))
          : 0,
      }
    : null

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: 'calc(100vh - 56px)', width: '100%', background: FONDO, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '12px', width: '100%', boxSizing: 'border-box' as const }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' as const }}>
          <h1 style={{ color: AZUL, fontSize: '19px', fontWeight: '800', margin: 0, flexShrink: 0 }}>Financiamiento</h1>
          <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
            {(['lista', 'nueva', 'financiadores'] as const).map(v => (
              <button key={v} onClick={() => setVista(v)}
                style={{ padding: '7px 14px', whiteSpace: 'nowrap' as const, background: vista === v ? AZUL : 'white', color: vista === v ? 'white' : '#64748b', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                {v === 'lista' ? '📋 Corridas' : v === 'nueva' ? '+ Nueva corrida' : '🏦 Financiadores'}
              </button>
            ))}
          </div>
        </div>
        <a href="/" style={{ fontSize: '12px', color: '#64748b', textDecoration: 'none', fontWeight: '600' }}>← Mi día</a>
      </div>

      {mensaje && (
        <div style={{ position: 'fixed', top: '70px', right: '20px', zIndex: 300, background: mensaje.startsWith('✓') ? '#f0fdf4' : mensaje.startsWith('⚠') ? '#fffbeb' : '#fef2f2', color: mensaje.startsWith('✓') ? '#15803d' : mensaje.startsWith('⚠') ? '#92400e' : '#991b1b', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {mensaje}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', width: '100%', padding: '24px', boxSizing: 'border-box' as const }}>
        <div style={{ width: '100%' }}>

        {/* ══ VISTA: LISTA DE CORRIDAS ══ */}
        {vista === 'lista' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {financieras.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>💳</div>
                <p style={{ fontSize: '14px', marginBottom: '16px' }}>Aún no hay corridas financieras registradas</p>
                <button onClick={() => setVista('nueva')} style={{ background: AZUL, color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>+ Crear primera corrida</button>
              </div>
            )}
            {financieras.map(f => (
              <div key={f.id} style={cardSt}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: '700', color: AZUL, margin: 0 }}>{f.clientes?.nombre || 'Cliente'}</p>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>
                      {new Date(f.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })} · {f.modalidad_pago === 'contado' ? 'Pago de contado' : 'Financiado'}
                      {f.diagnostico_estatus && <span> · Diagnóstico {f.diagnostico_estatus === 'autorizado' ? '✅ autorizado' : '📝 borrador'}</span>}
                    </p>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: '700', background: f.estatus === 'autorizado' ? '#f0fdf4' : '#fffbeb', color: f.estatus === 'autorizado' ? VERDE : '#92400e' }}>
                    {f.estatus === 'autorizado' ? '✅ Autorizado' : '📝 Borrador'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                  {kpiBox('Inversión Mod 40', fmtMXN(f.inversion_mod40_total || 0), `${f.mod40_meses || 0} meses`, 'rojo')}
                  {f.modalidad_pago === 'financiado'
                    ? kpiBox('Descuento mensual', fmtMXN(f.descuento_mensual_pension || 0), `${f.plazo_meses || 0} meses de plazo`, 'naranja')
                    : kpiBox('Recuperación', `${Math.round(f.periodo_recuperacion_meses || 0)} meses`, 'sin financiamiento', 'azul')}
                  {kpiBox('Pensión inmediata', fmtMXN(f.pension_mensual_inmediata || f.pension_con_mod40 || 0), 'mensual', 'verde')}
                  {f.termometro
                    ? kpiBox('Inversión', f.termometro === 'buena' ? '✓ Buena' : f.termometro === 'regular' ? '~ Regular' : '✗ Revisar', `${Math.round(f.periodo_recuperacion_meses || 0)} meses recup.`, f.termometro === 'buena' ? 'verde' : f.termometro === 'regular' ? 'naranja' : 'rojo')
                    : kpiBox('Modalidad', f.modalidad_pago === 'contado' ? 'Contado' : 'Financiado', '', 'gris')}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ VISTA: NUEVA CORRIDA ══ */}
        {vista === 'nueva' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            <div style={cardSt}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: AZUL, margin: '0 0 14px' }}>1. Selecciona cliente y diagnóstico</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={labelSt}>Cliente</label>
                  <select style={inputSt} value={clienteSelId} onChange={e => { setClienteSelId(e.target.value); setDiagSelId('') }}>
                    <option value="">Selecciona un cliente...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelSt}>Diagnóstico</label>
                  <select style={inputSt} value={diagSelId} onChange={e => setDiagSelId(e.target.value)} disabled={!clienteSelId}>
                    <option value="">{clienteSelId ? 'Selecciona un diagnóstico...' : 'Primero selecciona cliente'}</option>
                    {diagnosticosCliente.map(d => (
                      <option key={d.id} value={d.id}>
                        {new Date(d.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })} — {d.estatus === 'autorizado' ? '✅ Autorizado' : '📝 Borrador'} — {fmtMXN(d.pension_con_mod40 || 0)}/mes
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {diagSel && (
                <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {kpiBox('Pensión sin Mod 40', fmtMXN(diagSel.pension_sin_mod40 || 0), 'base', 'gris')}
                  {kpiBox('Pensión con Mod 40', fmtMXN(diagSel.pension_con_mod40 || 0), 'mejorada', 'verde')}
                  {kpiBox('Inversión Mod 40', fmtMXN(diagSel.inversion_mod40 || 0), `${diagSel.mod40_meses} meses`, 'rojo')}
                  {kpiBox('UMAs', `${diagSel.mod40_umas || 0}`, 'cotización', 'azul')}
                </div>
              )}
            </div>

            {diagSel && (
              <div style={cardSt}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: AZUL, margin: '0 0 14px' }}>2. Modalidad de pago</p>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                  {(['contado', 'financiado'] as const).map(m => (
                    <button key={m} onClick={() => setModalidadPago(m)}
                      style={{
                        flex: 1, padding: '14px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px',
                        border: modalidadPago === m ? `2px solid ${AZUL}` : '1.5px solid #e2e8f0',
                        background: modalidadPago === m ? '#EEF2F8' : 'white', color: modalidadPago === m ? AZUL : '#64748b',
                      }}>
                      {m === 'contado' ? '💵 Pago de contado' : '🏦 Financiado en parcialidades'}
                      <div style={{ fontSize: '10px', fontWeight: '400', marginTop: '4px' }}>
                        {m === 'contado' ? 'El cliente paga la inversión total directamente' : 'Un financiador cubre el pago, se descuenta de la pensión'}
                      </div>
                    </button>
                  ))}
                </div>

                {modalidadPago === 'financiado' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={labelSt}>Financiador</label>
                      <select style={inputSt} value={financiadorSelId} onChange={e => setFinanciadorSelId(e.target.value)}>
                        <option value="">Selecciona un financiador (opcional)...</option>
                        {financiadores.filter(f => f.activa).map(f => <option key={f.id} value={f.id}>{f.nombre} — {f.tasa_anual}%/año ({Math.round((f.tasa_anual/12)*100)/100}%/mes)</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      <div>
                        <label style={labelSt}>Tasa mensual (%)</label>
                        <input type="number" step="0.01" style={inputSt} value={tasaMensual} onChange={e => setTasaMensual(parseFloat(e.target.value) || 0)} />
                      </div>
                      <div>
                        <label style={labelSt}>Plazo (meses)</label>
                        <input type="number" style={inputSt} value={plazoMeses} onChange={e => setPlazoMeses(parseInt(e.target.value) || 0)} />
                      </div>
                      <div>
                        <label style={labelSt}>% que aporta el financiador</label>
                        <input type="number" min="0" max="100" style={inputSt} value={pctBanco} onChange={e => setPctBanco(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />
                        <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>Cliente aporta: {100 - pctBanco}%</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {diagSel && modalidadPago === 'financiado' && previewCalc && (
              <div style={cardSt}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: AZUL, margin: '0 0 14px' }}>3. Análisis de la inversión</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  {kpiBox('Monto del crédito', fmtMXN(previewCalc.montoBanco), `${pctBanco}% del financiador`, 'azul')}
                  {kpiBox('Aportación cliente', fmtMXN(previewCalc.montoCliente), `${100 - pctBanco}% del cliente`, 'gris')}
                  {kpiBox('Costo financiamiento', fmtMXN(previewCalc.costoFinanciamiento), `${tasaMensual}%/mes × 12 meses trámite`, 'naranja')}
                  {kpiBox('Monto máximo a pagar', fmtMXN(previewCalc.montoMaximoPagar), 'capital + interés', 'rojo')}
                  {kpiBox('Descuento mensual', fmtMXN(previewCalc.descuentoMensual), `durante ${plazoMeses} meses`, 'naranja')}
                  {kpiBox('Pensión mensual inmediata', fmtMXN(previewCalc.pensionMensualInmediata), 'pensión mejorada - descuento', 'verde')}
                  {kpiBox('Recuperación de inversión', `${Math.round(previewCalc.periodoRecuperacion)} meses`, `~${(previewCalc.periodoRecuperacion/12).toFixed(1)} años`, 'azul')}
                  {kpiBox('Ganancia total hasta los 80', fmtMXN(previewCalc.gananciaTotal), 'vs no hacer nada', previewCalc.gananciaTotal > 0 ? 'verde' : 'rojo')}
                </div>
                <div style={{
                  padding: '12px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', textAlign: 'center' as const,
                  background: previewCalc.termometro === 'buena' ? '#f0fdf4' : previewCalc.termometro === 'regular' ? '#fffbeb' : '#fef2f2',
                  color: previewCalc.termometro === 'buena' ? VERDE : previewCalc.termometro === 'regular' ? '#92400e' : '#991b1b',
                  border: `1px solid ${previewCalc.termometro === 'buena' ? '#bbf7d0' : previewCalc.termometro === 'regular' ? '#fde68a' : '#fecaca'}`,
                }}>
                  {previewCalc.termometro === 'buena' ? '✓ Buena inversión — recuperación rápida' : previewCalc.termometro === 'regular' ? '~ Inversión regular — evalúa con el cliente' : '✗ Revisar — periodo de recuperación largo'}
                </div>
              </div>
            )}

            {diagSel && modalidadPago === 'contado' && previewContado && (
              <div style={cardSt}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: AZUL, margin: '0 0 14px' }}>3. Análisis de la inversión (contado)</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                  {kpiBox('Inversión total', fmtMXN(diagSel.inversion_mod40 || 0), 'pago único', 'rojo')}
                  {kpiBox('Pensión mensual', fmtMXN(diagSel.pension_con_mod40 || 0), 'sin descuentos', 'verde')}
                  {kpiBox('Recuperación', `${Math.round(previewContado.periodoRecuperacion)} meses`, `~${(previewContado.periodoRecuperacion/12).toFixed(1)} años`, 'azul')}
                </div>
              </div>
            )}

            {diagSel && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setVista('lista')} style={{ padding: '12px 20px', border: '1.5px solid #e2e8f0', borderRadius: '8px', background: 'white', color: '#64748b', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={guardarCorrida} disabled={saving} style={{ flex: 1, padding: '12px 20px', border: 'none', borderRadius: '8px', background: saving ? '#94a3b8' : AZUL, color: 'white', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                  {saving ? 'Guardando...' : '💾 Guardar corrida financiera'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ VISTA: FINANCIADORES (catálogo global) ══ */}
        {vista === 'financiadores' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '10px 14px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '12px', color: '#1e40af' }}>
              Catálogo global de financiadoras — gestionado centralmente. Para agregar o editar financiadoras contacta al administrador del sistema.
            </div>

            {financiadores.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94a3b8' }}>
                <div style={{ fontSize: '32px', marginBottom: '10px' }}>🏦</div>
                No hay financiadoras activas en el catálogo
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {financiadores.map(f => (
                <div key={f.id} style={cardSt}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    {f.logo_url && <img src={f.logo_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'contain' as const }} />}
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: AZUL, margin: 0 }}>{f.nombre}</p>
                      {f.descripcion && <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 0' }}>{f.descripcion}</p>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' as const, marginBottom: '8px' }}>
                    <div>
                      <p style={{ fontSize: '9px', color: '#94a3b8', margin: '0 0 2px' }}>TASA ANUAL</p>
                      <p style={{ fontSize: '15px', fontWeight: '700', color: NARANJA, margin: 0 }}>{f.tasa_anual}%</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '9px', color: '#94a3b8', margin: '0 0 2px' }}>TASA MENSUAL APROX.</p>
                      <p style={{ fontSize: '15px', fontWeight: '700', color: AZUL, margin: 0 }}>{Math.round((f.tasa_anual/12)*100)/100}%</p>
                    </div>
                    {f.plazo_max && (
                      <div>
                        <p style={{ fontSize: '9px', color: '#94a3b8', margin: '0 0 2px' }}>PLAZO</p>
                        <p style={{ fontSize: '15px', fontWeight: '700', color: '#374151', margin: 0 }}>{f.plazo_min || 1}-{f.plazo_max}m</p>
                      </div>
                    )}
                  </div>
                  {(f.comision_apertura || f.comision_porcentaje) && (
                    <p style={{ fontSize: '10px', color: '#92400e', margin: '0 0 4px' }}>
                      Comisión: {f.comision_apertura ? fmtMXN(f.comision_apertura) : ''}{f.comision_porcentaje ? ` (${f.comision_porcentaje}%)` : ''}
                    </p>
                  )}
                  {f.contacto_nombre && (
                    <p style={{ fontSize: '11px', color: '#64748b', margin: '6px 0 0', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                      📞 {f.contacto_nombre} {f.contacto_telefono ? `· ${f.contacto_telefono}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        </div>
      </div>
    </div>
  )
}

export default function FinanciamientoPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Cargando…</div>}>
      <FinanciamientoInner />
    </Suspense>
  )
}
