'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { generarPDFProyecto } from '@/app/utils/pdf-generator'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F05B21'
const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

const FACTOR_CESANTIA: Record<number, number> = { 60: 0.75, 61: 0.80, 62: 0.85, 63: 0.90, 64: 0.95 }

interface SysVars {
  UMA_DIARIA: number
  SALARIO_MIN: number
  PMG_L73: number
  PMG_L97: number
  RENDIMIENTO_DEFAULT: number
  mod40_pct?: number
}

interface Cliente { id: string; nombre: string }
interface Financiera { id: string; nombre: string; tasa_anual: number; plazo_min: number; plazo_max: number; monto_min: number; monto_max: number; comision_apertura: number; seguro_mensual: number; contacto_nombre: string | null; contacto_email: string | null; contacto_telefono: string | null }

interface PeriodoSalarial {
  id: string
  fecha_inicio: string
  fecha_fin: string
  sdi: number
  semanas: number
  peso: number
}

interface DatosGenerales {
  nombre: string
  fecha_calculo: string
  fecha_nacimiento: string
  edad_actual: number
  semanas_totales: number
  semanas_descontadas: number
  sigue_cotizando: boolean
  tiene_conyuge: boolean
  num_hijos: number
  num_padres: number
  ley: '73' | '97' | ''
  nss: string
}

interface Escenario {
  id: string
  label: string
  descripcion: string
  mod40_meses: number
  mod40_umas: number
  sdi_base: number
  pension_mensual: number
  inversion_total: number
  costo_mensual_mod40: number
  incremento_vs_base: number
  roi_meses: number
  recomendado: boolean
}

interface AnalisisSeccion {
  titulo: string
  contenido: string
}

// ── FÓRMULAS OFICIALES ─────────────────────────────────────────────
function calcPensionLey73(semanas: number, sdi: number, edadRetiro: number, sys: SysVars, tieneConyuge: boolean, numHijos: number, numPadres: number): number {
  if (semanas < 500) return 0
  const semanasExtra = Math.max(0, semanas - 500)
  const incrementos = Math.floor(semanasExtra / 52)
  const pct = Math.min(1.0, 0.35 + incrementos * 0.0125)
  const pensionDiaria = sdi * pct
  const pensionMensual = pensionDiaria * 30.4
  const base = Math.max(sys.PMG_L73, pensionMensual)
  const factor = edadRetiro < 65 ? (FACTOR_CESANTIA[edadRetiro] ?? 1.0) : 1.0
  // Asignaciones familiares
  const asignConyuge = tieneConyuge ? 0.15 : 0
  const asignHijos = Math.min(numHijos, 2) * 0.10
  const asignPadres = Math.min(numPadres, 2) * 0.10
  const totalAsign = 1 + asignConyuge + asignHijos + asignPadres
  return base * factor * totalAsign
}

function calcPromedioSalarial250(periodos: PeriodoSalarial[]): number {
  if (!periodos.length) return 0
  const totalSem = periodos.reduce((s, p) => s + p.semanas, 0)
  if (totalSem === 0) return 0
  return periodos.reduce((s, p) => s + p.sdi * p.semanas, 0) / totalSem
}

function calcCostoMod40(umasSalario: number, pctMod40: number, sys: SysVars): number {
  const sdIMod40 = umasSalario * sys.UMA_DIARIA * 30.4
  return sdIMod40 * (pctMod40 / 100)
}

function calcCorrida(capital: number, tasaAnual: number, plazo: number) {
  const tm = tasaAnual / 100 / 12
  const cuota = tm > 0 ? capital * (tm * Math.pow(1+tm,plazo)) / (Math.pow(1+tm,plazo)-1) : capital/plazo
  const rows: {mes:number;cuota:number;capital:number;interes:number;saldo:number}[] = []
  let saldo = capital
  for (let i = 1; i <= plazo; i++) {
    const interes = saldo * tm
    const cap = cuota - interes
    saldo = Math.max(0, saldo - cap)
    rows.push({ mes: i, cuota, capital: cap, interes, saldo })
  }
  return { cuota, totalPagado: cuota * plazo, rows }
}

function calcConservacion(semanas: number, mesesDesdeUltimaCot: number): { vigente: boolean; indefinida: boolean; venceEn: number | null; semanasConservacion: number } {
  // Art. 183 LSS 1973: La conservación de derechos equivale a 1/4 del total de semanas cotizadas
  // contado a partir de la última baja. No hay mínimo de semanas para la fórmula, pero sí para pensión (500 sem).
  // Fórmula: semanas_conservacion = semanas_cotizadas / 4
  // Las semanas se convierten a meses para comparar con mesesDesdeUltimaCot
  const semanasConservacion = Math.floor(semanas / 4)
  const mesesConservacion = Math.round(semanasConservacion / 4.33)
  const mesesRestantes = mesesConservacion - mesesDesdeUltimaCot
  const vigente = mesesRestantes > 0
  return {
    vigente,
    indefinida: false, // La Ley 73 no establece conservación indefinida
    venceEn: vigente ? Math.max(0, mesesRestantes) : 0,
    semanasConservacion,
  }
}

// ── DEFAULTS ────────────────────────────────────────────────────────
const DEFAULT_DATOS: DatosGenerales = {
  nombre: '', fecha_calculo: new Date().toISOString().split('T')[0],
  fecha_nacimiento: '', edad_actual: 0, semanas_totales: 0,
  semanas_descontadas: 0, sigue_cotizando: true, tiene_conyuge: false,
  num_hijos: 0, num_padres: 0, ley: '', nss: ''
}

const SYS_DEFAULT: SysVars = {
  UMA_DIARIA: 117.31, SALARIO_MIN: 315.04,
  PMG_L73: 10636.54, PMG_L97: 4345.72,
  RENDIMIENTO_DEFAULT: 6, mod40_pct: 14.438
}

