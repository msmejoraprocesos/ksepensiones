'use client'

import { useState, useEffect, useCallback, Suspense, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useSearchParams } from 'next/navigation'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

// ── Variables del sistema 2026 ────────────────────────────────────
interface SysVars {
  UMA_DIARIA: number        // $117.31 INEGI 2026
  SALARIO_MIN: number       // $315.04 CONASAMI 2026
  PMG_L73: number           // $10,636.54 Ley 73 2026
  PMG_L97: number           // $4,345.72 Ley 97 (pensión garantizada)
  RENDIMIENTO_DEFAULT: number
}

const SYS_DEFAULT: SysVars = {
  UMA_DIARIA: 117.31,
  SALARIO_MIN: 315.04,
  PMG_L73: 10636.54,
  PMG_L97: 4345.72,
  RENDIMIENTO_DEFAULT: 6,
}

// Porcentajes Mod 40 por año de inicio
const MOD40_PCT: Record<number, number> = {
  2026: 14.438, 2027: 15.528, 2028: 16.619, 2029: 17.709, 2030: 18.800
}

// Factor de reducción por cesantía (60-64 años)
const FACTOR_CESANTIA: Record<number, number> = {
  60: 0.75, 61: 0.80, 62: 0.85, 63: 0.90, 64: 0.95
}

interface Cliente { id: string; nombre: string }

interface Financiera {
  id: string
  nombre: string
  descripcion: string | null
  tasa_anual: number
  plazo_min: number
  plazo_max: number
  monto_min: number
  monto_max: number
  comision_apertura: number
  seguro_mensual: number
  contacto_nombre: string | null
  contacto_email: string | null
  contacto_telefono: string | null
  logo_url: string | null
  orden: number
}

interface Escenario {
  tag: string
  nombre: string
  descripcion: string
  color: string
  pension: number
  pension_real: number  // en pesos de hoy (ajustada por inflación)
  inversion_mensual: number
  brecha: number
  brecha_real: number
  recomendado: boolean
  notas: string[]
}

// ── FÓRMULAS OFICIALES ────────────────────────────────────────────

function calcSDI(salarioDiarioVecesSM: number, sys: SysVars): number {
  return salarioDiarioVecesSM * sys.SALARIO_MIN * 1.0452
}

function calcPensionLey73(semanas: number, sdi: number, edadRetiro: number, sys: SysVars): number {
  if (semanas < 500) return 0
  const semanasExtra = Math.max(0, semanas - 500)
  const incrementos = Math.floor(semanasExtra / 52)
  const pct = Math.min(1.0, 0.35 + incrementos * 0.0125)
  const pensionDiaria = sdi * pct
  const pensionMensual = pensionDiaria * 30.4
  const base = Math.max(sys.PMG_L73, pensionMensual)
  // Factor cesantía si retiro < 65
  const factor = edadRetiro < 65 ? (FACTOR_CESANTIA[edadRetiro] ?? 1.0) : 1.0
  return base * factor
}

function calcAfore(saldo: number, aportacion: number, rend: number, anios: number): number {
  if (anios <= 0 || rend <= 0) return 0
  const r = rend / 100 / 12
  const n = anios * 12
  const vf = saldo * Math.pow(1 + r, n) + (aportacion > 0 ? aportacion * ((Math.pow(1 + r, n) - 1) / r) : 0)
  // Renta vitalicia conservadora: 300 meses (25 años)
  return vf * r / (1 - Math.pow(1 + r, -300))
}

function costoMod40(umasSalario: number, sys: SysVars, anio = 2026): number {
  const pct = MOD40_PCT[anio] ?? MOD40_PCT[2030]
  return umasSalario * sys.UMA_DIARIA * 30.4 * (pct / 100)
}

function ajustarInflacion(monto: number, inflacion: number, anios: number): number {
  // Convierte pesos futuros a pesos de hoy
  return monto / Math.pow(1 + inflacion / 100, anios)
}

function edadDesde(fechaNac: string): number {
  if (!fechaNac) return 0
  const hoy = new Date()
  const nac = new Date(fechaNac)
  let edad = hoy.getFullYear() - nac.getFullYear()
  if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) edad--
  return edad
}

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────

