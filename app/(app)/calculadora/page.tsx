'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
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
          setPdfMsg('❌ Error técnico al procesar el archivo. Intenta de nuevo.')
          setUploadingPDF(false)
          return
        }

        const parsed = json.data

        // Validate it's actually an IMSS document
        if (!parsed.semanas || !parsed.nss) {
          setPdfMsg('❌ El documento no parece ser una Constancia de Semanas Cotizadas del IMSS. Verifica que sea el archivo correcto descargado de imss.gob.mx')
          setUploadingPDF(false)
          return
        }

        if (parsed.semanas) setSemanas(parsed.semanas)
        if (parsed.salario_diario && sys.SALARIO_MIN > 0) {
          setSalarioDiario(Math.round((parsed.salario_diario / sys.SALARIO_MIN) * 10) / 10)
        }
        if (parsed.fecha_nac) setFechaNac(parsed.fecha_nac)
        if (parsed.fecha_nac) {
          const anioNac = new Date(parsed.fecha_nac).getFullYear()
          if (anioNac < 1979) setLey('73')
          else setLey('97')
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

  async function generarPDF() {
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
    if (!semanas || semanas === 0) { alert('⚠️ Ingresa las semanas cotizadas antes de guardar.'); return }
    if (!salarioDiario || salarioDiario === 0) { alert('⚠️ Ingresa el salario diario antes de guardar.'); return }
    if (!ingresoDes || ingresoDes === 0) { alert('⚠️ Ingresa el ingreso deseado al retiro antes de guardar.'); return }
    setSaving(true)
    await supabase.from('diagnosticos').insert({
      asesor_id: userId, cliente_id: clienteId, ley,
      semanas, salario_diario: salarioDiario, edad_retiro: edadRetiro,
      ingreso_deseado: ingresoDes, afore_saldo: aforeSaldo,
      ppr_mensual: 0, rendimiento,
      resultado_e1: escenarios[0]?.pension,
      resultado_e2: escenarios[1]?.pension,
      resultado_e3: escenarios[2]?.pension,
      resultado_e4: escenarios[3]?.pension,
      notas: notas || null,
    })
    setSaving(false)
    setSaved(true)
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
          setPdfMsg('❌ Error técnico al procesar el archivo. Intenta de nuevo.')
          setUploadingPDF(false)
          return
        }

        const parsed = json.data

        // Validate it's actually an IMSS document
        if (!parsed.semanas || !parsed.nss) {
          setPdfMsg('❌ El documento no parece ser una Constancia de Semanas Cotizadas del IMSS. Verifica que sea el archivo correcto descargado de imss.gob.mx')
          setUploadingPDF(false)
          return
        }

        if (parsed.semanas) setSemanas(parsed.semanas)
        if (parsed.salario_diario && sys.SALARIO_MIN > 0) {
          setSalarioDiario(Math.round((parsed.salario_diario / sys.SALARIO_MIN) * 10) / 10)
        }
        if (parsed.fecha_nac) setFechaNac(parsed.fecha_nac)
        if (parsed.fecha_nac) {
          const anioNac = new Date(parsed.fecha_nac).getFullYear()
          if (anioNac < 1979) setLey('73')
          else setLey('97')
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

  async function generarPDF() {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ color: AZUL, fontSize: '17px', fontWeight: '800', margin: 0 }}>🧮 Calculadora de Pensiones IMSS</h1>
          <p style={{ color: '#64748b', fontSize: '10px', margin: '2px 0 0' }}>Ley 73 · Ley 97 · Modalidad 10 · Modalidad 40 · Portabilidad ISSSTE · Variables 2026</p>
        </div>
        <div style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'right' }}>
          UMA ${sys.UMA_DIARIA} · SM ${sys.SALARIO_MIN} · PMG L73 {fmtMXN(sys.PMG_L73)}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── PANEL IZQUIERDO — INPUTS ── */}
        <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid #e2e8f0', background: 'white', overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Régimen */}
          <div>
            {sectionTitle(1, 'Régimen de pensión', AZUL)}
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['73', '97'] as const).map(l => (
                <button key={l} onClick={() => setLey(l)}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `2px solid ${ley === l ? AZUL : '#e2e8f0'}`, background: ley === l ? AZUL : 'white', color: ley === l ? 'white' : '#64748b', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                  Ley {l} {l === '73' ? '(pre-97)' : '(AFORE)'}
                </button>
              ))}
            </div>
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
                      <button onClick={() => {
                        if (window.confirm('¿Seguro que quieres reemplazar la constancia cargada? Se borrarán los datos extraídos.')) {
                          setPdfCargado(false)
                          setPdfMsg(null)
                          setSemanas(0)
                          setSalarioDiario(0)
                          setFechaNac('')
                        }
                      }} style={{ fontSize: '10px', color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '5px', padding: '2px 8px', cursor: 'pointer', fontWeight: '600' }}>
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

                {/* Guardar */}
                <div style={{ background: 'white', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: '11px', fontWeight: '700', color: AZUL, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Guardar diagnóstico</p>
                  <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={{ ...inputSt, marginBottom: '8px' }}>
                    <option value="">— Seleccionar cliente —</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Notas del diagnóstico..."
                    style={{ ...inputSt, resize: 'none', marginBottom: '8px', fontSize: '12px' }} />
                  {!clienteId && <p style={{ fontSize: '10px', color: NARANJA, margin: '0 0 6px' }}>⚠️ Selecciona un cliente</p>}
                  <button onClick={guardar} disabled={saving || !clienteId || saved}
                    style={{ width: '100%', padding: '9px', background: saved ? VERDE : (!clienteId ? '#94a3b8' : AZUL), color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: (!clienteId || saved) ? 'not-allowed' : 'pointer' }}>
                    {saved ? '✓ Guardado en expediente' : saving ? 'Guardando...' : '💾 Guardar en expediente'}
                  </button>
                  <button onClick={generarPDF} disabled={escenarios.length === 0}
                    style={{ width: '100%', padding: '9px', background: escenarios.length === 0 ? '#94a3b8' : '#F05B21', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: escenarios.length === 0 ? 'not-allowed' : 'pointer', marginTop: '6px' }}>
                    📄 Exportar PDF
                  </button>
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

          {/* Disclaimer */}
          <div style={{ background: '#fffbeb', borderRadius: '10px', padding: '10px 14px', border: '1px solid #fde68a' }}>
            <p style={{ fontSize: '10px', color: '#92400e', margin: 0, lineHeight: '1.6' }}>
              ⚠️ <strong>Cálculos orientativos basados en variables oficiales 2026.</strong> Los resultados dependen del historial laboral individual, resoluciones del IMSS, cambios legislativos y rendimientos reales. La pensión real está ajustada por inflación estimada de {inflacion}% anual. Este diagnóstico no constituye asesoría jurídica ni garantía de prestaciones. Verifica semanas cotizadas en imss.gob.mx · Variables: UMA ${sys.UMA_DIARIA} · SM ${sys.SALARIO_MIN} · PMG L73 {fmtMXN(sys.PMG_L73)} · PMG L97 {fmtMXN(sys.PMG_L97)}
            </p>
          </div>
        </div>
      </div>
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