function CalculadoraInner() {
  const supabase = createClient()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [userId, setUserId] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [financieras, setFinancieras] = useState<Financiera[]>([])
  const [sys, setSys] = useState<SysVars>(SYS_DEFAULT)
  const [clienteId, setClienteId] = useState('')

  // Tab state
  const [tab, setTab] = useState(0)
  const TABS = ['Datos generales','Salario 250 sem.','Conservación','Modalidad 40','Modalidad 10','Escenarios','Financiamiento','Resumen']

  // Tab 1 state
  const [datos, setDatos] = useState<DatosGenerales>(DEFAULT_DATOS)
  const [extracting, setExtracting] = useState(false)

  // Tab 2 state
  const [periodos, setPeriodos] = useState<PeriodoSalarial[]>([])
  const [showDetalle250, setShowDetalle250] = useState(false)
  const [sdiPromedio, setSdiPromedio] = useState(0)

  // Tab 3 - conservacion (calculated from datos)
  const [fechaUltimaCot, setFechaUltimaCot] = useState('')

  // Tab 4 state - Mod40
  const [mod40Activo, setMod40Activo] = useState(true)
  const [mod40Umas, setMod40Umas] = useState(15)
  const [mod40Meses, setMod40Meses] = useState(36)

  // Tab 5 - Escenarios
  const [escenarios, setEscenarios] = useState<Escenario[]>([])
  const [escSelIdx, setEscSelIdx] = useState(2)

  // Tab 6 - Financiamiento
  const [finSelId, setFinSelId] = useState('')
  const [finPlazo, setFinPlazo] = useState(36)

  // Tab 7 - Analisis
  const [analisis, setAnalisis] = useState<AnalisisSeccion[]>([])
  const [generandoAnalisis, setGenerandoAnalisis] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [asesorPerfil, setAsesorPerfil] = useState<{razon_social?: string; nombre?: string; logo_url?: string} | null>(null)
  const [showWappModal, setShowWappModal] = useState(false)

  // ── Load inicial
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserId(session.user.id)
      loadClientes(session.user.id)
      loadFinancieras()
      loadSysVars(session.user.id)
      loadAsesorPerfil(session.user.id)
    })
  }, [])

  async function loadClientes(uid: string) {
    const { data } = await supabase.from('clientes').select('id, nombre').eq('asesor_id', uid).order('nombre')
    setClientes(data ?? [])
  }

  async function loadFinancieras() {
    const { data } = await supabase.from('financieras').select('*').eq('activa', true).order('orden')
    if (data?.length) { setFinancieras(data); setFinSelId(data[0].id) }
  }

  async function loadAsesorPerfil(uid: string) {
    const { data } = await supabase.from('perfiles_usuario').select('nombre, razon_social, logo_url').eq('id', uid).single()
    if (data) setAsesorPerfil(data)
  }

  async function loadSysVars(uid: string) {
    const { data } = await supabase.from('perfiles_usuario').select('*').eq('id', uid).single()
    if (data) setSys({
      UMA_DIARIA: data.uma_diaria ?? 117.31,
      SALARIO_MIN: data.salario_minimo ?? 315.04,
      PMG_L73: data.pmg_mensual ?? 10636.54,
      PMG_L97: data.pmg_l97 ?? 4345.72,
      RENDIMIENTO_DEFAULT: data.rendimiento_afore_default ?? 6,
      mod40_pct: data.mod40_2026 ?? 14.438,
    })
  }

  // ── Extraer PDF
  async function extraerPDF(file: File) {
    setExtracting(true)
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res((reader.result as string).split(',')[1])
        reader.onerror = () => rej(new Error('Error leyendo PDF'))
        reader.readAsDataURL(file)
      })
      const response = await fetch('/api/extract-nss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf: base64 })
      })
      const result = await response.json()
      if (result.nombre) {
        const edadCalc = result.fecha_nac
          ? Math.floor((Date.now() - new Date(result.fecha_nac).getTime()) / (365.25 * 86400000))
          : undefined
        // Sugerir "sigue cotizando" si la última cotización fue dentro de los últimos 60 días
        let sigueCotizandoSugerido: boolean | undefined
        if (result.ultima_cotizacion) {
          const diasDesdeUltima = (Date.now() - new Date(result.ultima_cotizacion).getTime()) / 86400000
          sigueCotizandoSugerido = diasDesdeUltima <= 60
        }
        setDatos(prev => ({
          ...prev,
          nombre: result.nombre || prev.nombre,
          semanas_totales: result.semanas || prev.semanas_totales,
          nss: result.nss || prev.nss,
          fecha_nacimiento: result.fecha_nac || prev.fecha_nacimiento,
          edad_actual: edadCalc ?? prev.edad_actual,
          fecha_calculo: result.ultima_cotizacion || prev.fecha_calculo,
          sigue_cotizando: sigueCotizandoSugerido ?? prev.sigue_cotizando,
          ley: result.cotizo_antes_97 ? '73' : '97',
        }))
        if (result.ultima_cotizacion) setFechaUltimaCot(result.ultima_cotizacion)
        // Build periodos from PDF data
        if (result.periodos && Array.isArray(result.periodos)) {
          buildPeriodos250(result.periodos, result.semanas || 0)
        }
      }
    } catch (e) { console.error(e) }
    setExtracting(false)
  }

  function buildPeriodos250(rawPeriodos: any[], totalSemanas: number) {
    // Take last periods summing to 250 weeks
    let acum = 0
    const result: PeriodoSalarial[] = []
    const reversed = [...rawPeriodos].reverse()
    for (const p of reversed) {
      if (acum >= 250) break
      const sem = Math.min(p.semanas || 0, 250 - acum)
      acum += sem
      result.unshift({
        id: Math.random().toString(36).slice(2),
        fecha_inicio: p.fecha_inicio || '',
        fecha_fin: p.fecha_fin || '',
        sdi: p.sdi || 0,
        semanas: sem,
        peso: 0
      })
    }
    // Calculate weights
    const total = result.reduce((s, p) => s + p.semanas, 0)
    const withPeso = result.map(p => ({ ...p, peso: total > 0 ? (p.semanas / total) * 100 : 0 }))
    setPeriodos(withPeso)
    setSdiPromedio(calcPromedioSalarial250(withPeso))
  }

  // Recalculate escenarios when sdiPromedio or mod40 changes
  useEffect(() => { if (sdiPromedio > 0 || datos.semanas_totales > 0) recalcEscenarios() }, [sdiPromedio, datos, mod40Umas, mod40Meses, sys])

  function recalcEscenarios() {
    const sem = datos.semanas_totales - datos.semanas_descontadas
    const edad = datos.edad_actual || 60
    const sdiBase = sdiPromedio || (datos.semanas_totales > 0 ? sys.SALARIO_MIN * 3 : 0)

    const pensionBase = calcPensionLey73(sem, sdiBase, 65, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres)

    const escs: Escenario[] = [
      {
        id: 'e0', label: 'Sin Modalidad 40', descripcion: 'Pensión base con semanas actuales',
        mod40_meses: 0, mod40_umas: 0, sdi_base: sdiBase,
        pension_mensual: pensionBase, inversion_total: 0, costo_mensual_mod40: 0,
        incremento_vs_base: 0, roi_meses: 0, recomendado: false
      },
    ]

    for (const [meses, umas, label, desc] of [
      [12, mod40Umas * 0.7, 'Mod 40 · 12 meses', 'Cotización breve'],
      [24, mod40Umas * 0.85, 'Mod 40 · 24 meses', 'Estrategia media'],
      [mod40Meses, mod40Umas, `Mod 40 · ${mod40Meses} meses`, 'Estrategia óptima'],
    ] as [number, number, string, string][]) {
      const costoMensual = calcCostoMod40(umas, sys.mod40_pct ?? 14.438, sys)
      const invTotal = costoMensual * meses
      // SDI con Mod 40 ponderado
      const sdiMod40 = umas * sys.UMA_DIARIA
      const semMod40 = meses * 4.33
      const semTotal = sem + semMod40
      const sdiNuevo = (sdiBase * sem + sdiMod40 * semMod40) / semTotal
      const pension = calcPensionLey73(semTotal, sdiNuevo, 65, sys, datos.tiene_conyuge, datos.num_hijos, datos.num_padres)
      const incr = pension - pensionBase
      const roi = incr > 0 ? Math.ceil(invTotal / incr) : 0
      escs.push({
        id: `e${meses}`, label, descripcion: desc,
        mod40_meses: meses, mod40_umas: umas, sdi_base: sdiNuevo,
        pension_mensual: pension, inversion_total: invTotal,
        costo_mensual_mod40: costoMensual, incremento_vs_base: incr,
        roi_meses: roi, recomendado: meses === mod40Meses
      })
    }
    setEscenarios(escs)
  }

  const escSel = escenarios[escSelIdx] ?? escenarios[0]
  const finSel = financieras.find(f => f.id === finSelId)
  const corridaFin = finSel && escSel ? calcCorrida(escSel.inversion_total, finSel.tasa_anual, finPlazo) : null
  const conservacion = calcConservacion(datos.semanas_totales, fechaUltimaCot ? Math.floor((Date.now() - new Date(fechaUltimaCot).getTime()) / (30 * 86400000)) : 0)

  // ── Generar PDF completo
  async function exportarPDF() {
    if (!escSel) return
    const doc = generarPDFProyecto({
      datos,
      periodos,
      sdiPromedio,
      escenarios,
      escSelIdx,
      corridaFin: corridaFin ?? undefined,
      finSel: finSel ?? undefined,
      finPlazo,
      analisis,
      logoUrl: asesorPerfil?.logo_url ?? undefined,
      razonSocial: asesorPerfil?.razon_social ?? undefined,
      asesorNombre: asesorPerfil?.nombre ?? undefined,
    })
    const nombre = datos.nombre?.replace(/\s+/g, '_') || 'cliente'
    doc.save(`Proyecto_Pension_${nombre}_${new Date().toISOString().slice(0,10)}.pdf`)
  }

  // ── Generar análisis IA
  async function generarAnalisisIA() {
    if (!escSel) return
    setGenerandoAnalisis(true)
    try {
      const clienteObj = clientes.find(c => c.id === clienteId)
      const res = await fetch('/api/analisis-pensional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: clienteObj?.nombre || datos.nombre,
          ley: datos.ley, semanas: datos.semanas_totales,
          salario: sdiPromedio, edad: datos.edad_actual,
          pension_sin_mod40: escenarios[0]?.pension_mensual,
          pension_con_mod40: escSel.pension_mensual,
          inversion: escSel.inversion_total,
          roi_meses: escSel.roi_meses,
          tiene_conyuge: datos.tiene_conyuge,
          num_hijos: datos.num_hijos,
        })
      })
      const data = await res.json()
      if (data.secciones) setAnalisis(data.secciones)
    } catch (e) { console.error(e) }
    setGenerandoAnalisis(false)
  }

  // ── Guardar diagnóstico
  async function guardarDiagnostico() {
    if (!clienteId || !userId) return
    setGuardando(true)
    await supabase.from('diagnosticos').insert({
      cliente_id: clienteId, asesor_id: userId,
      ley: datos.ley, semanas: datos.semanas_totales,
      salario: sdiPromedio, edad_retiro: 65,
      pension_sin_mod40: escenarios[0]?.pension_mensual,
      pension_con_mod40: escSel?.pension_mensual,
      inversion_mod40: escSel?.inversion_total,
      analisis_narrativo: JSON.stringify(analisis),
      notas: JSON.stringify({ datos, periodos, escenarios }),
    })
    setMensaje('✓ Diagnóstico guardado en el expediente del cliente')
    setTimeout(() => setMensaje(''), 4000)
    setGuardando(false)
  }

  // ── Styles
  const tabSt = (i: number): React.CSSProperties => ({
    padding: '8px 14px', fontSize: '12px', fontWeight: tab === i ? '600' : '400',
    color: tab === i ? NARANJA : '#64748b', cursor: 'pointer',
    whiteSpace: 'nowrap', background: 'none', border: 'none',
    borderBottom: `2px solid ${tab === i ? NARANJA : 'transparent'}`,
    marginBottom: '-1px',
  })

  const inputSt: React.CSSProperties = {
    display: 'block', width: '100%', padding: '8px 10px',
    border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px',
    boxSizing: 'border-box', fontFamily: 'inherit', background: 'white',
    color: '#1e293b', outline: 'none',
  }

  const numInputSt: React.CSSProperties = { ...inputSt, textAlign: 'right' }
  const autoInputSt: React.CSSProperties = { ...inputSt, background: '#EFF6FF', borderColor: '#bfdbfe' }
  const autoNumInputSt: React.CSSProperties = { ...numInputSt, background: '#EFF6FF', borderColor: '#bfdbfe' }
  const manualInputSt: React.CSSProperties = { ...inputSt, background: '#F8FAFC', borderColor: '#e2e8f0' }
  const manualNumInputSt: React.CSSProperties = { ...numInputSt, background: '#F8FAFC', borderColor: '#e2e8f0' }
  const sysInputSt: React.CSSProperties = { ...inputSt, background: '#F5F3FF', borderColor: '#ddd6fe' }
  const sysNumInputSt: React.CSSProperties = { ...numInputSt, background: '#F5F3FF', borderColor: '#ddd6fe' }

  const legendoDot = (bg: string, border: string) => (
    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: bg, border: `1px solid ${border}`, marginRight: '4px', verticalAlign: 'middle' }}></span>
  )

  const guiaCampos = (compact = false) => (
    <div style={{ padding: compact ? '8px 12px' : '12px 16px', background: '#FAFAFA', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: compact ? '10px' : '11px', color: '#64748b', display: 'flex', flexWrap: 'wrap' as const, gap: compact ? '10px' : '16px', alignItems: 'center' }}>
      {!compact && <strong style={{ color: '#374151' }}>Guía de campos:</strong>}
      <span>{legendoDot('#EFF6FF', '#bfdbfe')} <strong>Azul</strong> — se llena al cargar la constancia IMSS</span>
      <span>{legendoDot('#F5F3FF', '#ddd6fe')} <strong>Morado</strong> — viene de Configuración del sistema</span>
      <span>{legendoDot('#F8FAFC', '#e2e8f0')} <strong>Gris</strong> — captúralo tú o pídelo al cliente</span>
    </div>
  )

  const labelSt: React.CSSProperties = {
    display: 'block', fontSize: '10px', fontWeight: '700',
    color: '#475569', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px',
  }

  const cardSt: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px',
  }

  const kpiSt: React.CSSProperties = {
    background: '#F4F6FB', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px',
  }

  const btnPrimary: React.CSSProperties = {
    padding: '9px 20px', background: NARANJA, color: 'white', border: 'none',
    borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
  }

  const btnSecondary: React.CSSProperties = {
    padding: '9px 16px', background: 'white', color: '#374151',
    border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px',
    fontWeight: '500', cursor: 'pointer',
  }

  const sectionTitle = (t: string, sub?: string) => (
    <div style={{ marginBottom: '10px' }}>
      <p style={{ fontSize: '11px', fontWeight: '700', color: '#475569', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t}</p>
      {sub && <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )

  const kpiBox = (label: string, value: string, sub?: string, color = '#1e293b') => (
    <div style={kpiSt}>
      <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: '700', color }}>{value}</div>
      {sub && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>{sub}</div>}
    </div>
  )

  const semaforo = (ok: boolean, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ok ? VERDE : '#ef4444', flexShrink: 0 }} />
      <span style={{ color: ok ? VERDE : '#ef4444', fontWeight: '500' }}>{label}</span>
    </div>
  )

  const navBar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #e2e8f0', background: 'white', flexShrink: 0 }}>
      <div>
        <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Calculadora de pensión</p>
        <p style={{ fontSize: '11px', color: '#94a3b8', margin: '1px 0 0' }}>
          {tab + 1} de {TABS.length} — {TABS[tab]}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <select value={clienteId} onChange={e => setClienteId(e.target.value)}
          style={{ ...inputSt, width: '200px', fontSize: '12px', padding: '6px 10px' }}>
          <option value="">— Seleccionar cliente —</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: extracting ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600', color: AZUL, background: '#EEF2F8', whiteSpace: 'nowrap' }}>
          {extracting ? '⏳ Extrayendo...' : '📄 Cargar constancia IMSS'}
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} disabled={extracting}
            onChange={e => { const f = e.target.files?.[0]; if (f) extraerPDF(f) }} />
        </label>
      </div>
    </div>
  )

  const tabBar = (
    <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e2e8f0', overflowX: 'auto', background: 'white', flexShrink: 0, padding: '0 20px' }}>
      {TABS.map((t, i) => (
        <button key={i} onClick={() => setTab(i)} style={tabSt(i)}>
          {i < tab ? '✓ ' : ''}{t}
        </button>
      ))}
    </div>
  )

  const navButtons = (prev?: () => void, next?: () => void, nextLabel = 'Siguiente →') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
      {prev ? <button onClick={prev} style={btnSecondary}>← Anterior</button> : <div />}
      {next && <button onClick={next} style={btnPrimary}>{nextLabel}</button>}
    </div>
  )


  // ══════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      {navBar}
      {tabBar}

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#FAFAFA' }}>

        {/* ══ TAB 1: DATOS GENERALES ══════════════════════════════ */}
        {tab === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {guiaCampos()}
            {datos.semanas_totales === 0 && (
              <div style={{ padding: '12px 16px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', color: AZUL }}>
                📄 Carga la constancia de semanas cotizadas del IMSS en PDF y los datos se completarán automáticamente.
              </div>
            )}

            <div style={cardSt}>
              {sectionTitle('Identificación del trabajador')}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div><label style={labelSt}>Nombre completo</label>
                  <input style={autoInputSt} value={datos.nombre} onChange={e => setDatos(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre del trabajador" /></div>
                <div><label style={labelSt}>NSS</label>
                  <input style={autoInputSt} value={datos.nss} onChange={e => setDatos(p => ({ ...p, nss: e.target.value }))} placeholder="NSS" /></div>
                <div><label style={labelSt}>Régimen</label>
                  <select style={autoInputSt} value={datos.ley} onChange={e => setDatos(p => ({ ...p, ley: e.target.value as '73' | '97' }))}>
                    <option value="">Detectar automáticamente</option>
                    <option value="73">Ley 73 (cotizó antes de Jul 1997)</option>
                    <option value="97">Ley 97 (solo cotizó después de Jul 1997)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                <div><label style={labelSt}>Fecha de nacimiento</label>
                  <input type="date" style={autoInputSt} value={datos.fecha_nacimiento} onChange={e => {
                    const edad = e.target.value ? Math.floor((Date.now() - new Date(e.target.value).getTime()) / (365.25 * 86400000)) : 0
                    setDatos(p => ({ ...p, fecha_nacimiento: e.target.value, edad_actual: edad }))
                  }} /></div>
                <div><label style={labelSt}>Edad actual</label>
                  <input type="number" style={autoNumInputSt} value={datos.edad_actual || ''} onChange={e => setDatos(p => ({ ...p, edad_actual: parseInt(e.target.value) || 0 }))} /></div>
                <div><label style={labelSt}>Fecha de cálculo / baja IMSS</label>
                  <input type="date" style={autoInputSt} value={datos.fecha_calculo} onChange={e => setDatos(p => ({ ...p, fecha_calculo: e.target.value }))} /></div>
                <div><label style={labelSt}>Semanas cotizadas</label>
                  <input type="number" style={autoNumInputSt} value={datos.semanas_totales || ''} onChange={e => setDatos(p => ({ ...p, semanas_totales: parseInt(e.target.value) || 0 }))} /></div>
              </div>
            </div>

            <div style={cardSt}>
              {sectionTitle('Situación laboral y familiar')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={labelSt}>¿Sigue cotizando al IMSS?{datos.fecha_calculo && <span style={{ color: AZUL, fontWeight: '600', textTransform: 'none' }}> · sugerido</span>}</label>
                  <select style={datos.fecha_calculo ? autoInputSt : manualInputSt} value={datos.sigue_cotizando ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, sigue_cotizando: e.target.value === 'si' }))}>
                    <option value="si">Sí</option><option value="no">No</option>
                  </select>
                  {datos.fecha_calculo && <p style={{ fontSize: '9px', color: '#94a3b8', margin: '2px 0 0' }}>Basado en la última cotización registrada. Verifica con el cliente.</p>}
                </div>
                <div><label style={labelSt}>Semanas descontadas AFORE/ISSSTE</label>
                  <input type="number" style={manualNumInputSt} value={datos.semanas_descontadas || ''} onChange={e => setDatos(p => ({ ...p, semanas_descontadas: parseInt(e.target.value) || 0 }))} placeholder="0" /></div>
                <div><label style={labelSt}>¿Tiene esposa(o)/concubina(o)?</label>
                  <select style={manualInputSt} value={datos.tiene_conyuge ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, tiene_conyuge: e.target.value === 'si' }))}>
                    <option value="si">Sí (+15%)</option><option value="no">No</option>
                  </select></div>
                <div><label style={labelSt}>Hijos menores de 16 / est. hasta 25</label>
                  <input type="number" style={manualNumInputSt} value={datos.num_hijos || ''} onChange={e => setDatos(p => ({ ...p, num_hijos: parseInt(e.target.value) || 0 }))} placeholder="0" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                <div><label style={labelSt}>Padres económicamente dependientes</label>
                  <input type="number" style={manualNumInputSt} value={datos.num_padres || ''} onChange={e => setDatos(p => ({ ...p, num_padres: parseInt(e.target.value) || 0 }))} placeholder="0" /></div>
              </div>
            </div>

            {/* Cálculos automáticos */}
            {datos.semanas_totales > 0 && (() => {
              const sem = datos.semanas_totales - datos.semanas_descontadas
              const cumple = sem >= 500
              const edadMin = 65
              const asignaciones = (datos.tiene_conyuge ? 15 : 0) + datos.num_hijos * 10 + datos.num_padres * 10
              return (
                <div style={{ ...cardSt, borderLeft: `3px solid ${cumple ? VERDE : '#ef4444'}` }}>
                  {sectionTitle('Resumen automático')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '12px' }}>
                    {kpiBox('Semanas válidas', sem.toLocaleString(), 'descontadas AFORE', cumple ? VERDE : '#ef4444')}
                    {kpiBox('Edad mín. pensión', `${edadMin} años`, 'Vejez (sin Mod 40)', AZUL)}
                    {kpiBox('Asignaciones familiares', `+${asignaciones}%`, `cónyuge + ${datos.num_hijos} hijo(s)`, '#8b5cf6')}
                    {kpiBox('Régimen', datos.ley === '73' ? 'Ley 73' : datos.ley === '97' ? 'Ley 97' : 'Por detectar', datos.ley ? 'Detectado del PDF' : 'Carga la constancia', AZUL)}
                    {kpiBox('Estado', cumple ? 'Apto' : 'Insuficiente', `${Math.max(0, 500 - sem)} sem. faltan`, cumple ? VERDE : '#ef4444')}
                  </div>
                  {semaforo(cumple, cumple ? `Cumple semanas mínimas — ${sem} de 500 requeridas` : `Faltan ${500 - sem} semanas para poder pensionarse`)}
                </div>
              )
            })()}

            {navButtons(undefined, () => setTab(1), 'Siguiente: Salario promedio 250 sem. →')}
          </div>
        )}

        {/* ══ TAB 2: SALARIO PROMEDIO 250 SEMANAS ════════════════ */}
        {tab === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px 16px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', color: AZUL, lineHeight: 1.6 }}>
              <strong>¿Por qué calculamos esto?</strong> La Ley del IMSS 1973 (Art. 167) establece que la pensión se calcula sobre el promedio del SDI de las <strong>últimas 250 semanas cotizadas</strong> (~5 años), no sobre el SDI actual. Este promedio es la base real de la pensión. Si se usa el SDI actual, el cálculo puede estar sobreestimado o subestimado.
            </div>

            {/* Resumen */}
            <div style={{ ...cardSt, borderLeft: `3px solid ${NARANJA}` }}>
              {sectionTitle('Resumen del cálculo', periodos.length > 0 ? `${periodos.length} períodos analizados · ${periodos.reduce((s,p) => s+p.semanas, 0)} semanas` : 'Carga la constancia IMSS para calcular automáticamente')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                {kpiBox('SDI promedio 250 sem.', sdiPromedio > 0 ? fmtMXN2(sdiPromedio) : '—', 'Base oficial de pensión', AZUL)}
                {kpiBox('SDI mensual equivalente', sdiPromedio > 0 ? fmtMXN(sdiPromedio * 30.4) : '—', '× 30.4 días')}
                {kpiBox('Diferencia vs SDI actual', periodos.length > 0 && sdiPromedio > 0 ? fmtMXN2(periodos[periodos.length-1]?.sdi - sdiPromedio) : '—', 'SDI actual vs promedio', periodos.length > 0 && periodos[periodos.length-1]?.sdi > sdiPromedio ? '#ef4444' : VERDE)}
                {kpiBox('Período cubierto', periodos.length > 0 ? `${periodos[0]?.fecha_inicio?.slice(0,7) || '—'} → ${periodos[periodos.length-1]?.fecha_fin?.slice(0,7) || '—'}` : '—', '250 semanas hacia atrás')}
              </div>

              {periodos.length > 0 && (
                <>
                  {/* Tabla condensada — top 5 períodos por peso */}
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#F4F6FB' }}>
                          {['Período','Semanas','SDI diario','SDI mensual','Peso'].map((h, i) => (
                            <th key={i} style={{ padding: '7px 10px', textAlign: i > 0 ? 'right' : 'left', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {periodos.slice(0, 5).map((p, i) => (
                          <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 10px', color: '#374151' }}>{p.fecha_inicio?.slice(0,7)} → {p.fecha_fin?.slice(0,7)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.semanas}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: AZUL }}>{fmtMXN2(p.sdi)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{fmtMXN(p.sdi * 30.4)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>{p.peso.toFixed(1)}%</td>
                          </tr>
                        ))}
                        {periodos.length > 5 && (
                          <tr style={{ background: '#F4F6FB' }}>
                            <td colSpan={5} style={{ padding: '6px 10px', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
                              … {periodos.length - 5} períodos más — ver detalle completo
                            </td>
                          </tr>
                        )}
                        <tr style={{ background: '#EEF2F8', borderTop: '2px solid #e2e8f0' }}>
                          <td style={{ padding: '7px 10px', fontWeight: '700', color: AZUL }}>Promedio ponderado</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>{periodos.reduce((s,p) => s+p.semanas, 0)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '800', color: NARANJA }}>{fmtMXN2(sdiPromedio)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>{fmtMXN(sdiPromedio * 30.4)}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <button onClick={() => setShowDetalle250(true)}
                    style={{ ...btnSecondary, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📊 Ver desglose completo de las 250 semanas
                  </button>
                </>
              )}

              {periodos.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', background: '#F4F6FB', borderRadius: '8px', color: '#94a3b8', fontSize: '12px' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>📄</div>
                  Carga la constancia IMSS en PDF (botón en la parte superior) para calcular automáticamente el promedio de las 250 semanas.<br />
                  También puedes ingresar los períodos manualmente.
                </div>
              )}
            </div>

            {navButtons(() => setTab(0), () => setTab(2), 'Siguiente: Conservación de derechos →')}
          </div>
        )}

        {/* ══ TAB 3: CONSERVACIÓN DE DERECHOS ════════════════════ */}
        {tab === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px 16px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', color: AZUL, lineHeight: 1.6 }}>
              <strong>Art. 182 Ley del Seguro Social 1973:</strong> Cuando un trabajador deja de cotizar, sus derechos pensionarios se conservan por un período proporcional. Es crítico saber si el cliente puede iniciar el trámite ahora o si ya perdió sus derechos.
            </div>

            {guiaCampos(true)}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={cardSt}>
                <label style={labelSt}>Fecha de última cotización</label>
                <input type="date" style={autoInputSt} value={fechaUltimaCot} onChange={e => setFechaUltimaCot(e.target.value)} />
              </div>
              <div style={cardSt}>
                <label style={labelSt}>Semanas cotizadas totales</label>
                <input type="number" style={autoNumInputSt} value={datos.semanas_totales || ''} readOnly />
              </div>
            </div>

            {(() => {
              const mesesDesde = fechaUltimaCot ? Math.floor((Date.now() - new Date(fechaUltimaCot).getTime()) / (30 * 86400000)) : 0
              const cons = calcConservacion(datos.semanas_totales, mesesDesde)
              const color = cons.vigente ? VERDE : '#ef4444'
              return (
                <div style={{ ...cardSt, borderLeft: `3px solid ${color}` }}>
                  {sectionTitle('Estado de conservación de derechos')}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px' }}>
                    {kpiBox('Estado', cons.vigente ? 'Vigente' : 'Vencido', cons.venceEn ? `${cons.venceEn} meses restantes (${cons.semanasConservacion} sem de conservación)` : 'Período vencido', color)}
                    {kpiBox('Semanas cotizadas', datos.semanas_totales.toLocaleString(), 'total histórico', datos.semanas_totales >= 500 ? VERDE : '#f59e0b')}
                    {kpiBox('Plazo de conservación', cons.indefinida ? 'Indefinido' : cons.venceEn !== null ? `${cons.venceEn} meses` : 'Sin conservación', cons.indefinida ? '500+ semanas' : 'Art. 182 LSS')}
                    {kpiBox('Meses desde última cot.', mesesDesde.toString(), fechaUltimaCot ? new Date(fechaUltimaCot).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }) : '—')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {semaforo(cons.vigente, cons.indefinida ? 'Derechos conservados indefinidamente — puede tramitar en cualquier momento' : cons.vigente ? `Derechos vigentes — le quedan ${cons.venceEn} meses para iniciar el trámite` : 'Derechos vencidos — no puede pensionarse bajo este régimen')}
                    {semaforo(datos.semanas_totales >= 500, datos.semanas_totales >= 500 ? 'Cumple semanas mínimas (500)' : `Faltan ${Math.max(0, 500 - datos.semanas_totales)} semanas`)}
                  </div>
                </div>
              )
            })()}

            <div style={cardSt}>
              {sectionTitle('Tabla de referencia — Art. 182 LSS 1973')}
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F4F6FB' }}>
                      {['Semanas cotizadas','Tiempo de conservación','Condición'].map((h, i) => (
                        <th key={i} style={{ padding: '7px 12px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Menos de 150', 'Sin conservación', 'No hay derechos pensionarios', '#ef4444'],
                      ['150 – 499 semanas', 'Mitad de las semanas cotizadas (en meses)', 'Condicional — tiempo limitado', '#f59e0b'],
                      ['500 o más semanas', 'Indefinido — sin vencimiento', 'Derechos conservados siempre', VERDE],
                    ].map(([sem, tiempo, cond, color], i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: datos.semanas_totales >= 500 && i === 2 ? '700' : '400', color: '#374151' }}>{sem} {datos.semanas_totales >= 500 && i === 2 ? '✓' : ''}</td>
                        <td style={{ padding: '8px 12px', color: '#374151' }}>{tiempo}</td>
                        <td style={{ padding: '8px 12px' }}><span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: `${color}20`, color, fontWeight: '600' }}>{cond}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {navButtons(() => setTab(1), () => setTab(3), 'Siguiente: Modalidad 40 →')}
          </div>
        )}

        {/* ══ TAB 4: MODALIDAD 40 ═════════════════════════════════ */}
        {tab === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px 16px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', color: AZUL, lineHeight: 1.6 }}>
              <strong>Modalidad 40 (Art. 218 LSS 1973):</strong> Permite al trabajador cotizar voluntariamente sobre un salario superior al actual, incrementando la base de cálculo de su pensión. Es la estrategia de optimización pensional más poderosa disponible en México.
            </div>

            {guiaCampos(true)}
            <div style={cardSt}>
              {sectionTitle('Configuración de la Modalidad 40')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <label style={labelSt}>Salario base Mod 40 (veces UMA)</label>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 5px', lineHeight: 1.4 }}>El salario sobre el que el cliente quiere cotizar voluntariamente. A mayor UMA, mayor pensión final pero mayor costo mensual. Rango típico: 10–25 UMAs.</p>
                  <input type="number" step="0.5" style={manualNumInputSt} value={mod40Umas} onChange={e => setMod40Umas(parseFloat(e.target.value) || 1)} />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>SDI: {fmtMXN2(mod40Umas * sys.UMA_DIARIA)}/día</p>
                </div>
                <div>
                  <label style={labelSt}>Período de cotización (meses)</label>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 5px', lineHeight: 1.4 }}>Cuántos meses pagará Modalidad 40 antes de tramitar la pensión. Solo cuentan los <strong>últimos 60 meses</strong> (5 años) para el promedio del SDI — periodos más largos no incrementan más la pensión pero sí el costo total.</p>
                  <input type="number" style={manualNumInputSt} value={mod40Meses} onChange={e => setMod40Meses(parseInt(e.target.value) || 1)} />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>{(mod40Meses * 4.33).toFixed(0)} semanas adicionales</p>
                </div>
                <div>
                  <label style={labelSt}>Tasa Mod 40 {new Date().getFullYear()} (%)</label>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 5px', lineHeight: 1.4 }}>Porcentaje que el IMSS cobra mensualmente sobre el SDI elegido. Se actualiza cada año conforme a la UMA — no se edita aquí.</p>
                  <input type="number" step="0.001" style={sysNumInputSt} value={sys.mod40_pct ?? 14.438} readOnly />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>Configurable en Configuración</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px' }}>
                {kpiBox('Costo mensual', fmtMXN(calcCostoMod40(mod40Umas, sys.mod40_pct ?? 14.438, sys)), 'Pago mensual al IMSS', NARANJA)}
                {kpiBox('Inversión total', fmtMXN(calcCostoMod40(mod40Umas, sys.mod40_pct ?? 14.438, sys) * mod40Meses), `${mod40Meses} meses`)}
                {kpiBox('SDI con Mod 40', fmtMXN2(mod40Umas * sys.UMA_DIARIA), 'Salario cotizado')}
                {kpiBox('Semanas que agrega', `${(mod40Meses * 4.33).toFixed(0)}`, 'al historial')}
              </div>
            </div>

            {/* Tabla de cotización mensual */}
            <div style={cardSt}>
              {sectionTitle('Proyección de cotización mensual', `${mod40Meses} meses · ${fmtMXN(calcCostoMod40(mod40Umas, sys.mod40_pct ?? 14.438, sys))}/mes`)}
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#F4F6FB' }}>
                      {['Mes','SDI cotizado','Cuota mensual','Acumulado','Semanas Mod 40'].map((h, i) => (
                        <th key={i} style={{ padding: '7px 10px', textAlign: i === 0 ? 'center' : 'right', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', borderRight: i < 4 ? '1px solid #f1f5f9' : 'none' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const costoMensual = calcCostoMod40(mod40Umas, sys.mod40_pct ?? 14.438, sys)
                      const sdiMod40 = mod40Umas * sys.UMA_DIARIA
                      const rows = []
                      const showMonths = [1, 2, 3, Math.floor(mod40Meses/2), mod40Meses]
                      for (const mes of [...new Set(showMonths)].filter(m => m >= 1 && m <= mod40Meses)) {
                        rows.push(
                          <tr key={mes} style={{ background: mes % 2 === 0 ? '#F8FAFC' : 'white', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94a3b8', fontWeight: '600', borderRight: '1px solid #f1f5f9' }}>{mes}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: AZUL, borderRight: '1px solid #f1f5f9' }}>{fmtMXN2(sdiMod40)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151', borderRight: '1px solid #f1f5f9' }}>{fmtMXN(costoMensual)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: VERDE, borderRight: '1px solid #f1f5f9' }}>{fmtMXN(costoMensual * mes)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{(mes * 4.33).toFixed(1)}</td>
                          </tr>
                        )
                        if (mes === 3 && mod40Meses > 5) rows.push(
                          <tr key="dots" style={{ background: '#F8FAFC' }}>
                            <td colSpan={5} style={{ padding: '5px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>⋯ meses intermedios ⋯</td>
                          </tr>
                        )
                      }
                      return rows
                    })()}
                    <tr style={{ background: '#EEF2F8', borderTop: '2px solid #e2e8f0' }}>
                      <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: '700', color: AZUL, borderRight: '1px solid #e2e8f0' }}>Total</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b', borderRight: '1px solid #e2e8f0' }}>—</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: NARANJA, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(calcCostoMod40(mod40Umas, sys.mod40_pct ?? 14.438, sys))}/mes</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '800', color: AZUL, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(calcCostoMod40(mod40Umas, sys.mod40_pct ?? 14.438, sys) * mod40Meses)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: VERDE }}>{(mod40Meses * 4.33).toFixed(0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: '12px 16px', background: '#F0FDF4', border: '1px solid #bbf7d0', borderRadius: '10px', fontSize: '12px', color: '#15803d', lineHeight: 1.6 }}>
              <strong>¿Tu cliente es trabajador independiente o no califica para Mod 40?</strong> La <strong>Modalidad 10</strong> permite afiliarse al IMSS con cobertura completa (médica + pensión + Infonavit) y puede usarse como paso previo para habilitar Mod 40.{' '}
              <button onClick={() => setTab(4)} style={{ background: 'none', border: 'none', color: '#15803d', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', fontSize: '12px', padding: 0 }}>Ver Modalidad 10 →</button>
            </div>
            {navButtons(() => setTab(2), () => setTab(5), 'Siguiente: Escenarios de pensión →')}
          </div>
        )}


        {/* ══ TAB 4: MODALIDAD 10 ══════════════════════════════════ */}
        {tab === 4 && (() => {
          const UMA_DIARIA = sys.UMA_DIARIA || 113.14
          const DIAS_MES = 30.4
          const TASA_M10 = 0.22
          const TASA_M40 = sys.mod40_pct ? sys.mod40_pct / 100 : 0.14438
          const sbcMensual = mod40Umas * UMA_DIARIA * DIAS_MES
          const cuotaM10 = sbcMensual * TASA_M10
          const cuotaM40 = sbcMensual * TASA_M40
          const diferencia = cuotaM10 - cuotaM40
          const totalM10 = cuotaM10 * mod40Meses
          const totalM40 = cuotaM40 * mod40Meses
          const semanas = Math.round(mod40Meses * 4.33)
          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px 16px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', color: AZUL, lineHeight: 1.6 }}>
              <strong>Modalidad 10 — Incorporación Voluntaria al Régimen Obligatorio (Art. 240 LSS):</strong> Permite a trabajadores independientes afiliarse al IMSS con cobertura integral. Más cara que Mod 40 porque incluye todos los ramos de seguro, pero es la única vía legal para independientes sin patrón.
            </div>

            {guiaCampos(true)}

            <div style={cardSt}>
              {sectionTitle('Configuración (comparte parámetros con Mod 40)')}
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '-4px 0 10px' }}>Los valores de UMAs y meses se toman de la pestaña Modalidad 40. Ajústalos ahí para actualizar esta comparativa.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div>
                  <label style={labelSt}>Salario base (UMAs)</label>
                  <input type="number" style={manualNumInputSt} value={mod40Umas} readOnly />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>SDI: {fmtMXN2(mod40Umas * UMA_DIARIA)}/día</p>
                </div>
                <div>
                  <label style={labelSt}>Meses de cotización</label>
                  <input type="number" style={manualNumInputSt} value={mod40Meses} readOnly />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>{semanas} semanas adicionales</p>
                </div>
                <div>
                  <label style={labelSt}>Tasa Mod 10 (estimada)</label>
                  <input type="number" style={sysNumInputSt} value={22} readOnly />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>% promedio todos los ramos</p>
                </div>
              </div>
            </div>

            <div style={cardSt}>
              {sectionTitle('Comparativa de costos')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div style={{ background: '#EEF2F8', borderRadius: '10px', padding: '14px', border: '2px solid #bfdbfe' }}>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 4px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Modalidad 40</p>
                  <p style={{ fontSize: '22px', fontWeight: '700', color: AZUL, margin: '0 0 4px' }}>{fmtMXN(cuotaM40)}<span style={{ fontSize: '12px', fontWeight: '400' }}>/mes</span></p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Total {mod40Meses} meses: {fmtMXN(totalM40)}</p>
                </div>
                <div style={{ background: '#F0FDF4', borderRadius: '10px', padding: '14px', border: '1px solid #bbf7d0' }}>
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 4px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Modalidad 10</p>
                  <p style={{ fontSize: '22px', fontWeight: '700', color: VERDE, margin: '0 0 4px' }}>{fmtMXN(cuotaM10)}<span style={{ fontSize: '12px', fontWeight: '400' }}>/mes</span></p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Total {mod40Meses} meses: {fmtMXN(totalM10)}</p>
                </div>
              </div>
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#92400e' }}>
                Por <strong>{fmtMXN(diferencia)}/mes</strong> más ({fmtMXN(totalM10 - totalM40)} en total), Mod 10 agrega: servicio médico completo para el titular y familia, guarderías, cobertura de riesgos de trabajo e Infonavit.
              </div>
            </div>

            <div style={cardSt}>
              {sectionTitle('¿Qué incluye cada modalidad?')}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Beneficio</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '700', color: AZUL, fontSize: '10px', textTransform: 'uppercase' }}>Mod 40</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '700', color: VERDE, fontSize: '10px', textTransform: 'uppercase' }}>Mod 10</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Mejora SDI para pensión', true, true],
                    ['Acumula semanas cotizadas', true, true],
                    ['Seguro de Invalidez y Vida', true, true],
                    ['Servicio médico IMSS', false, true],
                    ['Seguro de Enf. y Maternidad', false, true],
                    ['Seguro de Riesgos de Trabajo', false, true],
                    ['Guarderías y Prestaciones Sociales', false, true],
                    ['Aportaciones Infonavit', false, true],
                    ['Requiere historial previo IMSS', true, false],
                    ['Disponible para independientes', false, true],
                  ].map(([label, m40, m10], i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', color: '#374151' }}>{label as string}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{m40 ? '✅' : '❌'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{m10 ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={cardSt}>
              {sectionTitle('Flujo estratégico recomendado')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#374151', lineHeight: 1.7 }}>
                <div style={{ padding: '10px 14px', background: '#F4F6FB', borderRadius: '8px', borderLeft: '3px solid ' + AZUL }}>
                  <strong>Si el cliente tiene historial IMSS y no necesita servicio médico</strong> → Mod 40 directamente. Maximiza pensión al menor costo.
                </div>
                <div style={{ padding: '10px 14px', background: '#F4F6FB', borderRadius: '8px', borderLeft: '3px solid ' + VERDE }}>
                  <strong>Si el cliente es independiente sin cobertura médica</strong> → Mod 10. Protección completa para él y su familia mientras acumula semanas.
                </div>
                <div style={{ padding: '10px 14px', background: '#FFF7ED', borderRadius: '8px', borderLeft: '3px solid #f97316' }}>
                  <strong>Si no califica para Mod 40 (lleva mucho tiempo sin cotizar)</strong> → Mod 10 por mínimo 12 meses, luego migra a Mod 40. La Mod 10 rehabilita su vigencia de derechos.
                </div>
              </div>
            </div>

            <div style={{ padding: '10px 14px', background: '#F8FAFC', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', color: '#64748b', lineHeight: 1.6 }}>
              ⚠️ La tasa del 22% es un estimado — el monto exacto varía según actividad económica y zona geográfica.{' '}
              <a href="https://serviciosdigitales.imss.gob.mx/gestionAsegurados-web/asegurados/incorporacionVoluntaria" target="_blank" rel="noopener noreferrer" style={{ color: AZUL, fontWeight: '700' }}>Calcular cuota exacta en el portal oficial del IMSS →</a>
            </div>

            {navButtons(() => setTab(3), () => setTab(5), 'Siguiente: Escenarios de pensión →')}
          </div>
          )
        })()}

        {/* ══ TAB 5: ESCENARIOS ═══════════════════════════════════ */}
        {tab === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {escenarios.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>
                Completa los datos generales y el salario promedio para ver los escenarios.
              </div>
            ) : (
              <>
                {/* Selector de escenarios */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${escenarios.length}, 1fr)`, gap: '10px' }}>
                  {escenarios.map((esc, i) => (
                    <div key={esc.id} onClick={() => setEscSelIdx(i)}
                      style={{ border: `${escSelIdx === i ? '2px' : '1px'} solid ${escSelIdx === i ? NARANJA : '#e2e8f0'}`, borderRadius: '10px', padding: '12px', cursor: 'pointer', background: escSelIdx === i ? '#fff5f2' : 'white', transition: 'all .15s', position: 'relative' }}>
                      {esc.recomendado && <div style={{ position: 'absolute', top: '-1px', right: '-1px', background: NARANJA, color: 'white', fontSize: '9px', fontWeight: '700', padding: '2px 7px', borderRadius: '0 8px 0 6px' }}>⭐ ÓPTIMO</div>}
                      <div style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '3px' }}>Escenario {i + 1}</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '2px' }}>{esc.label}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>{esc.descripcion}</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: i === 0 ? '#94a3b8' : escSelIdx === i ? NARANJA : AZUL }}>{fmtMXN(esc.pension_mensual)}/mes</div>
                      {esc.inversion_total > 0 && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Inv: {fmtMXN(esc.inversion_total)}</div>}
                    </div>
                  ))}
                </div>

                {/* Comparativo visual */}
                <div style={cardSt}>
                  {sectionTitle('Comparativo de pensión mensual')}
                  {escenarios.map((esc, i) => {
                    const maxPension = Math.max(...escenarios.map(e => e.pension_mensual))
                    const pct = maxPension > 0 ? (esc.pension_mensual / maxPension) * 100 : 0
                    const colors = ['#94a3b8', '#3b82f6', '#F05B21', '#1B3A6B']
                    return (
                      <div key={esc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', width: '130px', flexShrink: 0 }}>{esc.label}</span>
                        <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: colors[i] ?? AZUL, borderRadius: '4px', transition: 'width .4s' }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: colors[i] ?? AZUL, width: '90px', textAlign: 'right' }}>{fmtMXN(esc.pension_mensual)}</span>
                        {i > 0 && <span style={{ fontSize: '10px', color: VERDE, width: '60px', textAlign: 'right' }}>+{fmtMXN(esc.incremento_vs_base)}</span>}
                      </div>
                    )
                  })}
                </div>

                {/* Detalle del escenario seleccionado */}
                {escSel && (
                  <div style={{ ...cardSt, borderLeft: `3px solid ${NARANJA}` }}>
                    {sectionTitle(`Detalle — ${escSel.label}`, escSel.descripcion)}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                      {kpiBox('Pensión mensual', fmtMXN(escSel.pension_mensual), 'incluyendo asignaciones', VERDE)}
                      {kpiBox('Pensión anual', fmtMXN(escSel.pension_mensual * 12), 'proyección año 1')}
                      {escSel.inversion_total > 0 ? kpiBox('Inversión total', fmtMXN(escSel.inversion_total), `${escSel.mod40_meses} meses Mod 40`) : kpiBox('Inversión', '$0', 'Sin Modalidad 40')}
                      {escSel.roi_meses > 0 ? kpiBox('Punto de equilibrio', `${escSel.roi_meses} meses`, 'ROI de la inversión', '#8b5cf6') : kpiBox('Incremento', '+$0', 'Pensión base')}
                    </div>
                    {escSel.inversion_total > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                        {kpiBox('Incremento vs sin Mod 40', `+${fmtMXN(escSel.incremento_vs_base)}/mes`, 'ingreso adicional mensual', NARANJA)}
                        {kpiBox('Ingreso adicional 10 años', fmtMXN(escSel.incremento_vs_base * 120), 'vs pensión base', AZUL)}
                        {kpiBox('Incremento porcentual', escenarios[0]?.pension_mensual > 0 ? `+${Math.round((escSel.incremento_vs_base / escenarios[0].pension_mensual) * 100)}%` : '—', 'sobre pensión base', VERDE)}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {navButtons(() => setTab(3), () => setTab(6), 'Siguiente: Financiamiento →')}
          </div>
        )}

        {/* ══ TAB 6: FINANCIAMIENTO ═══════════════════════════════ */}
        {tab === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px 16px', background: '#EEF2F8', border: '1px solid #bfdbfe', borderRadius: '10px', fontSize: '12px', color: AZUL, lineHeight: 1.6 }}>
              Si el cliente no puede pagar la Modalidad 40 de contado, una financiera puede adelantar el capital. La pensión obtenida debe superar la cuota mensual del crédito — de lo contrario el financiamiento no es viable.
            </div>

            {financieras.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', background: '#F4F6FB', borderRadius: '10px', color: '#94a3b8', fontSize: '12px' }}>
                No hay financieras aliadas configuradas. Agrega financieras en Configuración.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div style={cardSt}>
                    <label style={labelSt}>Financiera aliada</label>
                    <select style={inputSt} value={finSelId} onChange={e => setFinSelId(e.target.value)}>
                      {financieras.map(f => <option key={f.id} value={f.id}>{f.nombre} — {f.tasa_anual}% anual</option>)}
                    </select>
                  </div>
                  <div style={cardSt}>
                    <label style={labelSt}>Capital a financiar</label>
                    <input type="number" style={numInputSt} value={Math.round(escSel?.inversion_total || 0)} readOnly />
                    <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>Del escenario seleccionado</p>
                  </div>
                  <div style={cardSt}>
                    <label style={labelSt}>Plazo (meses)</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {finSel && [12, 24, 36, 48].filter(p => p >= finSel.plazo_min && p <= finSel.plazo_max).map(p => (
                        <button key={p} onClick={() => setFinPlazo(p)}
                          style={{ flex: 1, padding: '8px 4px', borderRadius: '7px', border: `2px solid ${finPlazo === p ? AZUL : '#e2e8f0'}`, background: finPlazo === p ? AZUL : 'white', color: finPlazo === p ? 'white' : '#64748b', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {p}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {corridaFin && escSel && (
                  <>
                    {/* KPIs viabilidad */}
                    <div style={{ ...cardSt, borderLeft: `3px solid ${corridaFin.cuota < (escSel.pension_mensual) ? VERDE : '#ef4444'}` }}>
                      {sectionTitle('Análisis de viabilidad')}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                        {kpiBox('Cuota mensual crédito', fmtMXN(corridaFin.cuota), `${finSel?.tasa_anual}% anual · ${finPlazo} meses`, NARANJA)}
                        {kpiBox('Pensión obtenida', fmtMXN(escSel.pension_mensual), `Escenario ${escSelIdx + 1}`, VERDE)}
                        {kpiBox('Saldo neto mensual', fmtMXN(escSel.pension_mensual - corridaFin.cuota), 'Pensión − cuota', escSel.pension_mensual > corridaFin.cuota ? VERDE : '#ef4444')}
                        {kpiBox('Total a pagar', fmtMXN(corridaFin.totalPagado), `Capital + intereses`, '#64748b')}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {semaforo(corridaFin.cuota < escSel.pension_mensual, corridaFin.cuota < escSel.pension_mensual ? 'La pensión cubre la cuota mensual del crédito' : 'La cuota supera la pensión — revisar plazo o escenario')}
                        {semaforo(escSel.pension_mensual - corridaFin.cuota > 2000, escSel.pension_mensual - corridaFin.cuota > 2000 ? `Margen cómodo: ${fmtMXN(escSel.pension_mensual - corridaFin.cuota)}/mes sobrante` : 'Margen ajustado — evaluar con el cliente')}
                      </div>
                    </div>

                    {/* Tabla amortización */}
                    <div style={cardSt}>
                      {sectionTitle('Tabla de amortización', `Primeros 6 meses de ${finPlazo} · tabla completa en PDF`)}
                      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' }}>
                          <thead>
                            <tr style={{ background: '#F4F6FB' }}>
                              {['#', 'Cuota', 'Capital', 'Interés', 'Saldo'].map((h, i) => (
                                <th key={i} style={{ padding: '7px 10px', textAlign: i === 0 ? 'center' : 'right', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', borderRight: i < 4 ? '1px solid #f1f5f9' : 'none' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {corridaFin.rows.slice(0, 6).map((r, i) => (
                              <tr key={r.mes} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94a3b8', fontWeight: '600', borderRight: '1px solid #f1f5f9' }}>{r.mes}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: AZUL, borderRight: '1px solid #f1f5f9' }}>{fmtMXN(r.cuota)}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', color: VERDE, borderRight: '1px solid #f1f5f9' }}>{fmtMXN(r.capital)}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', color: NARANJA, borderRight: '1px solid #f1f5f9' }}>{fmtMXN(r.interes)}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>{fmtMXN(r.saldo)}</td>
                              </tr>
                            ))}
                            <tr style={{ background: '#EEF2F8', borderTop: '2px solid #e2e8f0' }}>
                              <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: '700', color: AZUL, borderRight: '1px solid #e2e8f0' }}>Tot</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(corridaFin.totalPagado)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: VERDE, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(escSel.inversion_total)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: NARANJA, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(corridaFin.totalPagado - escSel.inversion_total)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: '#374151' }}>—</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            {navButtons(() => setTab(5), () => setTab(7), 'Siguiente: Resumen ejecutivo →')}
          </div>
        )}

        {/* ══ TAB 7: RESUMEN EJECUTIVO ════════════════════════════ */}
        {tab === 7 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mensaje && <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: VERDE }}>{mensaje}</div>}

            {/* Header resumen */}
            <div style={{ ...cardSt, borderLeft: `3px solid ${NARANJA}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', margin: '0 0 3px' }}>
                    Proyecto de pensión — {datos.nombre || 'Sin nombre'}
                  </p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                    {datos.ley === '73' ? 'Ley 73' : datos.ley === '97' ? 'Ley 97' : 'Régimen pendiente'} · {escSel?.label || 'Escenario no seleccionado'} · {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button onClick={guardarDiagnostico} disabled={!clienteId || guardando}
                    style={{ ...btnSecondary, fontSize: '12px', opacity: !clienteId ? 0.5 : 1 }}>
                    {guardando ? '⏳ Guardando...' : '💾 Guardar'}
                  </button>
                  <button onClick={generarAnalisisIA} disabled={generandoAnalisis || escenarios.length === 0}
                    style={{ ...btnSecondary, fontSize: '12px', color: '#8b5cf6', borderColor: '#c4b5fd' }}>
                    {generandoAnalisis ? '⏳ Generando...' : '✨ Análisis IA'}
                  </button>
                  <button onClick={exportarPDF} disabled={escenarios.length === 0}
                    style={{ ...btnPrimary, fontSize: '12px', opacity: escenarios.length === 0 ? 0.5 : 1 }}>
                    📄 Exportar PDF
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* Columna izq */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={cardSt}>
                  {sectionTitle('Datos del trabajador')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px' }}>
                    {[
                      ['Nombre', datos.nombre || '—'],
                      ['NSS', datos.nss || '—'],
                      ['Edad', datos.edad_actual ? `${datos.edad_actual} años` : '—'],
                      ['Régimen', datos.ley === '73' ? 'Ley 73 (pre-1997)' : datos.ley === '97' ? 'Ley 97 (post-1997)' : '—'],
                      ['Semanas cotizadas', datos.semanas_totales.toLocaleString()],
                      ['SDI promedio 250 sem.', sdiPromedio > 0 ? fmtMXN2(sdiPromedio) : '—'],
                      ['Asignaciones familiares', `+${(datos.tiene_conyuge ? 15 : 0) + datos.num_hijos * 10}%`],
                      ['Conservación derechos', conservacion.vigente ? (conservacion.indefinida ? 'Indefinida ✓' : `${conservacion.venceEn} meses`) : 'Vencida ✗'],
                    ].map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ color: '#94a3b8' }}>{l}</span>
                        <span style={{ fontWeight: '500', color: '#374151' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={cardSt}>
                  {sectionTitle('Pensión sin Modalidad 40')}
                  <div style={{ fontSize: '26px', fontWeight: '700', color: '#94a3b8', marginBottom: '4px' }}>{fmtMXN(escenarios[0]?.pension_mensual || 0)}/mes</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>SDI base: {fmtMXN2(sdiPromedio)} · Pensión base sin estrategia</div>
                </div>
              </div>

              {/* Columna der */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ ...cardSt, border: `2px solid ${NARANJA}` }}>
                  {sectionTitle('Pensión recomendada', escSel?.label)}
                  <div style={{ fontSize: '30px', fontWeight: '700', color: AZUL, marginBottom: '4px' }}>{fmtMXN(escSel?.pension_mensual || 0)}/mes</div>
                  {escSel && escSel.incremento_vs_base > 0 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', background: '#f0fdf4', borderRadius: '20px', fontSize: '12px', fontWeight: '700', color: VERDE, marginBottom: '10px' }}>
                      +{Math.round((escSel.incremento_vs_base / (escenarios[0]?.pension_mensual || 1)) * 100)}% sobre pensión base
                    </div>
                  )}
                  {escSel && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {kpiBox('Inversión total', fmtMXN(escSel.inversion_total))}
                      {kpiBox('Cuota financiera', corridaFin ? fmtMXN(corridaFin.cuota) + '/mes' : '—')}
                      {kpiBox('Incremento mensual', `+${fmtMXN(escSel.incremento_vs_base)}`, 'vs sin Mod 40', VERDE)}
                      {kpiBox('ROI', escSel.roi_meses > 0 ? `${escSel.roi_meses} meses` : '—', 'punto de equilibrio', '#8b5cf6')}
                    </div>
                  )}
                </div>

                <div style={cardSt}>
                  {sectionTitle('Semáforo de viabilidad')}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {semaforo(datos.semanas_totales >= 500, datos.semanas_totales >= 500 ? `Cumple semanas mínimas — ${datos.semanas_totales} de 500` : 'No cumple semanas mínimas')}
                    {semaforo(conservacion.vigente, conservacion.vigente ? (conservacion.indefinida ? 'Derechos conservados indefinidamente' : `Derechos vigentes — ${conservacion.venceEn} meses restantes`) : 'Derechos pensionarios vencidos')}
                    {corridaFin && escSel && semaforo(corridaFin.cuota < escSel.pension_mensual, corridaFin.cuota < escSel.pension_mensual ? 'Pensión cubre la cuota del financiamiento' : 'Cuota supera la pensión — revisar')}
                    {escSel && semaforo((escSel.roi_meses || 999) < 60, (escSel.roi_meses || 0) < 60 ? `ROI positivo en ${escSel.roi_meses} meses` : 'ROI mayor a 5 años — evaluar con cliente')}
                  </div>
                </div>
              </div>
            </div>

            {/* Análisis narrativo IA */}
            {analisis.length > 0 && (
              <div style={cardSt}>
                {sectionTitle('Análisis narrativo — Resumen ejecutivo', 'Generado por IA · Editable por el asesor')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {analisis.map((sec, i) => (
                    <div key={i} style={{ borderBottom: i < analisis.length - 1 ? '1px solid #f1f5f9' : 'none', paddingBottom: i < analisis.length - 1 ? '12px' : 0 }}>
                      <p style={{ fontSize: '12px', fontWeight: '700', color: AZUL, marginBottom: '6px' }}>{sec.titulo}</p>
                      <textarea
                        value={sec.contenido}
                        onChange={e => setAnalisis(prev => prev.map((s, j) => j === i ? { ...s, contenido: e.target.value } : s))}
                        rows={4}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', lineHeight: 1.7, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', color: '#374151' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {generandoAnalisis && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '12px' }}>
                ✨ Generando análisis narrativo... esto puede tomar unos segundos.
              </div>
            )}

            {navButtons(() => setTab(6))}
          </div>
        )}

        {/* ══ MODAL DETALLE 250 SEMANAS ═══════════════════════════ */}
        {showDetalle250 && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            onClick={e => { if (e.target === e.currentTarget) setShowDetalle250(false) }}>
            <div style={{ background: 'white', borderRadius: '14px', padding: '20px', width: '680px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Desglose completo — 250 semanas cotizadas</p>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>SDI promedio ponderado: {fmtMXN2(sdiPromedio)}</p>
                </div>
                <button onClick={() => setShowDetalle250(false)}
                  style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8', padding: '4px 8px' }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ background: '#F4F6FB' }}>
                      {['#', 'Fecha inicio', 'Fecha fin', 'Semanas', 'SDI diario', 'SDI mensual', 'Peso'].map((h, i) => (
                        <th key={i} style={{ padding: '7px 10px', textAlign: i > 0 ? 'right' : 'center', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periodos.map((p, i) => (
                      <tr key={p.id} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 10px', textAlign: 'center', color: '#94a3b8' }}>{i + 1}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.fecha_inicio}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.fecha_fin}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: AZUL }}>{p.semanas}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>{fmtMXN2(p.sdi)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{fmtMXN(p.sdi * 30.4)}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#94a3b8' }}>{p.peso.toFixed(2)}%</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#EEF2F8', borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={3} style={{ padding: '7px 10px', fontWeight: '700', color: AZUL }}>Promedio ponderado</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>{periodos.reduce((s,p)=>s+p.semanas,0)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '800', color: NARANJA }}>{fmtMXN2(sdiPromedio)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>{fmtMXN(sdiPromedio * 30.4)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '700', color: AZUL }}>100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function CalculadoraPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 48px)', color: '#94a3b8' }}>Cargando calculadora...</div>}>
      <CalculadoraInner />
    </Suspense>
  )
}