function CalculadoraInner() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [vistaCalc, setVistaCalc] = useState<'listado' | 'calculadora'>(
    searchParams.get('nuevo') === 'true' || !!searchParams.get('cliente') || !!searchParams.get('diag') ? 'calculadora' : 'listado'
  )

  const [sys, setSys] = useState<SysVars>(SYS_DEFAULT)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [userId, setUserId] = useState('')
  const [asesorNombre, setAsesorNombre] = useState('')
  const [asesorEmail, setAsesorEmail] = useState('')
  const [asesorLogoUrl, setAsesorLogoUrl] = useState<string | null>(null)
  const [asesorPerfil, setAsesorPerfil] = useState<{razon_social?: string; rfc?: string; telefono?: string; email_contacto?: string; direccion?: string; vigencia_propuesta?: number}>({})

  // Inputs
  const [ley, setLey] = useState<'73' | '97'>('73')
  const [clienteId, setClienteId] = useState(searchParams.get('cliente') ?? '')
  const [fechaNac, setFechaNac] = useState('')
  const [edadRetiro, setEdadRetiro] = useState(65)
  const [semanas, setSemanas] = useState(0)
  const [salarioDiario, setSalarioDiario] = useState(0) // veces SM
  const [ingresoDes, setIngresoDes] = useState(0)
  const [inflacion, setInflacion] = useState(4.5)

  // Portabilidad ISSSTE
  const [tieneISSSTe, setTieneISSSTe] = useState(false)
  const [aniosISSSTe, setAniosISSSTe] = useState(0)

  // Ley 97
  const [aforeSaldo, setAforeSaldo] = useState(0)
  const [rendimiento, setRendimiento] = useState(6)
  const [aportVoluntaria, setAportVoluntaria] = useState(0)

  // Mod 10
  const [mod10Activo, setMod10Activo] = useState(false)
  const [mod10UmasSalario, setMod10UmasSalario] = useState(10)
  const [mod10Anios, setMod10Anios] = useState(5)

  // Mod 40
  const [mod40Activo, setMod40Activo] = useState(false)
  const [mod40UmasSalario, setMod40UmasSalario] = useState(15)
  const [mod40Anios, setMod40Anios] = useState(5)
  const [mod40AnioInicio, setMod40AnioInicio] = useState(2026)

  const [escenarios, setEscenarios] = useState<Escenario[]>([])
  const [escSelected, setEscSelected] = useState('e4')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingPDF, setUploadingPDF] = useState(false)
  const [pdfMsg, setPdfMsg] = useState<string | null>(null)
  const [pdfCargado, setPdfCargado] = useState(false)
  const [showConfirmReplace, setShowConfirmReplace] = useState(false)
  const [leyDetectada, setLeyDetectada] = useState<'73' | '97' | 'ambas' | null>(null)
  const [analisis, setAnalisis] = useState<{contexto: string; diagnostico_actual: string; opciones_disponibles: string; recomendacion: string; proximos_pasos: string} | null>(null)
  const [generandoAnalisis, setGenerandoAnalisis] = useState(false)
  const [historial, setHistorial] = useState<any[]>([])
  const [showHistorial, setShowHistorial] = useState(false)
  const [financieras, setFinancieras] = useState<Financiera[]>([])
  const [finSeleccionada, setFinSeleccionada] = useState<Financiera | null>(null)
  const [finPlazo, setFinPlazo] = useState(36)
  const [showFinanciamiento, setShowFinanciamiento] = useState(false)
  const [appAlert, setAppAlert] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      setAsesorEmail(session.user.email ?? '')
      Promise.all([
        supabase.from('perfiles_usuario').select('*').eq('id', session.user.id).single(),
        supabase.from('clientes').select('id,nombre').eq('asesor_id', session.user.id).order('nombre'),
      ]).then(([{ data: sv }, { data: cli }]) => {
        if (sv) {
          setSys({
            UMA_DIARIA: sv.uma_diaria ?? SYS_DEFAULT.UMA_DIARIA,
            SALARIO_MIN: sv.salario_minimo ?? SYS_DEFAULT.SALARIO_MIN,
            PMG_L73: sv.pmg_mensual ?? SYS_DEFAULT.PMG_L73,
            PMG_L97: SYS_DEFAULT.PMG_L97,
            RENDIMIENTO_DEFAULT: sv.rendimiento_afore_default ?? SYS_DEFAULT.RENDIMIENTO_DEFAULT,
          })
          setAsesorNombre(sv.nombre ?? '')
          setAsesorLogoUrl(sv.logo_url ?? null)
          setAsesorPerfil({
            razon_social: sv.razon_social ?? '',
            rfc: sv.rfc ?? '',
            telefono: sv.telefono ?? '',
            email_contacto: sv.email_contacto ?? '',
            direccion: sv.direccion ?? '',
            vigencia_propuesta: sv.vigencia_propuesta ?? 30,
          })
          setRendimiento(sv.rendimiento_afore_default ?? 6)
        }
        if (cli) setClientes(cli as Cliente[])
      })
    })
  }, [])

  const calcular = useCallback(() => {
    async function extraerDatosPDF(file: File) {
    setUploadingPDF(true)
    setPdfMsg(null)
    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1]
        const mediaType = file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg'

        const res = await fetch('/api/extract-nss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mediaType })
        })

        const json = await res.json()

        if (!json.ok) {
          setPdfMsg('❌ Archivo no válido — verifica que el formato sea PDF o imagen y vuelve a intentarlo.')
          setUploadingPDF(false)
          return
        }

        const parsed = json.data

        // Validate it's actually an IMSS document
        if (!parsed.semanas || !parsed.nss) {
          setPdfMsg('❌ Documento no reconocido — carga la Constancia de Semanas Cotizadas descargada de imss.gob.mx')
          setUploadingPDF(false)
          return
        }

        if (parsed.semanas) setSemanas(parsed.semanas)
        if (parsed.salario_diario && sys.SALARIO_MIN > 0) {
          setSalarioDiario(Math.round((parsed.salario_diario / sys.SALARIO_MIN) * 10) / 10)
        }
        if (parsed.fecha_nac) setFechaNac(parsed.fecha_nac)
        // Detectar ley desde historial laboral
        const antes97 = parsed.cotizo_antes_97 === true
        const despues97 = parsed.cotizo_despues_97 === true

        if (antes97 && despues97) {
          // Cotizó en ambos períodos — puede elegir
          setLeyDetectada('ambas')
          setLey('73') // default a 73 que generalmente es más favorable
        } else if (antes97) {
          setLeyDetectada('73')
          setLey('73')
        } else if (despues97) {
          setLeyDetectada('97')
          setLey('97')
        } else if (parsed.fecha_nac) {
          // Fallback: estimar por año de nacimiento
          const anioNac = new Date(parsed.fecha_nac).getFullYear()
          const leyEstimada = anioNac < 1975 ? '73' : '97'
          setLeyDetectada(leyEstimada)
          setLey(leyEstimada)
        }

        setPdfCargado(true)
        setPdfMsg(`✅ Constancia válida · ${parsed.semanas} semanas · ${parsed.nombre ?? ''} · NSS: ${parsed.nss}`)
        setUploadingPDF(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      setPdfMsg('⚠️ Error al procesar el archivo.')
      setUploadingPDF(false)
    }
  }

  async function loadFinancieras() {
    const { data } = await supabase
      .from('financieras')
      .select('*')
      .eq('activa', true)
      .order('orden')
    if (data && data.length > 0) {
      setFinancieras(data)
      setFinSeleccionada(data[0])
    }
  }

  function calcularCorrida(capital: number, tasaAnual: number, plazo: number, comision: number, seguro: number) {
    const tm = tasaAnual / 100 / 12
    const cuota = tm > 0 ? capital * (tm * Math.pow(1+tm,plazo)) / (Math.pow(1+tm,plazo)-1) : capital/plazo
    const comisionMonto = capital * comision / 100
    const rows = []
    let saldo = capital
    for (let i = 1; i <= plazo; i++) {
      const interes = saldo * tm
      const cap = cuota - interes
      saldo = Math.max(0, saldo - cap)
      rows.push({ mes: i, cuota, capital: cap, interes, seguro, saldo })
    }
    const totalPagado = cuota * plazo + comisionMonto + seguro * plazo
    return { cuota, comisionMonto, totalPagado, rows }
  }

  async function loadHistorial(uid: string) {
    const { data } = await supabase
      .from('diagnosticos')
      .select('*, clientes(nombre)')
      .eq('asesor_id', uid)
      .order('created_at', { ascending: false })
      .limit(50)
    setHistorial(data ?? [])
  }

  async function generarAnalisis() {
    if (escenarios.length === 0) return
    setGenerandoAnalisis(true)
    const clienteObj = clientes.find(c => c.id === clienteId)
    const edad = edadDesde(fechaNac) || 40
    const res = await fetch('/api/analisis-pensional', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: clienteObj?.nombre ?? '',
        ley, semanas, salarioDiario,
        salarioMensual: salarioDiario * sys.SALARIO_MIN * 30.4,
        edadActual: edad, edadRetiro, aniosRetiro: Math.max(0, edadRetiro - edad),
        ingresoDes, inflacion, sys,
        e1: escenarios[0], e2: escenarios[1], e3: escenarios[2], e4: escenarios[3],
        escRecomendado: escenarios.find(e => e.recomendado)?.nombre ?? '',
        mod10Activo, mod10Anios,
        mod40Activo, mod40UMAs: mod40UmasSalario, mod40Anios,
        mod40Costo: mod40Activo ? costoMod40(mod40UmasSalario, sys, mod40AnioInicio) : 0,
        tieneISSSTe, aniosISSSTe, aforeSaldo, rendimiento
      })
    })
    const json = await res.json()
    if (json.ok) setAnalisis(json.analisis)
    setGenerandoAnalisis(false)
  }

  async function generarPDF(analisisData?: typeof analisis) {
    const analisisToUse = analisisData ?? analisis
    if (escenarios.length === 0) return
    const clienteObj = clientes.find(c => c.id === clienteId)
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210, margin = 16
    const AZUL_R: [number,number,number] = [27,58,107]
    const NAR_R: [number,number,number] = [240,91,33]
    const VER_R: [number,number,number] = [46,139,87]
    const GRI_R: [number,number,number] = [100,116,139]

    // Folio único
    const folio = `KSE-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`
    const fechaEmision = new Date().toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })
    const fechaVigencia = new Date(Date.now() + (asesorPerfil.vigencia_propuesta ?? 30) * 86400000)
      .toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })

    // ── ENCABEZADO ──
    doc.setFillColor(...AZUL_R)
    doc.rect(0, 0, W, 38, 'F')

    // Logo asesor
    if (asesorLogoUrl) {
      try {
        const res = await fetch(asesorLogoUrl)
        const blob = await res.blob()
        const b64 = await new Promise<string>(resolve => {
          const reader = new FileReader()
          reader.onloadend = () => resolve((reader.result as string).split(',')[1])
          reader.readAsDataURL(blob)
        })
        const ext = asesorLogoUrl.includes('.png') ? 'PNG' : 'JPEG'
        doc.addImage(b64, ext, margin, 6, 36, 24)
      } catch {}
    }

    // Datos asesor
    const ax = asesorLogoUrl ? margin + 40 : margin
    doc.setTextColor(255,255,255)
    doc.setFontSize(12); doc.setFont('helvetica','bold')
    doc.text(asesorPerfil.razon_social || asesorNombre || 'Asesor KSE', ax, 14)
    doc.setFontSize(8); doc.setFont('helvetica','normal')
    const contactInfo = [asesorPerfil.rfc, asesorPerfil.telefono, asesorPerfil.email_contacto].filter(Boolean).join(' · ')
    if (contactInfo) doc.text(contactInfo, ax, 21)
    if (asesorPerfil.direccion) doc.text(asesorPerfil.direccion, ax, 27)

    // Título derecha
    doc.setTextColor(255,255,255)
    doc.setFontSize(13); doc.setFont('helvetica','bold')
    doc.text('Diagnóstico Pensional', W - margin, 13, { align: 'right' })
    doc.setFontSize(8); doc.setFont('helvetica','normal')
    doc.text(fechaEmision, W - margin, 20, { align: 'right' })
    doc.setTextColor(240,91,33)
    doc.text(`Válida hasta: ${fechaVigencia}`, W - margin, 27, { align: 'right' })

    let y = 46

    // ── DATOS DEL CLIENTE ──
    doc.setTextColor(...AZUL_R)
    doc.setFontSize(11); doc.setFont('helvetica','bold')
    doc.text('Datos del cliente', margin, y); y += 6

    doc.setFillColor(248,250,252)
    doc.roundedRect(margin, y, W-margin*2, 20, 2, 2, 'F')
    doc.setDrawColor(226,232,240)
    doc.roundedRect(margin, y, W-margin*2, 20, 2, 2, 'S')

    doc.setTextColor(...AZUL_R); doc.setFontSize(13); doc.setFont('helvetica','bold')
    doc.text(clienteObj?.nombre || 'Cliente', margin+4, y+8)
    doc.setTextColor(...GRI_R); doc.setFontSize(8); doc.setFont('helvetica','normal')
    doc.text(`Régimen: Ley ${ley} · Semanas cotizadas: ${semanas} · Retiro a los ${edadRetiro} años · Ingreso deseado: ${fmtMXN(ingresoDes)}/mes`, margin+4, y+15)
    y += 26

    // ── SITUACIÓN ACTUAL ──
    const e1 = escenarios[0]
    if (e1) {
      const pct1 = ingresoDes > 0 ? Math.round((e1.pension_real / ingresoDes) * 100) : 0
      doc.setTextColor(...AZUL_R); doc.setFontSize(11); doc.setFont('helvetica','bold')
      doc.text('Situación actual sin acción', margin, y); y += 6

      doc.setFillColor(254,242,242)
      doc.roundedRect(margin, y, W-margin*2, 24, 2, 2, 'F')
      doc.setTextColor(220,38,38); doc.setFontSize(10); doc.setFont('helvetica','bold')
      doc.text(`Sin acción, recibirá ${fmtMXN(e1.pension_real)}/mes (${pct1}% de su objetivo)`, margin+4, y+8)
      doc.setFontSize(8); doc.setFont('helvetica','normal')
      doc.text(`Pensión nominal: ${fmtMXN(e1.pension)}/mes · Brecha: ${fmtMXN(e1.brecha_real)}/mes en pesos de hoy`, margin+4, y+15)
      // Barra
      doc.setFillColor(254,202,202); doc.rect(margin+4, y+18, W-margin*2-8, 3, 'F')
      doc.setFillColor(220,38,38); doc.rect(margin+4, y+18, (W-margin*2-8) * Math.min(1, pct1/100), 3, 'F')
      y += 30
    }

    // ── 4 ESCENARIOS ──
    doc.setTextColor(...AZUL_R); doc.setFontSize(11); doc.setFont('helvetica','bold')
    doc.text('Comparativo de escenarios', margin, y); y += 6

    const eW = (W-margin*2)/4
    escenarios.forEach((esc, i) => {
      const x = margin + i * eW
      const isRec = esc.recomendado
      const pct = ingresoDes > 0 ? Math.min(1, esc.pension_real/ingresoDes) : 0
      if (isRec) { doc.setFillColor(...VER_R) } else { doc.setFillColor(248,250,252) }
      doc.roundedRect(x+1, y, eW-2, 52, 2, 2, 'F')
      if (isRec) {
        doc.setFillColor(240,91,33); doc.roundedRect(x+eW-20, y-3, 18, 6, 2, 2, 'F')
        doc.setTextColor(255,255,255); doc.setFontSize(5); doc.setFont('helvetica','bold')
        doc.text('ÓPTIMO', x+eW-19, y+0.5)
      }
      doc.setTextColor(isRec ? 255 : 100, isRec ? 255 : 116, isRec ? 255 : 139)
      doc.setFontSize(7); doc.setFont('helvetica','bold')
      doc.text(esc.nombre.split('—')[0].trim(), x+3, y+7)
      doc.setTextColor(isRec ? 255 : 27, isRec ? 255 : 58, isRec ? 255 : 107)
      doc.setFontSize(12); doc.setFont('helvetica','bold')
      doc.text(fmtMXN(esc.pension), x+3, y+17)
      doc.setFontSize(7); doc.setFont('helvetica','normal')
      doc.text('pesos futuros/mes', x+3, y+22)
      doc.setFontSize(9); doc.setFont('helvetica','bold')
      doc.text(fmtMXN(esc.pension_real), x+3, y+29)
      doc.setFontSize(7)
      doc.text('pesos de hoy', x+3, y+34)
      doc.setFillColor(isRec ? 255 : 226, isRec ? 255 : 232, isRec ? 255 : 240)
      doc.rect(x+3, y+37, eW-6, 3, 'F')
      if (isRec) { doc.setFillColor(255,255,255) } else { doc.setFillColor(...VER_R) }
      doc.rect(x+3, y+37, (eW-6)*pct, 3, 'F')
      doc.setTextColor(isRec ? 255 : 100, isRec ? 255 : 116, isRec ? 255 : 139)
      doc.setFontSize(7)
      doc.text(`${Math.round(pct*100)}% del objetivo`, x+3, y+44)
      if (esc.inversion_mensual > 0) {
        doc.setFontSize(6.5)
        doc.text(`Costo: ${fmtMXN(esc.inversion_mensual)}/mes`, x+3, y+49)
      }
    })
    y += 58

    // ── VARIABLES ──
    doc.setFillColor(248,250,252)
    doc.roundedRect(margin, y, W-margin*2, 14, 2, 2, 'F')
    doc.setTextColor(...GRI_R); doc.setFontSize(7); doc.setFont('helvetica','bold')
    doc.text('VARIABLES 2026:', margin+4, y+6)
    doc.setTextColor(...AZUL_R); doc.setFontSize(7); doc.setFont('helvetica','normal')
    doc.text(`UMA $${sys.UMA_DIARIA}/día · SM $${sys.SALARIO_MIN}/día · PMG L73 ${fmtMXN(sys.PMG_L73)}/mes · PMG L97 ${fmtMXN(sys.PMG_L97)}/mes · Inflación ${inflacion}%`, margin+4, y+11)
    y += 18

    // ── DISCLAIMER ──
    doc.setFillColor(255,251,235)
    doc.roundedRect(margin, y, W-margin*2, 18, 2, 2, 'F')
    doc.setTextColor(...NAR_R); doc.setFontSize(7); doc.setFont('helvetica','bold')
    doc.text('⚠️ AVISO LEGAL', margin+4, y+6)
    doc.setTextColor(146,64,14); doc.setFontSize(6); doc.setFont('helvetica','normal')
    const disc = 'Los cálculos presentados son estimaciones orientativas basadas en variables oficiales vigentes y no constituyen garantía de prestaciones ni asesoría jurídica. Los resultados reales dependen del historial laboral, resoluciones del IMSS y cambios legislativos. Verifique sus semanas en imss.gob.mx.'
    doc.text(doc.splitTextToSize(disc, W-margin*2-8), margin+4, y+11)

    // ── PIE DE PÁGINA ──
    doc.setFillColor(...AZUL_R)
    doc.rect(0, 284, W, 13, 'F')
    doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont('helvetica','normal')
    doc.text(`Folio: ${folio} · Documento confidencial`, margin, 290)
    doc.text('Página 1 de 1', W/2, 290, { align: 'center' })
    // Powered by KSE - right side, discrete
    doc.setTextColor(255,255,255); doc.setFontSize(6)
    doc.text('Powered by KSE Pensiones', W-margin, 290, { align: 'right' })

    // If analisis exists, add page 2
    if (analisisToUse) {
      doc.addPage()
      // Page 2 header
      doc.setFillColor(...AZUL_R)
      doc.rect(0, 0, W, 20, 'F')
      doc.setTextColor(255,255,255)
      doc.setFontSize(12); doc.setFont('helvetica','bold')
      doc.text('Análisis del Diagnóstico Pensional', margin, 13)
      doc.setFontSize(8); doc.setFont('helvetica','normal')
      doc.text(clienteObj?.nombre || '', W-margin, 13, { align: 'right' })

      let y2 = 28
      const sections = [
        { label: 'CONTEXTO DEL ASEGURADO', text: analisisToUse.contexto, color: AZUL_R },
        { label: 'DIAGNÓSTICO ACTUAL', text: analisisToUse.diagnostico_actual, color: [220,38,38] as [number,number,number] },
        { label: 'OPCIONES DISPONIBLES', text: analisisToUse.opciones_disponibles, color: [240,91,33] as [number,number,number] },
        { label: 'RECOMENDACIÓN', text: analisisToUse.recomendacion, color: VER_R },
        { label: 'PRÓXIMOS PASOS', text: analisisToUse.proximos_pasos, color: [139,92,246] as [number,number,number] },
      ]

      for (const sec of sections) {
        if (y2 > 260) { doc.addPage(); y2 = 20 }
        doc.setTextColor(...sec.color)
        doc.setFontSize(8); doc.setFont('helvetica','bold')
        doc.text(sec.label, margin, y2); y2 += 5
        doc.setTextColor(55,65,81)
        doc.setFontSize(9); doc.setFont('helvetica','normal')
        const lines = doc.splitTextToSize(sec.text, W-margin*2)
        doc.text(lines, margin, y2)
        y2 += lines.length * 4.5 + 6
      }

      // QR IMSS at bottom of last page
      const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=' + encodeURIComponent('https://serviciosdigitales.imss.gob.mx/semanascotizadas-web/usuarios/IngresoAsegurado')
      try {
        const qrRes = await fetch(qrUrl)
        const qrBlob = await qrRes.blob()
        const qrB64 = await new Promise<string>(resolve => {
          const reader = new FileReader()
          reader.onloadend = () => resolve((reader.result as string).split(',')[1])
          reader.readAsDataURL(qrBlob)
        })
        if (y2 > 240) { doc.addPage(); y2 = 20 }
        doc.setFillColor(248,250,252)
        doc.roundedRect(margin, y2, W-margin*2, 30, 2, 2, 'F')
        doc.addImage(qrB64, 'PNG', margin+4, y2+4, 22, 22)
        doc.setTextColor(...AZUL_R); doc.setFontSize(8); doc.setFont('helvetica','bold')
        doc.text('Verificar semanas cotizadas', margin+30, y2+10)
        doc.setTextColor(100,116,139); doc.setFontSize(7); doc.setFont('helvetica','normal')
        doc.text('Escanea el código QR o visita imss.gob.mx para verificar', margin+30, y2+16)
        doc.text('tus semanas cotizadas y mantener actualizado tu expediente.', margin+30, y2+21)
      } catch {}

      // Footer page 2
      doc.setFillColor(...AZUL_R); doc.rect(0, 284, W, 13, 'F')
      doc.setTextColor(255,255,255); doc.setFontSize(7)
      doc.text('Folio: ' + folio, margin, 290)
      doc.text('Powered by KSE Pensiones', W-margin, 290, { align: 'right' })
    }

    const fname = `diagnostico-${(clienteObj?.nombre || 'cliente').replace(/\s+/g,'-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(fname)
  }

  const edad = edadDesde(fechaNac) || 40
    const aniosRetiro = Math.max(0, edadRetiro - edad)

    // Semanas totales con portabilidad ISSSTE
    const semanasISSSTe = tieneISSSTe ? aniosISSSTe * 52 : 0
    const semanasTotal = semanas + semanasISSSTe

    const sdi = calcSDI(salarioDiario, sys)

    if (ley === '73') {
      // ── E1: Sin acción ─────────────────────────────────────────
      const p1 = calcPensionLey73(semanasTotal, sdi, edadRetiro, sys)
      const p1_real = ajustarInflacion(p1, inflacion, aniosRetiro)

      // ── E2: Con Modalidad 10 ───────────────────────────────────
      // Suma semanas adicionales cotizadas en Mod 10
      const semanasConMod10 = mod10Activo
        ? semanasTotal + (mod10Anios * 52)
        : semanasTotal
      // El SDI de Mod 10 es el mismo salario base (no cambia)
      const p2 = mod10Activo
        ? calcPensionLey73(semanasConMod10, sdi, edadRetiro, sys)
        : p1
      const inv2 = 0 // Mod 10 tiene costo pero es menor y variable; se muestra como nota
      const p2_real = ajustarInflacion(p2, inflacion, aniosRetiro)

      // ── E3: Con Modalidad 40 ───────────────────────────────────
      // Eleva el SDI al salario de Mod 40 (en UMAs)
      const sdiMod40 = mod40Activo
        ? mod40UmasSalario * sys.UMA_DIARIA * 1.0452
        : sdi
      const semanasConMod40 = mod40Activo
        ? semanasTotal + (mod40Anios * 52)
        : semanasTotal
      const p3 = mod40Activo
        ? calcPensionLey73(semanasConMod40, Math.max(sdi, sdiMod40), edadRetiro, sys)
        : p1
      const inv3 = mod40Activo ? costoMod40(mod40UmasSalario, sys, mod40AnioInicio) : 0
      const p3_real = ajustarInflacion(p3, inflacion, aniosRetiro)

      // ── E4: Combinada Mod 10 + Mod 40 ─────────────────────────
      const semanasE4 = semanasTotal + (mod10Activo ? mod10Anios * 52 : 0) + (mod40Activo ? mod40Anios * 52 : 0)
      const sdiE4 = mod40Activo ? Math.max(sdi, sdiMod40) : sdi
      const p4 = calcPensionLey73(semanasE4, sdiE4, edadRetiro, sys)
      const inv4 = inv3 // Mod 10 se asume que ya cotiza; el costo adicional es solo Mod 40
      const p4_real = ajustarInflacion(p4, inflacion, aniosRetiro)

      const notas73 = semanasTotal < 500
        ? ['⚠️ No alcanza 500 semanas mínimas — no hay derecho a pensión IMSS']
        : edadRetiro < 65
        ? [`⚠️ Pensión de cesantía (${edadRetiro} años) — aplica factor ${(FACTOR_CESANTIA[edadRetiro] ?? 1) * 100}%`]
        : []

      if (tieneISSSTe && aniosISSSTe > 0) {
        notas73.push(`✓ Portabilidad ISSSTE: +${aniosISSSTe} años (${semanasISSSTe} semanas) sumadas`)
      }

      const esc: Escenario[] = [
        { tag: 'e1', nombre: 'E1 — Sin acción', descripcion: 'Pensión IMSS con situación actual', color: '#94a3b8', pension: p1, pension_real: p1_real, inversion_mensual: 0, brecha: Math.max(0, ingresoDes - p1), brecha_real: Math.max(0, ingresoDes - p1_real), recomendado: false, notas: notas73 },
        { tag: 'e2', nombre: 'E2 — Modalidad 10', descripcion: `+${mod10Activo ? mod10Anios : '?'} años cotizando voluntariamente`, color: '#3b82f6', pension: p2, pension_real: p2_real, inversion_mensual: inv2, brecha: Math.max(0, ingresoDes - p2), brecha_real: Math.max(0, ingresoDes - p2_real), recomendado: false, notas: ['Mantiene el mismo salario base', 'Suma semanas para mayor cuantía'] },
        { tag: 'e3', nombre: 'E3 — Modalidad 40', descripcion: `Eleva SDI a ${mod40Activo ? mod40UmasSalario : '?'} UMAs`, color: NARANJA, pension: p3, pension_real: p3_real, inversion_mensual: inv3, brecha: Math.max(0, ingresoDes - p3), brecha_real: Math.max(0, ingresoDes - p3_real), recomendado: false, notas: mod40Activo ? [`Costo mensual: ${fmtMXN(inv3)}`, `Incrementa SDI y semanas cotizadas`] : ['Configura Mod 40 para ver proyección'] },
        { tag: 'e4', nombre: 'E4 — Mod 10 + Mod 40', descripcion: 'Estrategia combinada óptima', color: VERDE, pension: p4, pension_real: p4_real, inversion_mensual: inv4, brecha: Math.max(0, ingresoDes - p4), brecha_real: Math.max(0, ingresoDes - p4_real), recomendado: false, notas: ['Maximiza semanas y SDI simultáneamente', 'Escenario recomendado para mayor pensión'] },
      ]

      // Marcar el mejor escenario
      const cubren = esc.filter(e => e.brecha_real === 0)
      const mejor = cubren.length > 0
        ? cubren.reduce((a, b) => a.inversion_mensual <= b.inversion_mensual ? a : b)
        : [...esc].sort((a, b) => a.brecha_real - b.brecha_real)[0]
      mejor.recomendado = true

      setEscenarios(esc)
    } else {
      // ── LEY 97 ────────────────────────────────────────────────

      // E1: Solo saldo actual proyectado
      const p1 = calcAfore(aforeSaldo, 0, rendimiento, aniosRetiro)
      const p1_real = ajustarInflacion(p1, inflacion, aniosRetiro)

      // E2: Con aportaciones voluntarias
      const p2 = calcAfore(aforeSaldo, aportVoluntaria, rendimiento, aniosRetiro)
      const p2_real = ajustarInflacion(p2, inflacion, aniosRetiro)

      // E3: Pensión garantizada (si tiene 1250+ semanas)
      const tieneGarantia = semanasTotal >= 1250
      const p3 = tieneGarantia ? sys.PMG_L97 : 0
      const p3_real = tieneGarantia ? sys.PMG_L97 : 0 // ya está en pesos actuales

      // E4: Óptimo — mayor entre AFORE proyectado y garantizada + aportaciones
      const p4 = Math.max(calcAfore(aforeSaldo, aportVoluntaria, rendimiento, aniosRetiro), tieneGarantia ? sys.PMG_L97 : 0)
      const p4_real = ajustarInflacion(p4, inflacion, aniosRetiro)

      const notas97_base = semanasTotal < 1250 ? ['⚠️ Requiere 1,250 semanas para pensión garantizada'] : ['✓ Califica para pensión garantizada']
      if (tieneISSSTe && aniosISSSTe > 0) notas97_base.push(`✓ Portabilidad ISSSTE: +${aniosISSSTe} años sumados`)

      const esc: Escenario[] = [
        { tag: 'e1', nombre: 'E1 — AFORE actual', descripcion: 'Sin aportaciones adicionales', color: '#94a3b8', pension: p1, pension_real: p1_real, inversion_mensual: 0, brecha: Math.max(0, ingresoDes - p1), brecha_real: Math.max(0, ingresoDes - p1_real), recomendado: false, notas: notas97_base },
        { tag: 'e2', nombre: 'E2 — AFORE + Aport. Vol.', descripcion: `Aportación ${fmtMXN(aportVoluntaria)}/mes`, color: '#3b82f6', pension: p2, pension_real: p2_real, inversion_mensual: aportVoluntaria, brecha: Math.max(0, ingresoDes - p2), brecha_real: Math.max(0, ingresoDes - p2_real), recomendado: false, notas: ['Aportaciones voluntarias a AFORE', 'Deducible de ISR hasta 10% del ingreso anual'] },
        { tag: 'e3', nombre: 'E3 — Pensión Garantizada', descripcion: `${fmtMXN(sys.PMG_L97)}/mes si califica`, color: NARANJA, pension: p3, pension_real: p3_real, inversion_mensual: 0, brecha: Math.max(0, ingresoDes - p3), brecha_real: Math.max(0, ingresoDes - p3_real), recomendado: false, notas: tieneGarantia ? ['✓ Califica — 1,250+ semanas', 'El gobierno complementa si el saldo no alcanza'] : ['❌ No califica aún — faltan semanas'] },
        { tag: 'e4', nombre: 'E4 — Estrategia óptima', descripcion: 'Mayor entre AFORE y garantizada', color: VERDE, pension: p4, pension_real: p4_real, inversion_mensual: aportVoluntaria, brecha: Math.max(0, ingresoDes - p4), brecha_real: Math.max(0, ingresoDes - p4_real), recomendado: true, notas: ['Combina lo mejor de ambos esquemas', 'El IMSS paga la opción más favorable'] },
      ]

      const cubren = esc.filter(e => e.brecha_real === 0)
      const mejor = cubren.length > 0
        ? cubren.reduce((a, b) => a.inversion_mensual <= b.inversion_mensual ? a : b)
        : [...esc].sort((a, b) => a.brecha_real - b.brecha_real)[0]
      mejor.recomendado = true
      setEscenarios(esc)
    }
    setSaved(false)
  }, [ley, fechaNac, edadRetiro, semanas, salarioDiario, ingresoDes, inflacion, tieneISSSTe, aniosISSSTe, aforeSaldo, rendimiento, aportVoluntaria, mod10Activo, mod10UmasSalario, mod10Anios, mod40Activo, mod40UmasSalario, mod40Anios, mod40AnioInicio, sys])

  useEffect(() => { calcular() }, [calcular])

  async function guardar() {
    if (!clienteId || escenarios.length === 0) return
    // Validate required fields
    if (!semanas || semanas === 0) { setAppAlert('Ingresa las semanas cotizadas antes de guardar el diagnóstico.'); setSaving(false); return }
    if (!salarioDiario || salarioDiario === 0) { setAppAlert('Ingresa el salario diario (veces SM) antes de guardar el diagnóstico.'); setSaving(false); return }
    if (!ingresoDes || ingresoDes === 0) { setAppAlert('Ingresa el ingreso deseado al retiro antes de guardar el diagnóstico.'); setSaving(false); return }
    setSaving(true)
    await supabase.from('diagnosticos').insert({
      asesor_id: userId, cliente_id: clienteId, ley,
      semanas, salario_diario: salarioDiario, edad_retiro: edadRetiro,
      ingreso_deseado: ingresoDes, afore_saldo: aforeSaldo,
      ppr_mensual: 0, rendimiento,
      resultado_e1: escenarios[0]?.pension_real,
      resultado_e2: escenarios[1]?.pension_real,
      resultado_e3: escenarios[2]?.pension_real,
      resultado_e4: escenarios[3]?.pension_real,
      notas: notas || null,
      analisis_narrativo: analisis ? analisis : null,
    })
    setSaving(false)
    setSaved(true)
    await loadHistorial(userId)
  }

  async function extraerDatosPDF(file: File) {
    setUploadingPDF(true)
    setPdfMsg(null)
    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1]
        const mediaType = file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg'

        const res = await fetch('/api/extract-nss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mediaType })
        })

        const json = await res.json()

        if (!json.ok) {
          setPdfMsg('❌ Archivo no válido — verifica que el formato sea PDF o imagen y vuelve a intentarlo.')
          setUploadingPDF(false)
          return
        }

        const parsed = json.data

        // Validate it's actually an IMSS document
        if (!parsed.semanas || !parsed.nss) {
          setPdfMsg('❌ Documento no reconocido — carga la Constancia de Semanas Cotizadas descargada de imss.gob.mx')
          setUploadingPDF(false)
          return
        }

        if (parsed.semanas) setSemanas(parsed.semanas)
        if (parsed.salario_diario && sys.SALARIO_MIN > 0) {
          setSalarioDiario(Math.round((parsed.salario_diario / sys.SALARIO_MIN) * 10) / 10)
        }
        if (parsed.fecha_nac) setFechaNac(parsed.fecha_nac)
        // Detectar ley desde historial laboral
        const antes97 = parsed.cotizo_antes_97 === true
        const despues97 = parsed.cotizo_despues_97 === true

        if (antes97 && despues97) {
          // Cotizó en ambos períodos — puede elegir
          setLeyDetectada('ambas')
          setLey('73') // default a 73 que generalmente es más favorable
        } else if (antes97) {
          setLeyDetectada('73')
          setLey('73')
        } else if (despues97) {
          setLeyDetectada('97')
          setLey('97')
        } else if (parsed.fecha_nac) {
          // Fallback: estimar por año de nacimiento
          const anioNac = new Date(parsed.fecha_nac).getFullYear()
          const leyEstimada = anioNac < 1975 ? '73' : '97'
          setLeyDetectada(leyEstimada)
          setLey(leyEstimada)
        }

        setPdfCargado(true)
        setPdfMsg(`✅ Constancia válida · ${parsed.semanas} semanas · ${parsed.nombre ?? ''} · NSS: ${parsed.nss}`)
        setUploadingPDF(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      setPdfMsg('⚠️ Error al procesar el archivo.')
      setUploadingPDF(false)
    }
  }

  async function loadFinancieras() {
    const { data } = await supabase
      .from('financieras')
      .select('*')
      .eq('activa', true)
      .order('orden')
    if (data && data.length > 0) {
      setFinancieras(data)
      setFinSeleccionada(data[0])
    }
  }

  function calcularCorrida(capital: number, tasaAnual: number, plazo: number, comision: number, seguro: number) {
    const tm = tasaAnual / 100 / 12
    const cuota = tm > 0 ? capital * (tm * Math.pow(1+tm,plazo)) / (Math.pow(1+tm,plazo)-1) : capital/plazo
    const comisionMonto = capital * comision / 100
    const rows = []
    let saldo = capital
    for (let i = 1; i <= plazo; i++) {
      const interes = saldo * tm
      const cap = cuota - interes
      saldo = Math.max(0, saldo - cap)
      rows.push({ mes: i, cuota, capital: cap, interes, seguro, saldo })
    }
    const totalPagado = cuota * plazo + comisionMonto + seguro * plazo
    return { cuota, comisionMonto, totalPagado, rows }
  }

  async function loadHistorial(uid: string) {
    const { data } = await supabase
      .from('diagnosticos')
      .select('*, clientes(nombre)')
      .eq('asesor_id', uid)
      .order('created_at', { ascending: false })
      .limit(50)
    setHistorial(data ?? [])
  }

  async function generarAnalisis() {
    if (escenarios.length === 0) return
    setGenerandoAnalisis(true)
    const clienteObj = clientes.find(c => c.id === clienteId)
    const edad = edadDesde(fechaNac) || 40
    const res = await fetch('/api/analisis-pensional', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: clienteObj?.nombre ?? '',
        ley, semanas, salarioDiario,
        salarioMensual: salarioDiario * sys.SALARIO_MIN * 30.4,
        edadActual: edad, edadRetiro, aniosRetiro: Math.max(0, edadRetiro - edad),
        ingresoDes, inflacion, sys,
        e1: escenarios[0], e2: escenarios[1], e3: escenarios[2], e4: escenarios[3],
        escRecomendado: escenarios.find(e => e.recomendado)?.nombre ?? '',
        mod10Activo, mod10Anios,
        mod40Activo, mod40UMAs: mod40UmasSalario, mod40Anios,
        mod40Costo: mod40Activo ? costoMod40(mod40UmasSalario, sys, mod40AnioInicio) : 0,
        tieneISSSTe, aniosISSSTe, aforeSaldo, rendimiento
      })
    })
    const json = await res.json()
    if (json.ok) setAnalisis(json.analisis)
    setGenerandoAnalisis(false)
  }

  async function generarPDF(analisisData?: typeof analisis) {
    const analisisToUse = analisisData ?? analisis
    if (escenarios.length === 0) return
    const clienteObj = clientes.find(c => c.id === clienteId)
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210, margin = 16
    const AZUL_RGB: [number,number,number] = [27, 58, 107]
    const NARANJA_RGB: [number,number,number] = [240, 91, 33]
    const VERDE_RGB: [number,number,number] = [46, 139, 87]

    // Header
    doc.setFillColor(...AZUL_RGB)
    doc.rect(0, 0, W, 34, 'F')
    doc.setTextColor(255,255,255)
    doc.setFontSize(16); doc.setFont('helvetica','bold')
    doc.text('KSE Pensiones', margin, 14)
    doc.setFontSize(9); doc.setFont('helvetica','normal')
    doc.text('Diagnóstico Pensional', margin, 21)
    doc.setFontSize(9)
    doc.text(new Date().toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' }), W - margin, 14, { align: 'right' })
    if (clienteObj?.nombre) doc.text(clienteObj.nombre, W - margin, 21, { align: 'right' })

    let y = 42

    // Parámetros
    doc.setTextColor(...AZUL_RGB)
    doc.setFontSize(11); doc.setFont('helvetica','bold')
    doc.text('Parámetros del diagnóstico', margin, y); y += 7

    const params = [
      ['Régimen', `Ley ${ley}`],
      ['Semanas cotizadas', `${semanas}`],
      ['Salario', `${salarioDiario}x SM`],
      ['Retiro', `${edadRetiro} años`],
      ['Ingreso deseado', fmtMXN(ingresoDes)],
      ['Inflación', `${inflacion}%`],
    ]
    const cW = (W - margin*2) / 3
    params.forEach(([label, val], i) => {
      const col = i % 3; const row = Math.floor(i / 3)
      const x = margin + col * cW; const ry = y + row * 12
      doc.setFillColor(248,250,252); doc.rect(x, ry, cW, 11, 'F')
      doc.setTextColor(148,163,184); doc.setFontSize(7); doc.setFont('helvetica','bold')
      doc.text(label.toUpperCase(), x+3, ry+5)
      doc.setTextColor(...AZUL_RGB); doc.setFontSize(8); doc.setFont('helvetica','bold')
      doc.text(val, x+3, ry+9)
    })
    y += Math.ceil(params.length/3)*12 + 8

    // Escenarios
    doc.setTextColor(...AZUL_RGB)
    doc.setFontSize(11); doc.setFont('helvetica','bold')
    doc.text('Comparativo de escenarios', margin, y); y += 7

    const eW = (W - margin*2) / 4
    escenarios.forEach((esc, i) => {
      const x = margin + i * eW
      const isRec = esc.recomendado
      if (isRec) { doc.setFillColor(...VERDE_RGB) } else { doc.setFillColor(248,250,252) }
      doc.roundedRect(x+1, y, eW-2, 48, 2, 2, 'F')
      doc.setTextColor(isRec ? 255 : 100, isRec ? 255 : 116, isRec ? 255 : 139)
      doc.setFontSize(7); doc.setFont('helvetica','bold')
      doc.text(esc.nombre.replace('— ',''), x+4, y+7, { maxWidth: eW-8 })
      doc.setTextColor(isRec ? 255 : 27, isRec ? 255 : 58, isRec ? 255 : 107)
      doc.setFontSize(13); doc.setFont('helvetica','bold')
      doc.text(fmtMXN(esc.pension), x+4, y+18)
      doc.setFontSize(8)
      doc.text(fmtMXN(esc.pension_real)+' hoy', x+4, y+25)
      const pct = ingresoDes > 0 ? Math.min(1, esc.pension_real/ingresoDes) : 0
      doc.setFillColor(isRec ? 255 : 226, isRec ? 255 : 232, isRec ? 255 : 240)
      doc.rect(x+4, y+29, eW-8, 3, 'F')
      if (isRec) { doc.setFillColor(255,255,255) } else { doc.setFillColor(...VERDE_RGB) }
      doc.rect(x+4, y+29, (eW-8)*pct, 3, 'F')
      doc.setTextColor(isRec ? 255 : 100, isRec ? 255 : 116, isRec ? 255 : 139)
      doc.setFontSize(7)
      doc.text(`${Math.round(pct*100)}% del objetivo`, x+4, y+36)
      if (esc.inversion_mensual > 0) doc.text(`Inversión: ${fmtMXN(esc.inversion_mensual)}/mes`, x+4, y+42)
      if (isRec) { doc.setFontSize(7); doc.setTextColor(255,255,255); doc.text('⭐ ÓPTIMO', x+4, y+47) }
    })
    y += 58

    // Disclaimer
    doc.setFillColor(254,244,236)
    doc.roundedRect(margin, y, W-margin*2, 18, 2, 2, 'F')
    doc.setTextColor(...NARANJA_RGB); doc.setFontSize(7); doc.setFont('helvetica','bold')
    doc.text('⚠️ AVISO LEGAL', margin+4, y+6)
    doc.setTextColor(146,64,14); doc.setFontSize(6); doc.setFont('helvetica','normal')
    const disclaimer = 'Cálculos orientativos basados en variables oficiales 2026. No constituyen garantía de prestaciones ni asesoría jurídica. Verifica en imss.gob.mx'
    doc.text(doc.splitTextToSize(disclaimer, W-margin*2-8), margin+4, y+11)

    // Footer
    doc.setFillColor(...AZUL_RGB); doc.rect(0, 287, W, 10, 'F')
    doc.setTextColor(255,255,255); doc.setFontSize(7)
    doc.text('KSE Pensiones · CRM de Diagnóstico Pensional', margin, 293)
    doc.text(`Variables 2026: UMA $${sys.UMA_DIARIA} · SM $${sys.SALARIO_MIN} · PMG L73 ${fmtMXN(sys.PMG_L73)}`, W-margin, 293, { align: 'right' })

    const fname = `diagnostico-${(clienteObj?.nombre || 'cliente').replace(/\s+/g,'-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(fname)
  }

  const edad = edadDesde(fechaNac)
  const aniosRetiro = Math.max(0, edadRetiro - (edad || 40))
  const semanasConPortabilidad = semanas + (tieneISSSTe ? aniosISSSTe * 52 : 0)
  const escAct = escenarios.find(e => e.tag === escSelected) ?? escenarios[0]

  const inputSt: React.CSSProperties = { width: '100%', border: '1.5px solid #2c92d5', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#1e293b', outline: 'none', boxSizing: 'border-box', background: '#e8f4fd', fontFamily: 'inherit', borderColor: '#2c92d5' }
  const labelSt: React.CSSProperties = { display: 'block', fontSize: '10px', color: '#475569', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }
  const stepBadge = (n: number, color: string) => (
    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: color, color: 'white', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
  )
  const sectionTitle = (n: number, title: string, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
      {stepBadge(n, color)}
      <span style={{ fontSize: '11px', fontWeight: '700', color: AZUL, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
    </div>
  )

  // ── VISTA LISTADO ──────────────────────────────────────────────
  if (vistaCalc === 'listado') {
    const totalDiags = historial.length
    const conAnalisis = historial.filter((d: any) => d.analisis_narrativo).length
    const ley73 = historial.filter((d: any) => d.ley === '73').length
    const ley97 = historial.filter((d: any) => d.ley === '97').length
    const esteMes = historial.filter((d: any) => new Date(d.created_at) > new Date(Date.now() - 30*86400000)).length

    return (
      <div style={{ height: 'calc(100vh - 56px)', overflow: 'auto', background: '#F4F6FB', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: AZUL, margin: 0 }}>🧮 Diagnósticos Pensionales</h1>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>Historial completo · Variables 2026</p>
          </div>
          <button onClick={() => setVistaCalc('calculadora')}
            style={{ padding: '10px 20px', background: NARANJA, color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 14px rgba(240,91,33,0.4)' }}>
            + Nuevo diagnóstico
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Total diagnósticos', value: totalDiags, color: AZUL },
            { label: 'Este mes', value: esteMes, color: '#8b5cf6' },
            { label: 'Con análisis IA', value: conAnalisis, color: VERDE },
            { label: 'Ley 73', value: ley73, color: AZUL },
            { label: 'Ley 97', value: ley97, color: '#0891b2' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{k.label}</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: AZUL, margin: 0 }}>Todos los diagnósticos</p>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>{totalDiags} registros</p>
          </div>
          {historial.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🧮</div>
              <p style={{ fontSize: '15px', fontWeight: '600', color: '#64748b', margin: '0 0 8px' }}>Sin diagnósticos aún</p>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px' }}>Crea tu primer diagnóstico pensional</p>
              <button onClick={() => setVistaCalc('calculadora')}
                style={{ padding: '10px 24px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                + Nuevo diagnóstico
              </button>
            </div>
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #e2e8f0' }}>
                    {['#','Fecha','Cliente','Ley','Semanas','Retiro','Meta','E1 (hoy)','E4 Óptimo','Cobertura','Análisis',''].map((h, i) => (
                      <th key={i} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historial.map((d: any, i: number) => {
                    const pct = d.ingreso_deseado && d.resultado_e4 ? Math.round((d.resultado_e4/d.ingreso_deseado)*100) : null
                    return (
                      <tr key={d.id} style={{ borderBottom: i < historial.length-1 ? '1px solid #f1f5f9' : 'none' }}>
                        <td style={{ padding: '10px 12px', fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>#{historial.length - i}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {new Date(d.created_at).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'2-digit' })}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: '600', color: AZUL, whiteSpace: 'nowrap' }}>
                          {d.clientes?.nombre ?? '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: d.ley === '73' ? '#EEF2F8' : '#ecfeff', color: d.ley === '73' ? AZUL : '#0891b2', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>L{d.ley}</span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#374151' }}>{d.semanas}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#374151' }}>{d.edad_retiro} años</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', color: '#374151' }}>{d.ingreso_deseado ? fmtMXN(d.ingreso_deseado) : '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>{d.resultado_e1 ? fmtMXN(d.resultado_e1) : '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700', color: VERDE }}>{d.resultado_e4 ? fmtMXN(d.resultado_e4) : '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {pct !== null ? (
                            <div>
                              <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', width: '70px', overflow: 'hidden', marginBottom: '2px' }}>
                                <div style={{ height: '100%', background: pct >= 80 ? VERDE : pct >= 50 ? NARANJA : '#ef4444', width: `${Math.min(100,pct)}%`, borderRadius: '3px' }} />
                              </div>
                              <span style={{ fontSize: '10px', color: pct >= 80 ? VERDE : pct >= 50 ? NARANJA : '#ef4444', fontWeight: '700' }}>{pct}%</span>
                            </div>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {d.analisis_narrativo
                            ? <span style={{ fontSize: '11px', background: '#f0fdf4', color: VERDE, padding: '2px 8px', borderRadius: '6px', fontWeight: '600' }}>✓ Sí</span>
                            : <span style={{ fontSize: '11px', color: '#cbd5e1' }}>—</span>
                          }
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button onClick={() => {
                            setLey(d.ley)
                            setSemanas(d.semanas)
                            setSalarioDiario(d.salario_diario ?? 0)
                            setEdadRetiro(d.edad_retiro)
                            setIngresoDes(d.ingreso_deseado ?? 0)
                            setClienteId(d.cliente_id)
                            setNotas(d.notas ?? '')
                            if (d.analisis_narrativo) setAnalisis(d.analisis_narrativo)
                            setVistaCalc('calculadora')
                          }} style={{ fontSize: '11px', color: NARANJA, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap' }}>
                            Abrir →
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

    return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => setVistaCalc('listado')}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#F4F6FB', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', color: '#64748b', fontSize: '12px', fontWeight: '600', flexShrink: 0 }}>
          ← Historial
        </button>
        <div style={{ flexShrink: 0 }}>
          <h1 style={{ color: AZUL, fontSize: '17px', fontWeight: '800', margin: 0 }}>🧮 Calculadora de Pensiones</h1>
          <p style={{ color: '#94a3b8', fontSize: '10px', margin: '2px 0 0' }}>UMA ${sys.UMA_DIARIA} · SM ${sys.SALARIO_MIN} · PMG L73 {fmtMXN(sys.PMG_L73)}</p>
        </div>

        <div style={{ width: '1px', height: '36px', background: '#e2e8f0', flexShrink: 0 }} />

        {/* Selector de cliente — prominente en el header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', whiteSpace: 'nowrap' }}>Para:</span>
          <select value={clienteId} onChange={e => { setClienteId(e.target.value); setSaved(false) }}
            style={{ flex: 1, maxWidth: '260px', padding: '8px 12px', border: `1.5px solid ${clienteId ? AZUL : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', fontWeight: clienteId ? '700' : '400', color: clienteId ? AZUL : '#94a3b8', outline: 'none', background: clienteId ? '#EEF2F8' : 'white', cursor: 'pointer' }}>
            <option value="">— Seleccionar cliente —</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          {clienteId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: VERDE, fontWeight: '600' }}>
              ✓ {clientes.find(c => c.id === clienteId)?.nombre?.split(' ')[0]}
            </div>
          )}
        </div>

        <div style={{ width: '1px', height: '36px', background: '#e2e8f0', flexShrink: 0 }} />

        {/* Botones de acción — en el header */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button onClick={guardar} disabled={saving || !clienteId || saved}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: saved ? VERDE : (!clienteId ? '#f1f5f9' : AZUL), color: saved ? 'white' : (!clienteId ? '#94a3b8' : 'white'), border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: (!clienteId || saved) ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
            {saved ? '✓ Guardado' : saving ? '...' : '💾 Guardar'}
          </button>
          <button onClick={() => generarPDF(analisis)} disabled={escenarios.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: escenarios.length === 0 ? '#f1f5f9' : NARANJA, color: escenarios.length === 0 ? '#94a3b8' : 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: escenarios.length === 0 ? 'not-allowed' : 'pointer', boxShadow: escenarios.length > 0 ? `0 4px 12px ${NARANJA}50` : 'none' }}>
            📄 Exportar PDF
          </button>
          {mod40Activo && escenarios.length > 0 && (
            <button onClick={() => setShowFinanciamiento(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: showFinanciamiento ? AZUL : 'white', color: showFinanciamiento ? 'white' : AZUL, border: `1.5px solid ${AZUL}`, borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              💰 {showFinanciamiento ? 'Ocultar' : 'Financiamiento'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── PANEL IZQUIERDO — INPUTS ── */}
        <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid #e2e8f0', background: 'white', overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Régimen */}
          <div>
            {sectionTitle(1, 'Régimen de pensión', AZUL)}
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['73', '97'] as const).map(l => {
                const disabled = leyDetectada !== null && leyDetectada !== 'ambas' && leyDetectada !== l
                const isActive = ley === l
                return (
                  <button key={l}
                    onClick={() => !disabled && setLey(l)}
                    style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `2px solid ${isActive ? AZUL : disabled ? '#f1f5f9' : '#e2e8f0'}`, background: isActive ? AZUL : disabled ? '#f8fafc' : 'white', color: isActive ? 'white' : disabled ? '#cbd5e1' : '#64748b', fontSize: '12px', fontWeight: '700', cursor: disabled ? 'not-allowed' : 'pointer', position: 'relative' }}>
                    Ley {l} {l === '73' ? '(pre-97)' : '(AFORE)'}
                    {disabled && <span style={{ display: 'block', fontSize: '8px', color: '#94a3b8', fontWeight: '400' }}>No aplica</span>}
                    {leyDetectada === l && !disabled && <span style={{ display: 'block', fontSize: '8px', color: VERDE, fontWeight: '700' }}>✓ Detectada</span>}
                    {leyDetectada === 'ambas' && <span style={{ display: 'block', fontSize: '8px', color: NARANJA, fontWeight: '700' }}>Cotizó en ambas</span>}
                  </button>
                )
              })}
            </div>
            {/* Mensaje de detección */}
            {leyDetectada && (
              <div style={{ padding: '8px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600',
                background: leyDetectada === 'ambas' ? '#fff7ed' : '#f0fdf4',
                border: `1px solid ${leyDetectada === 'ambas' ? '#fed7aa' : '#bbf7d0'}`,
                color: leyDetectada === 'ambas' ? '#92400e' : '#166534' }}>
                {leyDetectada === '73' && '✓ Detectado: cotizó antes del 1 julio 1997 → Ley 73'}
                {leyDetectada === '97' && '✓ Detectado: solo cotizó después del 1 julio 1997 → Ley 97'}
                {leyDetectada === 'ambas' && '⚡ Cotizó en ambos períodos — puede elegir la más favorable. Compara los resultados de cada ley.'}
              </div>
            )}
            {/* Pregunta manual cuando no hay PDF */}
            {!pdfCargado && leyDetectada === null && (
              <div style={{ padding: '10px', background: '#F4F6FB', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '11px', fontWeight: '700', color: '#475569', margin: '0 0 7px' }}>¿Cotizó al IMSS antes del 1 de julio de 1997?</p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { val: 'si', label: 'Sí', ley: '73', color: AZUL },
                    { val: 'no', label: 'No', ley: '97', color: '#8b5cf6' },
                    { val: 'nose', label: 'No sé', ley: null, color: '#64748b' },
                  ].map(op => (
                    <button key={op.val} onClick={() => {
                      if (op.ley) { setLeyDetectada(op.ley as '73' | '97'); setLey(op.ley as '73' | '97') }
                      else setLeyDetectada('ambas')
                    }} style={{ flex: 1, padding: '6px 4px', borderRadius: '7px', border: `1.5px solid ${op.color}20`, background: 'white', color: op.color, fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Reset detección */}
            {leyDetectada !== null && !pdfCargado && (
              <button onClick={() => setLeyDetectada(null)}
                style={{ fontSize: '10px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '0', textDecoration: 'underline' }}>
                Cambiar respuesta
              </button>
            )}
          </div>

          {/* Perfil del cliente */}
          <div>
            {sectionTitle(2, 'Perfil del cliente', NARANJA)}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={labelSt}>Fecha de nacimiento</label>
                <input type="date" value={fechaNac} onChange={e => setFechaNac(e.target.value)} style={inputSt} />
                {fechaNac && <p style={{ fontSize: '10px', color: '#64748b', margin: '3px 0 0' }}>Edad: <strong>{edad} años</strong> · Años para retiro: <strong>{aniosRetiro}</strong></p>}
              </div>
              <div>
                <label style={labelSt}>Edad de retiro deseada</label>
                <select value={edadRetiro} onChange={e => setEdadRetiro(parseInt(e.target.value))} style={inputSt}>
                  {[60,61,62,63,64,65,66,67,68,69,70].map(e => (
                    <option key={e} value={e}>{e} años {e < 65 ? '(cesantía)' : e === 65 ? '(vejez)' : '(vejez tardía)'}</option>
                  ))}
                </select>
                {edadRetiro < 65 && (
                  <p style={{ fontSize: '10px', color: NARANJA, margin: '3px 0 0', fontWeight: '600' }}>
                    ⚠️ Pensión de cesantía: factor {(FACTOR_CESANTIA[edadRetiro] ?? 1) * 100}% de la pensión de vejez
                  </p>
                )}
              </div>
              <div>
                <label style={labelSt}>Ingreso deseado al retiro ($/mes)</label>
                <input type="number" value={ingresoDes || ''} onChange={e => setIngresoDes(parseInt(e.target.value) || 0)} placeholder="Ej. 25000" style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Inflación estimada (%)</label>
                <input type="number" value={inflacion} step={0.5} onChange={e => setInflacion(parseFloat(e.target.value))} style={inputSt} />
                <p style={{ fontSize: '10px', color: '#64748b', margin: '3px 0 0' }}>Ajusta pensión a pesos de hoy</p>
              </div>
            </div>
          </div>

          {/* Portabilidad ISSSTE */}
          <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '12px', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Portabilidad ISSSTE</span>
              <button onClick={() => setTieneISSSTe(p => !p)}
                style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', background: tieneISSSTe ? VERDE : '#cbd5e1', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', transition: 'left 0.2s', left: tieneISSSTe ? '18px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </button>
            </div>
            {tieneISSSTe && (
              <div>
                <label style={{ ...labelSt, color: '#166534' }}>Años cotizados en ISSSTE</label>
                <input type="number" value={aniosISSSTe || ''} onChange={e => setAniosISSSTe(parseInt(e.target.value) || 0)} placeholder="Ej. 5" style={{ ...inputSt, background: '#f0fdf4', border: '1px solid #86efac' }} />
                <p style={{ fontSize: '10px', color: '#166534', margin: '3px 0 0' }}>= {aniosISSSTe * 52} semanas adicionales · Total: {semanasConPortabilidad} semanas</p>
              </div>
            )}
          </div>

          {/* Datos IMSS */}
          {ley === '73' ? (
            <div>
              {sectionTitle(3, 'Situación IMSS · Ley 73', '#7c3aed')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={labelSt}>Semanas cotizadas en IMSS <span style={{ color: '#ef4444' }}>*</span></label>
                  {/* Botón cargar PDF NSS */}
                  {/* Botón abrir IMSS */}
                  <a href="https://serviciosdigitales.imss.gob.mx/semanascotizadas-web/usuarios/IngresoAsegurado"
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', marginBottom: '6px', textDecoration: 'none', cursor: 'pointer' }}>
                    <span style={{ fontSize: '14px' }}>🏛️</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: VERDE }}>Obtener constancia en imss.gob.mx</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>Abre el portal del IMSS para descargar el PDF oficial</div>
                    </div>
                    <span style={{ fontSize: '10px', color: VERDE }}>↗</span>
                  </a>

                  {!pdfCargado ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', background: uploadingPDF ? '#f1f5f9' : '#EEF2F8', border: `1.5px dashed ${uploadingPDF ? '#cbd5e1' : AZUL}`, borderRadius: '8px', cursor: uploadingPDF ? 'not-allowed' : 'pointer', marginBottom: '6px' }}>
                      <span style={{ fontSize: '16px' }}>{uploadingPDF ? '⏳' : '📄'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: AZUL }}>{uploadingPDF ? 'Analizando documento...' : 'Cargar Constancia IMSS'}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>PDF oficial de imss.gob.mx — extrae datos automáticamente</div>
                      </div>
                      <input type="file" accept=".pdf,image/*" onChange={e => { const f = e.target.files?.[0]; if (f) extraerDatosPDF(f) }} style={{ display: 'none' }} disabled={uploadingPDF} />
                    </label>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '14px' }}>✅</span>
                      <span style={{ flex: 1, fontSize: '11px', color: VERDE, fontWeight: '600' }}>Constancia cargada</span>
                      <button onClick={() => setShowConfirmReplace(true)}
                        style={{ fontSize: '10px', color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer', fontWeight: '600' }}>
                        🔄 Reemplazar
                      </button>
                    </div>
                  )}
                  {pdfMsg && (
                    <p style={{ fontSize: '11px', color: pdfMsg.startsWith('✅') ? VERDE : '#dc2626', margin: '0 0 6px', padding: '7px 10px', background: pdfMsg.startsWith('✅') ? '#f0fdf4' : '#fef2f2', borderRadius: '6px', border: `1px solid ${pdfMsg.startsWith('✅') ? '#bbf7d0' : '#fecaca'}` }}>
                      {pdfMsg}
                    </p>
                  )}
                  <input type="number" value={semanas || ''} onChange={e => setSemanas(parseInt(e.target.value) || 0)} placeholder="Ej. 800" style={inputSt} />
                  {semanasConPortabilidad > 0 && (
                    <p style={{ fontSize: '10px', margin: '3px 0 0', color: semanasConPortabilidad >= 500 ? VERDE : '#ef4444', fontWeight: '600' }}>
                      {semanasConPortabilidad >= 500 ? `✓ Total con portabilidad: ${semanasConPortabilidad} semanas` : `⚠️ Total: ${semanasConPortabilidad}/500 semanas mínimas`}
                    </p>
                  )}
                </div>
                <div>
                  <label style={labelSt}>Salario diario (veces SM) <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="number" value={salarioDiario || ''} step={0.5} onChange={e => setSalarioDiario(parseFloat(e.target.value) || 0)} placeholder="Ej. 3.5" style={inputSt} />
                  {salarioDiario > 0 && (
                    <p style={{ fontSize: '10px', color: '#64748b', margin: '3px 0 0' }}>
                      SDI: {fmtMXN(calcSDI(salarioDiario, sys))}/día · {fmtMXN(calcSDI(salarioDiario, sys) * 30.4)}/mes
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div>
              {sectionTitle(3, 'AFORE · Ley 97', '#7c3aed')}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={labelSt}>Semanas cotizadas</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', background: uploadingPDF ? '#f1f5f9' : '#EEF2F8', border: `1.5px dashed ${uploadingPDF ? '#cbd5e1' : AZUL}`, borderRadius: '8px', cursor: uploadingPDF ? 'not-allowed' : 'pointer', marginBottom: '6px' }}>
                    <span style={{ fontSize: '16px' }}>{uploadingPDF ? '⏳' : '📄'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: AZUL }}>{uploadingPDF ? 'Analizando...' : 'Cargar NSS / Reporte IMSS'}</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>PDF o imagen — extrae datos automáticamente</div>
                    </div>
                    <input type="file" accept=".pdf,image/*" onChange={e => { const f = e.target.files?.[0]; if (f) extraerDatosPDF(f) }} style={{ display: 'none' }} disabled={uploadingPDF} />
                  </label>
                  {pdfMsg && <p style={{ fontSize: '11px', color: pdfMsg.startsWith('✅') ? VERDE : NARANJA, margin: '0 0 6px' }}>{pdfMsg}</p>}
                  <input type="number" value={semanas || ''} onChange={e => setSemanas(parseInt(e.target.value) || 0)} placeholder="Ej. 800" style={inputSt} />
                  <p style={{ fontSize: '10px', margin: '3px 0 0', color: semanasConPortabilidad >= 1250 ? VERDE : '#ef4444', fontWeight: '600' }}>
                    {semanasConPortabilidad >= 1250 ? '✓ Califica para pensión garantizada' : `⚠️ ${semanasConPortabilidad}/1,250 para pensión garantizada`}
                  </p>
                </div>
                <div>
                  <label style={labelSt}>Saldo AFORE actual ($)</label>
                  <input type="number" value={aforeSaldo || ''} onChange={e => setAforeSaldo(parseInt(e.target.value) || 0)} placeholder="Consulta en tu AFORE" style={inputSt} />
                </div>
                <div>
                  <label style={labelSt}>Rendimiento anual (%)</label>
                  <input type="number" value={rendimiento} step={0.5} onChange={e => setRendimiento(parseFloat(e.target.value))} style={inputSt} />
                </div>
                <div>
                  <label style={labelSt}>Aportación voluntaria mensual ($)</label>
                  <input type="number" value={aportVoluntaria || ''} onChange={e => setAportVoluntaria(parseInt(e.target.value) || 0)} placeholder="0" style={inputSt} />
                </div>
              </div>
            </div>
          )}

          {/* Estrategias Mod 10 y 40 (solo Ley 73) */}
          {ley === '73' && (
            <div>
              {sectionTitle(4, 'Estrategias adicionales', VERDE)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

                {/* Mod 10 */}
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#1e40af' }}>MODALIDAD 10</span>
                    <button onClick={() => setMod10Activo(p => !p)}
                      style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', background: mod10Activo ? '#3b82f6' : '#cbd5e1', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', transition: 'left 0.2s', left: mod10Activo ? '18px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </button>
                  </div>
                  <p style={{ fontSize: '10px', color: '#1e40af', margin: '0 0 6px' }}>Continúa cotizando al IMSS sin patrón. Suma semanas manteniendo el mismo SDI.</p>
                  {mod10Activo && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div>
                        <label style={{ ...labelSt, color: '#1e40af' }}>Años a cotizar en Mod 10</label>
                        <input type="number" value={mod10Anios} onChange={e => setMod10Anios(parseInt(e.target.value) || 0)} style={{ ...inputSt }} />
                        <p style={{ fontSize: '10px', color: '#1e40af', margin: '3px 0 0' }}>+{mod10Anios * 52} semanas → Total: {semanasConPortabilidad + mod10Anios * 52} semanas</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mod 40 */}
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#9a3412' }}>MODALIDAD 40</span>
                    <button onClick={() => setMod40Activo(p => !p)}
                      style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', background: mod40Activo ? NARANJA : '#cbd5e1', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                      <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', transition: 'left 0.2s', left: mod40Activo ? '18px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </button>
                  </div>
                  <p style={{ fontSize: '10px', color: '#9a3412', margin: '0 0 6px' }}>Cotiza con salario elevado (hasta 25 UMAs). Incrementa SDI y suma semanas.</p>
                  {mod40Activo && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div>
                        <label style={{ ...labelSt, color: '#9a3412' }}>Salario cotizable (UMAs)</label>
                        <input type="number" value={mod40UmasSalario} step={0.5} max={25} onChange={e => setMod40UmasSalario(parseFloat(e.target.value))} style={{ ...inputSt }} />
                        <p style={{ fontSize: '10px', color: '#9a3412', margin: '3px 0 0' }}>
                          SDI: {fmtMXN(mod40UmasSalario * sys.UMA_DIARIA * 1.0452)}/día
                        </p>
                      </div>
                      <div>
                        <label style={{ ...labelSt, color: '#9a3412' }}>Años de cotización</label>
                        <input type="number" value={mod40Anios} onChange={e => setMod40Anios(parseInt(e.target.value) || 0)} style={{ ...inputSt }} />
                      </div>
                      <div>
                        <label style={{ ...labelSt, color: '#9a3412' }}>Año de inicio</label>
                        <select value={mod40AnioInicio} onChange={e => setMod40AnioInicio(parseInt(e.target.value))} style={{ ...inputSt }}>
                          {Object.keys(MOD40_PCT).map(y => <option key={y} value={y}>{y} — {MOD40_PCT[parseInt(y)]}%</option>)}
                        </select>
                        <p style={{ fontSize: '10px', color: '#9a3412', margin: '3px 0 0', fontWeight: '700' }}>
                          Costo: {fmtMXN(costoMod40(mod40UmasSalario, sys, mod40AnioInicio))}/mes
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── PANEL FINANCIAMIENTO ── */}
        {showFinanciamiento && finSeleccionada && (() => {
          const costoMod40 = mod40Activo && sys.SALARIO_MIN > 0
            ? (mod40UmasSalario * sys.UMA_DIARIA * 30.4 * (sys.mod40_pct ?? 14.438) / 100)
            : 0
          const capital = costoMod40 * finPlazo
          const pension = escenarios[2]?.pension_real ?? escenarios[3]?.pension_real ?? 0
          const { cuota, comisionMonto, totalPagado, rows } = calcularCorrida(capital, finSeleccionada.tasa_anual, finPlazo, finSeleccionada.comision_apertura, finSeleccionada.seguro_mensual)
          const saldoNeto = pension - cuota
          const viable = saldoNeto >= 1000
          const ajustado = saldoNeto >= 0 && saldoNeto < 1000
          const semColor = viable ? VERDE : ajustado ? NARANJA : '#ef4444'
          const semLabel = viable ? '🟢 Viable — pensión cubre la cuota con margen' : ajustado ? '🟡 Ajustado — margen mínimo, revisar plazo' : '🔴 No viable — cuota supera la pensión'
          return (
            <div style={{ width: '320px', flexShrink: 0, borderLeft: '1px solid #e2e8f0', background: 'white', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', background: '#F8FAFC', flexShrink: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: AZUL, margin: '0 0 1px' }}>💰 Financiamiento Mod 40</p>
                <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>Selecciona financiera y plazo</p>
              </div>

              {/* Carrusel financieras */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                {financieras.map(fin => {
                  const isSelected = finSeleccionada.id === fin.id
                  const { cuota: c } = calcularCorrida(costoMod40 * finPlazo, fin.tasa_anual, finPlazo, fin.comision_apertura, fin.seguro_mensual)
                  return (
                    <div key={fin.id} onClick={() => setFinSeleccionada(fin)}
                      style={{ border: `${isSelected ? '2px' : '1px'} solid ${isSelected ? AZUL : '#e2e8f0'}`, borderRadius: '10px', padding: '10px', cursor: 'pointer', background: isSelected ? '#EEF2F8' : 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div>
                          <p style={{ fontSize: '12px', fontWeight: '700', color: AZUL, margin: 0 }}>{fin.nombre}</p>
                          <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>{fin.descripcion}</p>
                        </div>
                        {isSelected && <span style={{ fontSize: '9px', background: AZUL, color: 'white', padding: '2px 6px', borderRadius: '8px', fontWeight: '700' }}>✓</span>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                        <div style={{ background: 'white', borderRadius: '6px', padding: '4px 8px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '9px', color: '#94a3b8' }}>Tasa anual</div>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: AZUL }}>{fin.tasa_anual}%</div>
                        </div>
                        <div style={{ background: 'white', borderRadius: '6px', padding: '4px 8px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '9px', color: '#94a3b8' }}>Cuota est.</div>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: VERDE }}>{fmtMXN(c)}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Plazo */}
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Plazo del crédito</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[12,24,36,48].filter(p => p >= finSeleccionada.plazo_min && p <= finSeleccionada.plazo_max).map(p => (
                    <button key={p} onClick={() => setFinPlazo(p)}
                      style={{ flex: 1, padding: '7px 4px', borderRadius: '7px', border: `2px solid ${finPlazo === p ? AZUL : '#e2e8f0'}`, background: finPlazo === p ? AZUL : 'white', color: finPlazo === p ? 'white' : '#64748b', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                      {p}m
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: '10px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* KPIs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {[
                    { label: 'Capital', value: fmtMXN(capital), color: AZUL },
                    { label: 'Cuota/mes', value: fmtMXN(cuota), color: AZUL },
                    { label: 'Pensión E4', value: fmtMXN(pension), color: VERDE },
                    { label: 'Saldo neto', value: fmtMXN(saldoNeto), color: saldoNeto >= 0 ? VERDE : '#ef4444' },
                  ].map((k, i) => (
                    <div key={i} style={{ background: '#F4F6FB', borderRadius: '8px', padding: '7px 9px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>{k.label}</div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: k.color }}>{k.value}</div>
                    </div>
                  ))}
                </div>

                {/* Semáforo */}
                <div style={{ padding: '8px 10px', borderRadius: '8px', background: viable ? '#f0fdf4' : ajustado ? '#fff7ed' : '#fef2f2', border: `1px solid ${viable ? '#bbf7d0' : ajustado ? '#fed7aa' : '#fecaca'}`, fontSize: '11px', fontWeight: '700', color: semColor, textAlign: 'center' }}>
                  {semLabel}
                </div>

                {/* Tabla amortización */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '7px 10px', background: '#F4F6FB', borderBottom: '2px solid #e2e8f0' }}>
                    <p style={{ fontSize: '11px', fontWeight: '700', color: AZUL, margin: 0 }}>Tabla de amortización</p>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #dde3ea' }}>
                        {['#','Cuota','Capital','Interés','Saldo'].map((h, i) => (
                          <th key={i} style={{ padding: '5px 6px', textAlign: i === 0 ? 'center' : 'right', fontSize: '9px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', borderRight: i < 4 ? '1px solid #e2e8f0' : 'none' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0,6).map((r, i) => (
                        <tr key={r.mes} style={{ background: i % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: '1px solid #f0f4f8' }}>
                          <td style={{ padding: '5px 6px', textAlign: 'center', color: '#94a3b8', fontWeight: '600', borderRight: '1px solid #e2e8f0' }}>{r.mes}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600', color: AZUL, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(r.cuota)}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', color: VERDE, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(r.capital)}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', color: NARANJA, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(r.interes)}</td>
                          <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>{fmtMXN(r.saldo)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: '#EEF2F8', borderTop: '2px solid #d0d9e8' }}>
                        <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: '700', color: AZUL, fontSize: '9px', borderRight: '1px solid #e2e8f0' }}>Tot</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '700', color: AZUL, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(totalPagado)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '700', color: VERDE, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(capital)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '700', color: NARANJA, borderRight: '1px solid #e2e8f0' }}>{fmtMXN(totalPagado - capital - comisionMonto)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '700', color: '#374151' }}>—</td>
                      </tr>
                    </tbody>
                  </table>
                  <p style={{ fontSize: '10px', color: '#94a3b8', padding: '5px 10px', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
                    6 de {finPlazo} meses · tabla completa en PDF
                  </p>
                </div>

                {/* Contacto */}
                {(finSeleccionada.contacto_email || finSeleccionada.contacto_telefono) && (
                  <div style={{ background: '#F4F6FB', borderRadius: '8px', padding: '8px 10px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                    <p style={{ fontWeight: '700', color: AZUL, margin: '0 0 4px' }}>Contacto</p>
                    {finSeleccionada.contacto_nombre && <p style={{ color: '#64748b', margin: '0 0 2px' }}>{finSeleccionada.contacto_nombre}</p>}
                    {finSeleccionada.contacto_email && <p style={{ color: AZUL, margin: '0 0 2px' }}>{finSeleccionada.contacto_email}</p>}
                    {finSeleccionada.contacto_telefono && <p style={{ color: '#64748b', margin: 0 }}>{finSeleccionada.contacto_telefono}</p>}
                  </div>
                )}

                <button style={{ width: '100%', padding: '10px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                  📄 Generar solicitud de crédito PDF
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── PANEL DERECHO — RESULTADOS ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* 4 Escenarios */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {escenarios.map(esc => {
              const pct = ingresoDes > 0 ? Math.min(100, Math.round((esc.pension_real / ingresoDes) * 100)) : 0
              const activo = escSelected === esc.tag
              return (
                <div key={esc.tag} onClick={() => setEscSelected(esc.tag)} style={{
                  borderRadius: '12px', padding: '14px', cursor: 'pointer', position: 'relative',
                  background: activo ? esc.color : 'white',
                  border: `2px solid ${activo ? esc.color : '#e2e8f0'}`,
                  boxShadow: activo ? `0 4px 16px ${esc.color}40` : '0 1px 4px rgba(0,0,0,0.05)',
                  transition: 'all 0.15s',
                }}>
                  {esc.recomendado && (
                    <div style={{ position: 'absolute', top: '-8px', right: '8px', fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '10px', background: NARANJA, color: 'white' }}>⭐ ÓPTIMO</div>
                  )}
                  <p style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px', color: activo ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>{esc.nombre}</p>
                  <p style={{ fontSize: '20px', fontWeight: '800', margin: '0 0 2px', color: activo ? 'white' : esc.color }}>{fmtMXN(esc.pension)}</p>
                  <p style={{ fontSize: '9px', margin: '0 0 2px', color: activo ? 'rgba(255,255,255,0.6)' : '#94a3b8' }}>pesos futuros/mes</p>
                  <p style={{ fontSize: '11px', fontWeight: '700', margin: '0 0 6px', color: activo ? 'rgba(255,255,255,0.9)' : AZUL }}>{fmtMXN(esc.pension_real)} <span style={{ fontSize: '9px', fontWeight: '400' }}>pesos de hoy</span></p>
                  <div style={{ height: '5px', borderRadius: '3px', overflow: 'hidden', background: activo ? 'rgba(255,255,255,0.2)' : '#f1f5f9', marginBottom: '4px' }}>
                    <div style={{ height: '100%', borderRadius: '3px', width: `${pct}%`, background: activo ? 'rgba(255,255,255,0.8)' : esc.color, transition: 'width 0.5s' }} />
                  </div>
                  <p style={{ fontSize: '10px', fontWeight: '700', margin: '0 0 4px', color: activo ? 'rgba(255,255,255,0.8)' : esc.color }}>{pct}% del objetivo</p>
                  {esc.inversion_mensual > 0 && <p style={{ fontSize: '9px', margin: 0, color: activo ? 'rgba(255,255,255,0.55)' : '#94a3b8' }}>Inversión: {fmtMXN(esc.inversion_mensual)}/mes</p>}
                </div>
              )
            })}
          </div>

          {/* Detalle escenario seleccionado */}
          {escAct && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '12px' }}>
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ color: escAct.color, fontSize: '14px' }}>●</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: AZUL }}>{escAct.nombre}</span>
                  {escAct.recomendado && <span style={{ marginLeft: 'auto', fontSize: '9px', background: NARANJA, color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>Escenario óptimo</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  {[
                    { label: 'Pensión nominal', value: fmtMXN(escAct.pension), color: escAct.color, sub: 'pesos futuros/mes' },
                    { label: 'Pensión real (hoy)', value: fmtMXN(escAct.pension_real), color: AZUL, sub: `ajustada ${inflacion}% inflación` },
                    { label: 'Objetivo', value: fmtMXN(ingresoDes), color: '#64748b', sub: 'ingreso deseado' },
                    { label: escAct.brecha_real > 0 ? 'Brecha real' : 'Cobertura', value: escAct.brecha_real > 0 ? fmtMXN(escAct.brecha_real) : '✅ Cubierto', color: escAct.brecha_real > 0 ? '#ef4444' : VERDE, sub: 'en pesos de hoy' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: '#F4F6FB', borderRadius: '8px', padding: '10px' }}>
                      <p style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>{item.label}</p>
                      <p style={{ fontSize: '14px', fontWeight: '700', margin: '0 0 2px', color: item.color }}>{item.value}</p>
                      <p style={{ fontSize: '9px', color: '#94a3b8', margin: 0 }}>{item.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Barra cobertura */}
                <div style={{ background: '#F4F6FB', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '600', color: AZUL }}>Cobertura del objetivo (pesos de hoy)</span>
                    <span style={{ fontWeight: '700', color: escAct.color }}>{ingresoDes > 0 ? Math.min(100, Math.round((escAct.pension_real / ingresoDes) * 100)) : 0}%</span>
                  </div>
                  <div style={{ height: '10px', borderRadius: '5px', overflow: 'hidden', background: '#e2e8f0' }}>
                    <div style={{ height: '100%', borderRadius: '5px', width: `${ingresoDes > 0 ? Math.min(100, (escAct.pension_real / ingresoDes) * 100) : 0}%`, background: `linear-gradient(90deg, ${escAct.color}, ${escAct.color}cc)`, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#94a3b8', marginTop: '3px' }}>
                    <span>$0</span><span>{fmtMXN(ingresoDes)}/mes</span>
                  </div>
                </div>

                {/* Notas del escenario */}
                {escAct.notas.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {escAct.notas.map((n, i) => (
                      <p key={i} style={{ fontSize: '11px', color: '#64748b', margin: 0, padding: '3px 8px', background: '#F4F6FB', borderRadius: '4px' }}>{n}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Variables y guardar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Variables */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: '11px', fontWeight: '700', color: AZUL, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Variables 2026</p>
                  {[
                    { label: 'UMA diaria', value: `$${sys.UMA_DIARIA}` },
                    { label: 'Salario mínimo', value: `$${sys.SALARIO_MIN}/día` },
                    { label: 'PMG Ley 73', value: fmtMXN(sys.PMG_L73) },
                    { label: 'PMG Ley 97', value: fmtMXN(sys.PMG_L97) },
                    { label: 'Mod 40 · 2026', value: `${MOD40_PCT[2026]}%` },
                    { label: 'Mod 40 · 2027', value: `${MOD40_PCT[2027]}%` },
                    { label: 'Mod 40 · 2028', value: `${MOD40_PCT[2028]}%` },
                  ].map(v => (
                    <div key={v.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ color: '#64748b' }}>{v.label}</span>
                      <span style={{ fontWeight: '600', color: AZUL }}>{v.value}</span>
                    </div>
                  ))}
                </div>

                {/* Notas */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: '11px', fontWeight: '700', color: AZUL, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notas del diagnóstico</p>
                  <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={4}
                    placeholder="Observaciones, acuerdos, próximos pasos..."
                    style={{ ...inputSt, resize: 'none', fontSize: '12px' }} />
                  {!clienteId && <p style={{ fontSize: '10px', color: NARANJA, margin: '6px 0 0' }}>⚠️ Selecciona un cliente en el encabezado para guardar</p>}
                </div>
              </div>
            </div>
          )}

          {/* Tabla comparativa */}
          {escenarios.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: AZUL }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: 'white', margin: 0 }}>Comparativo de los 4 escenarios · Pesos de hoy (ajustados por inflación {inflacion}%)</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {['Concepto', ...escenarios.map(e => e.nombre)].map((h, i) => (
                      <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', color: i === 0 ? '#64748b' : escenarios[i-1]?.color, fontWeight: '700', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Pensión nominal', fn: (e: Escenario) => fmtMXN(e.pension) },
                    { label: 'Pensión real (hoy)', fn: (e: Escenario) => fmtMXN(e.pension_real) },
                    { label: 'Inversión mensual', fn: (e: Escenario) => e.inversion_mensual > 0 ? fmtMXN(e.inversion_mensual) : '—' },
                    { label: 'Brecha vs objetivo', fn: (e: Escenario) => e.brecha_real > 0 ? fmtMXN(e.brecha_real) : '✅ Cubierto' },
                    { label: 'Cobertura', fn: (e: Escenario) => `${ingresoDes > 0 ? Math.min(100, Math.round((e.pension_real / ingresoDes) * 100)) : 0}%` },
                  ].map((row, ri) => (
                    <tr key={row.label} style={{ background: ri % 2 === 0 ? 'white' : '#F8FAFC' }}>
                      <td style={{ padding: '8px 12px', fontSize: '11px', fontWeight: '600', color: AZUL }}>{row.label}</td>
                      {escenarios.map(esc => (
                        <td key={esc.tag} style={{ padding: '8px 12px', fontSize: '11px', fontWeight: '700', color: escSelected === esc.tag ? esc.color : AZUL, background: escSelected === esc.tag ? `${esc.color}08` : undefined }}>
                          {row.fn(esc)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── ANÁLISIS NARRATIVO ── */}
          {escenarios.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: AZUL, margin: 0 }}>📝 Análisis del diagnóstico</p>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 0' }}>Generado por IA · editable antes de exportar al PDF</p>
                </div>
                {!analisis && (
                  <button onClick={generarAnalisis} disabled={generandoAnalisis}
                    style={{ padding: '7px 14px', background: generandoAnalisis ? '#f1f5f9' : AZUL, color: generandoAnalisis ? '#94a3b8' : 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: generandoAnalisis ? 'not-allowed' : 'pointer' }}>
                    {generandoAnalisis ? '⏳ Generando...' : '✨ Generar análisis'}
                  </button>
                )}
                {analisis && (
                  <button onClick={() => { setAnalisis(null); generarAnalisis() }} disabled={generandoAnalisis}
                    style={{ padding: '7px 14px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                    🔄 Regenerar
                  </button>
                )}
              </div>

              {generandoAnalisis && (
                <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>🤔</div>
                  <p style={{ fontSize: '13px', margin: 0 }}>Analizando el caso pensional...</p>
                  <p style={{ fontSize: '11px', margin: '4px 0 0', color: '#cbd5e1' }}>Esto tarda unos segundos</p>
                </div>
              )}

              {analisis && !generandoAnalisis && (
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {[
                    { key: 'contexto', label: '👤 Contexto del asegurado', color: AZUL },
                    { key: 'diagnostico_actual', label: '🔍 Diagnóstico actual', color: '#dc2626' },
                    { key: 'opciones_disponibles', label: '⚡ Opciones disponibles', color: NARANJA },
                    { key: 'recomendacion', label: '✅ Recomendación', color: VERDE },
                    { key: 'proximos_pasos', label: '📋 Próximos pasos', color: '#8b5cf6' },
                  ].map(sec => (
                    <div key={sec.key}>
                      <p style={{ fontSize: '11px', fontWeight: '700', color: sec.color, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{sec.label}</p>
                      <textarea
                        value={(analisis as any)[sec.key]}
                        onChange={e => setAnalisis(prev => prev ? { ...prev, [sec.key]: e.target.value } : prev)}
                        rows={sec.key === 'proximos_pasos' ? 4 : 5}
                        style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '12px', lineHeight: '1.6', resize: 'vertical', outline: 'none', fontFamily: 'inherit', color: '#374151', background: '#FAFBFC', boxSizing: 'border-box' }}
                        onFocus={e => e.target.style.borderColor = sec.color}
                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                      />
                    </div>
                  ))}
                </div>
              )}

              {!analisis && !generandoAnalisis && (
                <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                  <p style={{ fontSize: '13px', margin: '0 0 4px', fontWeight: '600', color: '#64748b' }}>Sin análisis generado</p>
                  <p style={{ fontSize: '11px', margin: 0 }}>Haz clic en "Generar análisis" para crear el texto de la propuesta</p>
                </div>
              )}
            </div>
          )}

          {/* ── HISTORIAL DE DIAGNÓSTICOS ── */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => setShowHistorial(p => !p)}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: AZUL, margin: 0 }}>
                🗂️ Historial de diagnósticos ({historial.length})
              </p>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{showHistorial ? '▲' : '▼'}</span>
            </div>
            {showHistorial && (
              historial.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Sin diagnósticos guardados aún</div>
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #e2e8f0' }}>
                        {['Fecha', 'Cliente', 'Ley', 'Semanas', 'E1 (hoy)', 'E4 (hoy)', ''].map((h, i) => (
                          <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map((d, i) => (
                        <tr key={d.id} style={{ borderBottom: i < historial.length-1 ? '1px solid #f1f5f9' : 'none' }}>
                          <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {new Date(d.created_at).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'2-digit' })}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: '600', color: AZUL, whiteSpace: 'nowrap' }}>
                            {(d.clientes as any)?.nombre ?? '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ background: d.ley === '73' ? '#EEF2F8' : '#f0fdf4', color: d.ley === '73' ? AZUL : VERDE, padding: '1px 6px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>
                              L{d.ley}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', color: '#374151' }}>{d.semanas}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>
                            {d.resultado_e1 ? `$${Math.round(d.resultado_e1).toLocaleString()}` : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: '700', color: VERDE }}>
                            {d.resultado_e4 ? `$${Math.round(d.resultado_e4).toLocaleString()}` : '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <button onClick={() => {
                              setLey(d.ley)
                              setSemanas(d.semanas)
                              setSalarioDiario(d.salario_diario)
                              setEdadRetiro(d.edad_retiro)
                              setIngresoDes(d.ingreso_deseado)
                              setClienteId(d.cliente_id)
                              setNotas(d.notas ?? '')
                            }} style={{ fontSize: '11px', color: NARANJA, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', fontWeight: '600' }}>
                              Cargar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* Disclaimer */}
          <div style={{ background: '#fffbeb', borderRadius: '10px', padding: '10px 14px', border: '1px solid #fde68a' }}>
            <p style={{ fontSize: '10px', color: '#92400e', margin: 0, lineHeight: '1.6' }}>
              ⚠️ <strong>Cálculos orientativos basados en variables oficiales 2026.</strong> Los resultados dependen del historial laboral individual, resoluciones del IMSS, cambios legislativos y rendimientos reales. La pensión real está ajustada por inflación estimada de {inflacion}% anual. Este diagnóstico no constituye asesoría jurídica ni garantía de prestaciones. Verifica semanas cotizadas en imss.gob.mx · Variables: UMA ${sys.UMA_DIARIA} · SM ${sys.SALARIO_MIN} · PMG L73 {fmtMXN(sys.PMG_L73)} · PMG L97 {fmtMXN(sys.PMG_L97)}
            </p>
          </div>
        </div>
      </div>
    {/* Modal alerta validación */}
      {appAlert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAppAlert(null)}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '360px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚠️</div>
            <h3 style={{ color: '#1e293b', fontSize: '16px', fontWeight: '700', margin: '0 0 10px' }}>Campo requerido</h3>
            <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 20px', lineHeight: 1.6 }}>{appAlert}</p>
            <button onClick={() => setAppAlert(null)}
              style={{ width: '100%', padding: '11px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
              Entendido
            </button>
          </div>
        </div>
      )}

    {/* Modal confirmar reemplazar constancia */}
      {showConfirmReplace && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowConfirmReplace(false) }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '380px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔄</div>
            <h3 style={{ color: '#1e293b', fontSize: '16px', fontWeight: '700', margin: '0 0 8px' }}>¿Reemplazar constancia?</h3>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 20px', lineHeight: 1.6 }}>
              Se borrarán los datos extraídos (semanas, salario y fecha de nacimiento) y podrás cargar una nueva constancia.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowConfirmReplace(false)}
                style={{ flex: 1, padding: '10px', background: '#F4F6FB', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => {
                setPdfCargado(false)
                setPdfMsg(null)
                setSemanas(0)
                setSalarioDiario(0)
                setFechaNac('')
                setShowConfirmReplace(false)
              }} style={{ flex: 1, padding: '10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                Sí, reemplazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CalculadoraPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Cargando calculadora...</div>}>
      <CalculadoraInner />
    </Suspense>
  )
}
