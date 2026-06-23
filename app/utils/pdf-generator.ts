// PDF Generator — KSE Pensiones v2
// Diseño: portada profesional, jerarquía tipográfica, gráfica de barras, timeline, chips de alerta
import jsPDF from 'jspdf'

const AZUL   = '#1B3A6B'
const NARANJA = '#F05B21'
const VERDE  = '#2E8B57'
const ROJO   = '#DC2626'
const GRIS   = '#64748b'

const fmtMXN  = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

function hexToRgb(hex: string): [number, number, number] {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 7) return [27, 58, 107]
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b]
}

export async function generarPDFProyecto(params: {
  datos: any
  periodos: any[]
  sdiPromedio: number
  escenarios: any[]
  escSelIdx: number
  corridaFin: any
  finSel: any
  finPlazo: number
  analisis: any[]
  logoUrl?: string
  razonSocial?: string
  asesorNombre?: string
  ingresoObjetivo?: number
  encabezadoColor?: string
  encabezadoTitulo?: string
  encabezadoLogoSize?: number
  encabezadoFontSize?: number
  esBorrador?: boolean
}) {
  const {
    datos, periodos, sdiPromedio, escenarios, escSelIdx,
    corridaFin, finSel, finPlazo, analisis,
    logoUrl, razonSocial, asesorNombre, ingresoObjetivo,
    encabezadoColor, encabezadoTitulo, encabezadoLogoSize, encabezadoFontSize,
    esBorrador = false,
  } = params

  const HC   = encabezadoColor  || AZUL
  const HTIT = encabezadoTitulo || 'Diagnóstico Pensional'
  const LSIZ = encabezadoLogoSize || 28
  const HFSZ = encabezadoFontSize || 13

  const escSel = escenarios[escSelIdx] ?? escenarios.find((e: any) => e.recomendado) ?? escenarios[escenarios.length - 1] ?? null
  if (!escSel || escenarios.length === 0) {
    const d = new jsPDF(); d.text('Error: no hay escenarios calculados.', 20, 30); return d
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const W = 216, H = 279, ML = 16, MR = 16

  let y = 0

  // ── Color helpers
  const setC  = (hex: string) => { const [r,g,b] = hexToRgb(hex); doc.setTextColor(r,g,b) }
  const setF  = (hex: string) => { const [r,g,b] = hexToRgb(hex); doc.setFillColor(r,g,b) }
  const setS  = (hex: string) => { const [r,g,b] = hexToRgb(hex); doc.setDrawColor(r,g,b) }
  const t     = (s: string, x: number, yy: number, o?: any) => doc.text(s, x, yy, o)

  // ── Page management
  const checkPage = (needed = 30) => { if (y + needed > H - 18) newPage() }
  const newPage   = () => {
    doc.addPage(); y = 22; addHeader()
    if (esBorrador) {
      doc.saveGraphicsState()
      try { doc.setGState(new (doc as any).GState({ opacity: 0.06 })) } catch(_) {}
      doc.setFontSize(48); doc.setFont('helvetica', 'bold'); setC(ROJO)
      t('BORRADOR', W / 2, H / 2, { align: 'center', angle: 35 })
      doc.restoreGraphicsState()
    }
  }

  // ── Running header (pages 2+)
  function addHeader() {
    setF(HC); doc.rect(0, 0, W, 12, 'F')
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); setC('#ffffff')
    const headerStr = (razonSocial || 'KSE Pensiones') + ' — ' + HTIT
    const headerLines = doc.splitTextToSize(headerStr, (W - ML - MR) / 2)
    t(headerLines[0], ML, 8)
    doc.setFont('helvetica', 'normal')
    t(new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }), W - MR, 8, { align: 'right' })
    if (esBorrador) {
      setC('#fbbf24'); doc.setFontSize(6); doc.setFont('helvetica', 'bold')
      t('BORRADOR — No oficial', W / 2, 8, { align: 'center' })
    }
  }

  // ── Section title bar (H1 equivalent — 20pt visual weight)
  function sectionTitle(num: string, title: string, sub?: string) {
    checkPage(28)
    // Background bar
    setF(HC); doc.rect(ML, y, W - ML - MR, 11, 'F')
    // Title in white, 13pt bold
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); setC('#ffffff')
    const titleStr = String(title || '')
    const titleLines = doc.splitTextToSize(titleStr, W - ML - MR - (sub ? 65 : 12))
    t(titleLines[0], ML + 5, y + 8)
    if (sub) {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setC('#ffffff')
      const subTrunc = doc.splitTextToSize(String(sub), 60)
      t(subTrunc[0], W - MR - 4, y + 8, { align: 'right' })
    }
    // Underline below bar
    setS(HC); doc.setLineWidth(1.5)
    doc.line(ML, y + 11, W - MR, y + 11)
    y += 17
  }

  // ── Sub-section label (H2 — 14pt)
  function subTitle(title: string) {
    checkPage(16)
    // Remove leading special chars
    const safeTitle2 = (title == null || typeof title !== 'string') ? '' : title
    const cleanTitle = safeTitle2.replace(/^[→•\-–—#*]+\s*/, '')
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); setC(HC)
    t(cleanTitle, ML, y + 6)
    y += 11
  }

  // ── Body text (11pt)
  function bodyText(txt: string, indent = 0) {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); setC('#374151')
    // Clean up bullet chars — replace & or * at start with proper bullet
    const safeTxt = (txt == null || typeof txt !== 'string') ? '' : txt
    const cleanTxt = safeTxt.replace(/^[&*]\s*/, '• ').replace(/\s*&\s*/g, ' • ')
    const lines = doc.splitTextToSize(cleanTxt, W - ML - MR - indent - 2)
    lines.forEach((l: string) => { checkPage(6); t(l, ML + indent + 2, y); y += 5 })
    y += 2
  }

  // ── Alert chip
  function alertChip(msg: string, type: 'danger' | 'success' | 'warning' = 'danger') {
    checkPage(12)
    const bg   = type === 'danger' ? '#fef2f2' : type === 'warning' ? '#fffbeb' : '#f0fdf4'
    const brd  = type === 'danger' ? '#fecaca' : type === 'warning' ? '#fde68a' : '#bbf7d0'
    const txt  = type === 'danger' ? '#991b1b' : type === 'warning' ? '#92400e' : '#15803d'
    const acc  = type === 'danger' ? ROJO      : type === 'warning' ? '#f59e0b' : VERDE
    const chipLines = doc.splitTextToSize(String(msg ?? ''),  W - ML - MR - 10)
    const chipH = Math.max(8, chipLines.length * 5 + 4)
    setF(bg); setS(brd); doc.setLineWidth(0.3)
    doc.rect(ML, y, W - ML - MR, chipH, 'FD')
    setF(acc); doc.rect(ML, y, 2.5, chipH, 'F')
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setC(txt)
    chipLines.forEach((cl: string, ci: number) => t(cl, ML + 6, y + 5.5 + ci * 5))
    y += chipH + 3
  }

  // ── KPI row (4 cards)
  function kpiRow(items: {label: string; value: string; color?: string; sub?: string}[]) {
    checkPage(20)
    const cw = (W - ML - MR) / items.length
    const cardH = 20
    items.forEach((item, i) => {
      const x = ML + i * cw
      setF('#F4F6FB'); setS('#e2e8f0'); doc.setLineWidth(0.3)
      doc.rect(x, y, cw - 1, cardH, 'FD')
      // Label centered horizontally
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setC('#94a3b8')
      const lblLines = doc.splitTextToSize(String(item?.label ?? '').toUpperCase(), cw - 6)
      lblLines.slice(0,2).forEach((ll: string, li: number) => t(ll, x + (cw - 1) / 2, y + 5 + li * 3.5, { align: 'center' }))
      // Value centered, larger and impactful
      doc.setFontSize(12); doc.setFont('helvetica', 'bold')
      const [r,g,b] = hexToRgb(item.color || HC)
      doc.setTextColor(r,g,b)
      const valLines = doc.splitTextToSize(String(item?.value ?? ''), cw - 6)
      t(valLines[0], x + (cw - 1) / 2, y + cardH - 5, { align: 'center' })
    })
    y += cardH + 2
  }

  // ── Table helpers
  function tHead(headers: string[], widths: number[], startX = ML) {
    checkPage(10)
    const tw = widths.reduce((s, w) => s + w, 0)
    setF(HC); doc.rect(startX, y, tw, 7.5, 'F')
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); setC('#ffffff')
    let x = startX
    headers.forEach((h, i) => { t(h, x + widths[i] / 2, y + 5.2, { align: 'center' }); x += widths[i] })
    y += 7.5
  }

  function tRow(cells: string[], widths: number[], even: boolean, startX = ML, aligns?: string[], highlight = false) {
    checkPage(12)
    const tw = widths.reduce((s, w) => s + w, 0)
    if (highlight) { setF('#EEF2F8'); doc.rect(startX, y, tw, 7, 'F') }
    else if (even) { setF('#F8FAFC'); doc.rect(startX, y, tw, 7, 'F') }
    setS('#e2e8f0'); doc.setLineWidth(0.2); doc.line(startX, y + 7, startX + tw, y + 7)
    doc.setFontSize(7.5); doc.setFont('helvetica', highlight ? 'bold' : 'normal')
    setC(highlight ? HC : '#1e293b')
    let x = startX
    cells.forEach((c, i) => {
      const align = aligns?.[i] || (i === 0 ? 'left' : 'right')
      const maxW = widths[i] - 4
      const cellLines = doc.splitTextToSize(String(c), maxW)
      t(cellLines[0], align === 'right' ? x + widths[i] - 2 : x + 2, y + 5, { align })
      x += widths[i]
    })
    y += 7
  }

  function tFoot(cells: string[], widths: number[], startX = ML, aligns?: string[]) {
    checkPage(9)
    const tw = widths.reduce((s, w) => s + w, 0)
    setF('#E8EDF5'); doc.rect(startX, y, tw, 8, 'F')
    setF(HC); doc.rect(startX, y, 2.5, 8, 'F')
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setC(HC)
    let x = startX
    cells.forEach((c, i) => {
      const align = aligns?.[i] || (i === 0 ? 'left' : 'right')
      const maxW2 = widths[i] - 4
      const footLines = doc.splitTextToSize(String(c), maxW2)
      t(footLines[0], align === 'right' ? x + widths[i] - 2 : x + 2, y + 5.5, { align })
      x += widths[i]
    })
    y += 11
  }

  // ── Real horizontal bar chart with proportional filled rectangles
  function barChart(items: {label: string; value: number; color: string; highlight?: boolean}[], maxVal: number, objLine?: number) {
    const labelW = 56
    const valW   = 30
    const chartW = W - ML - MR - labelW - valW
    const barH   = 10
    const gap    = 5
    const chartX = ML + labelW
    checkPage(items.length * (barH + gap) + 20)

    // Background track
    items.forEach((item, idx) => {
      const rowY = y + idx * (barH + gap)
      // Zebra background
      if (idx % 2 === 0) { setF('#F8FAFC'); doc.rect(ML, rowY, W - ML - MR, barH + gap - 1, 'F') }
      // Label
      doc.setFontSize(7); doc.setFont('helvetica', item.highlight ? 'bold' : 'normal')
      setC(item.highlight ? HC : GRIS)
      const lLines = doc.splitTextToSize(item.label, labelW - 3)
      t(lLines[0], ML + 2, rowY + barH * 0.65)
      // Bar track (light gray)
      setF('#E8EDF5'); doc.rect(chartX, rowY + 1.5, chartW, barH - 3, 'F')
      // Filled bar — proportional
      const pct    = maxVal > 0 ? Math.min(item.value / maxVal, 1) : 0
      const barLen = Math.max(pct * chartW, 1)
      const [r,g,b] = hexToRgb(item.color); doc.setFillColor(r,g,b)
      doc.rect(chartX, rowY + 1.5, barLen, barH - 3, 'F')
      // Highlight accent stripe
      if (item.highlight) { setF(NARANJA); doc.rect(chartX, rowY + 1.5, 2.5, barH - 3, 'F') }
      // Value label — larger for highlighted scenario
      doc.setFontSize(item.highlight ? 9 : 8); doc.setFont('helvetica', 'bold')
      setC(item.highlight ? HC : '#374151')
      t(fmtMXN(item.value) + '/mes', W - MR - 2, rowY + barH * 0.65, { align: 'right' })
    })
    y += items.length * (barH + gap) + 4

    // Objective vertical line
    if (objLine && objLine > 0 && maxVal > 0) {
      const objPct = Math.min(objLine / maxVal, 1)
      const objX   = chartX + objPct * chartW
      const lineTop = y - items.length * (barH + gap) - 4
      setS(ROJO); doc.setLineWidth(0.5)
      doc.setLineDashPattern([2, 1.5], 0)
      doc.line(objX, lineTop, objX, y - 4)
      doc.setLineDashPattern([], 0)
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); setC(ROJO)
      t('Objetivo', objX + 1, lineTop + 4)
      t(fmtMXN(objLine), objX + 1, lineTop + 8)
    }
    y += 4
  }

  // ── Timeline for next steps
  function timeline(steps: {label: string; desc: string; color: string}[]) {
    checkPage(30)
    const stepW = (W - ML - MR) / steps.length
    // Line
    setS('#e2e8f0'); doc.setLineWidth(0.5)
    doc.line(ML + stepW / 2, y + 5, W - MR - stepW / 2, y + 5)
    steps.forEach((step, i) => {
      const cx = ML + i * stepW + stepW / 2
      // Circle
      const [r,g,b] = hexToRgb(step.color)
      doc.setFillColor(r, g, b); doc.circle(cx, y + 5, 3.5, 'F')
      // Label
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setC(step.color)
      t(step.label, cx, y + 13, { align: 'center' })
      // Desc
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setC(GRIS)
      const dLines = doc.splitTextToSize(step.desc, stepW - 4)
      dLines.forEach((dl: string, di: number) => t(dl, cx, y + 18 + di * 4, { align: 'center' }))
    })
    y += 34
  }

  // ══════════════════════════════════════════════════
  // PÁGINA 1 — PORTADA
  // ══════════════════════════════════════════════════

  // Franja del asesor
  setF(HC); doc.rect(0, 0, W, 48, 'F')

  // Logo
  let logoLoaded = false
  const bandH = 48
  const textX = ML  // left-aligned text baseline
  if (logoUrl) {
    try {
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = logoUrl
      await new Promise(res => { img.onload = res; img.onerror = res })
      if (img.complete && img.naturalWidth > 0) {
        // Cap logo size: max height = bandH - 8mm padding, max width = 50mm
        const maxH = Math.min(bandH - 16, 18) // strict cap: 18mm
        const maxW = 40
        const aspect = img.naturalWidth / Math.max(img.naturalHeight, 1)
        const lh = Math.min(LSIZ, maxH)
        const lw = Math.min(lh * aspect, maxW)
        const ly = (bandH - lh) / 2
        doc.addImage(img as any, 'PNG', ML, ly, lw, lh)
        logoLoaded = true
        // Text to the right of logo, vertically centered in band
        const txBase = bandH / 2 - 5
        doc.setFontSize(18); doc.setFont('helvetica', 'bold'); setC('#ffffff')
        const rsLines = doc.splitTextToSize(razonSocial || '', W - ML - MR - lw - 10)
        t(rsLines[0], ML + lw + 6, txBase)
        doc.setFontSize(12); doc.setFont('helvetica', 'normal'); setC('#ffffff')
        t(HTIT, ML + lw + 6, txBase + 9)
      }
    } catch (_) {}
  }
  if (!logoLoaded) {
    const txBase = bandH / 2 - 5
    doc.setFontSize(20); doc.setFont('helvetica', 'bold'); setC('#ffffff')
    const rsLines2 = doc.splitTextToSize(razonSocial || 'KSE Pensiones', W - ML - MR - 60)
    t(rsLines2[0], textX, txBase)
    doc.setFontSize(13); doc.setFont('helvetica', 'normal'); setC('#ffffff')
    t(HTIT, textX, txBase + 10)
  }
  // Date + asesor — right aligned, vertically centered
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); setC('rgba(255,255,255,0.7)')
  t(new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }), W - MR, bandH / 2 - 4, { align: 'right' })
  if (asesorNombre) t('Asesor: ' + asesorNombre, W - MR, bandH / 2 + 4, { align: 'right' })

  // BORRADOR diagonal watermark
  if (esBorrador) {
    doc.saveGraphicsState()
    doc.setGState(new (doc as any).GState({ opacity: 0.08 }))
    doc.setFontSize(52); doc.setFont('helvetica', 'bold'); setC(ROJO)
    t('BORRADOR', W / 2, H / 2, { align: 'center', angle: 35 })
    doc.restoreGraphicsState()
  }

  // Título del diagnóstico
  y = 60
  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); setC(HC)
  t('DIAGNÓSTICO PENSIONAL', W / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); setC(GRIS)
  t('Proyecto de optimización de pensión IMSS — Ley 73', W / 2, y, { align: 'center' })

  // Línea naranja
  y += 7; setF(NARANJA); doc.rect(ML, y, W - ML - MR, 1.2, 'F'); y += 7

  // Nombre del trabajador
  const trabajador = datos.nombre_trabajador || datos.nombre || '—'
  const cliente    = datos.nombre && datos.nombre !== trabajador ? datos.nombre : null
  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); setC('#1e293b')
  t(trabajador, ML, y); y += 7
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setC(GRIS)
  const l1 = [datos.nss ? 'NSS: ' + datos.nss : null, datos.ley === '73' ? 'Ley 73' : datos.ley === '97' ? 'Ley 97' : null, datos.edad_actual ? datos.edad_actual + ' años' : null].filter(Boolean).join('  ·  ')
  const l1w = doc.splitTextToSize(l1, W - ML - MR)
  l1w.forEach((ll: string) => { t(ll, ML, y); y += 5 })
  const l2 = [datos.semanas_totales ? datos.semanas_totales.toLocaleString() + ' semanas cotizadas' : null, datos.fecha_calculo ? 'Ult. cotizacion: ' + datos.fecha_calculo : null, cliente ? 'Solicitante: ' + cliente : null].filter(Boolean).join('  ·  ')
  const l2w = doc.splitTextToSize(l2, W - ML - MR)
  l2w.forEach((ll: string) => { t(ll, ML, y); y += 5 })
  y += 4

  // 4 KPI cards
  const escBase = escenarios[0]
  const kpiPortada = [
    { label: 'Pensión sin acción', value: fmtMXN(escBase?.pension_mensual || 0) + '/mes', color: GRIS },
    { label: 'Pensión con estrategia', value: fmtMXN(escSel?.pension_mensual || 0) + '/mes', color: HC },
    { label: 'Incremento mensual', value: escSel?.incremento_vs_base > 0 ? '+' + fmtMXN(escSel.incremento_vs_base) : '—', color: VERDE },
    { label: 'Inversión requerida', value: fmtMXN(escSel?.costo_total || 0), color: NARANJA },
  ]
  const kW = (W - ML - MR) / 4
  kpiPortada.forEach((k, i) => {
    const x = ML + i * kW
    setF(i === 1 ? '#EEF2F8' : '#F4F6FB'); setS('#e2e8f0'); doc.setLineWidth(i === 1 ? 0 : 0.3)
    doc.rect(x, y, kW - 2, 22, 'FD')
    if (i === 1) { setF(NARANJA); doc.rect(x, y, 2, 22, 'F') }
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setC('#94a3b8')
    const lbl = doc.splitTextToSize(k.label.toUpperCase(), kW - 8)
    lbl.forEach((ll: string, li: number) => t(ll, x + 5, y + 5 + li * 3.5))
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold')
    const [r,g,b] = hexToRgb(k.color); doc.setTextColor(r,g,b)
    t(k.value, x + 5, y + 18)
  })
  y += 26

  // Estrategia recomendada chip
  if (escSel && escSel.mod40_meses > 0) {
    setF('#EEF2F8'); doc.rect(ML, y, W - ML - MR, 16, 'F')
    setF(HC); doc.rect(ML, y, 2.5, 16, 'F')
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setC(HC)
    t('ESTRATEGIA RECOMENDADA: ' + escSel.label, ML + 6, y + 6)
    doc.setFont('helvetica', 'normal'); setC('#374151')
    t(`${(escSel.mod40_umas || 0).toFixed(1)} UMAs · ${escSel.mod40_meses || 0} meses · Costo: ${fmtMXN(escSel.costo_mensual_mod40 || 0)}/mes · ROI: ${escSel.roi_meses || '—'} meses`, ML + 6, y + 12)
    y += 20
  }

  // ── Mini timeline en portada — 4 hitos en orden cronológico real
  {
    const edadA  = datos.edad_actual || 60
    const mMod   = escSel?.mod40_meses || 0
    const edadFinMod = Math.round(edadA + mMod / 12)
    // Build steps: always Hoy + fin Mod40 + cesantía(62) + vejez(65)
    // Avoid duplicate or out-of-order ages
    // Build 4 chronological hitos — edadFinMod is when Mod40 payments end
    const hitos: {lbl: string; desc: string; color: string; age: number}[] = [
      { lbl: 'Hoy (' + edadA + ' años)', desc: 'Verificar semanas IMSS', color: NARANJA, age: edadA },
      { lbl: edadFinMod + ' años', desc: 'Alta Mod 40 ' + fmtMXN(escSel?.costo_mensual_mod40 || 0) + '/mes', color: HC, age: edadFinMod },
      { lbl: '65 años', desc: 'Pension vejez ' + fmtMXN(escSel?.pension_mensual || 0) + '/mes', color: VERDE, age: 65 },
    ]
    // Insert cesantia at 60 only if it falls between Mod40 end and 65
    if (edadFinMod < 60) hitos.splice(2, 0, { lbl: '60 años', desc: 'Solicitar cesantía IMSS', color: HC, age: 60 })
    const tlSteps = hitos.sort((a,b) => a.age - b.age).filter((s,i,arr) => i===0 || s.age > arr[i-1].age).map(({lbl,desc,color}) => ({lbl,desc,color}))
    const tlY = y + 6
    const stepW2 = (W - ML - MR) / tlSteps.length
    // Line
    setS('#e2e8f0'); doc.setLineWidth(0.4)
    doc.line(ML + stepW2 / 2, tlY + 4, W - MR - stepW2 / 2, tlY + 4)
    tlSteps.forEach((s, i) => {
      const cx = ML + i * stepW2 + stepW2 / 2
      const [r,g,b] = hexToRgb(s.color); doc.setFillColor(r,g,b)
      doc.circle(cx, tlY + 4, 3, 'F')
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setC(s.color)
      t(s.lbl, cx, tlY + 11, { align: 'center' })
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setC(GRIS)
      t(s.desc, cx, tlY + 16, { align: 'center' })
    })
    y += 28
  }

  // Alerta conservación de derechos en portada
  const semanasConservPortada = Math.floor(datos.semanas_totales / 4)
  const mesesConservPortada   = Math.round(semanasConservPortada / 4.33)
  const mesesDesdePortada     = datos.fecha_calculo ? Math.floor((Date.now() - new Date(datos.fecha_calculo).getTime()) / (30 * 86400000)) : -1
  const mesesRestPortada      = mesesDesdePortada >= 0 ? Math.max(0, mesesConservPortada - mesesDesdePortada) : null
  const vigPortada            = mesesRestPortada !== null ? mesesRestPortada > 0 : null
  if (vigPortada === false) {
    y += 4
    alertChip('⚠ Conservación de derechos VENCIDA — se requiere reactivación antes del trámite', 'danger')
  } else if (vigPortada === true && mesesRestPortada! < 12) {
    y += 4
    alertChip('⚠ Conservación de derechos vigente pero próxima a vencer — ' + mesesRestPortada + ' meses restantes', 'warning')
  }

  // Footer portada
  y = H - 24
  setS('#e2e8f0'); doc.setLineWidth(0.3); doc.line(ML, y, W - MR, y); y += 5
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setC('#94a3b8')
  t('Documento confidencial elaborado exclusivamente para el trabajador indicado. Los cálculos son estimaciones basadas en la Ley del Seguro Social 1973.', ML, y)
  y += 4
  if (esBorrador) { doc.setFont('helvetica', 'bold'); setC('#b45309'); t('BORRADOR — Pendiente de autorización oficial. No compartir con el cliente.', ML, y) }

  // ══════════════════════════════════════════════════
  // PÁGINA 2 — RESUMEN EJECUTIVO (visual, no duplicar sección 7)
  // ══════════════════════════════════════════════════
  doc.addPage(); y = 22; addHeader()
  sectionTitle('0', 'RESUMEN EJECUTIVO')

  // 3 highlight cards — situación, oportunidad, recomendación
  const resCards = [
    { icon: '●', title: 'Situación actual', color: GRIS, bg: '#F8FAFC',
      body: `${datos.nombre_trabajador || datos.nombre || 'El trabajador'} tiene ${datos.semanas_totales || 0} semanas cotizadas bajo Ley ${datos.ley || '73'}. Sin acción, la pensión estimada sería de ${fmtMXN(escBase?.pension_mensual || 0)}/mes.` },
    { icon: '▲', title: 'Oportunidad detectada', color: VERDE, bg: '#f0fdf4',
      body: `Con la estrategia recomendada (${escSel.label}), la pensión puede llegar a ${fmtMXN(escSel.pension_mensual || 0)}/mes — un incremento de ${fmtMXN(escSel.incremento_vs_base || 0)}/mes. La inversión se recupera en ${escSel.roi_meses || '—'} meses de pensión.` },
    { icon: '✓', title: 'Recomendación', color: HC, bg: '#EEF2F8',
      body: `Iniciar Modalidad 40 a ${(escSel.mod40_umas || 0).toFixed(1)} UMAs por ${escSel.mod40_meses || 0} meses. Costo: ${fmtMXN(escSel.costo_mensual_mod40 || 0)}/mes. Inversión total: ${fmtMXN(escSel.costo_total || 0)}.` },
  ]
  // KPI row above bullets
  kpiRow([
    { label: 'Pensión sin acción', value: fmtMXN(escBase?.pension_mensual || 0) + '/mes', color: GRIS },
    { label: 'Pensión con estrategia', value: fmtMXN(escSel?.pension_mensual || 0) + '/mes', color: HC },
    { label: '% del objetivo', value: ingresoObjetivo && ingresoObjetivo > 0 ? Math.round(escSel.pension_mensual / ingresoObjetivo * 100) + '%' : '—', color: VERDE },
    { label: 'Recuperación inversión', value: (escSel?.roi_meses || 0) + ' meses', color: NARANJA },
  ])

  resCards.forEach((card) => {
    checkPage(30)
    const [rb,gb,bb] = hexToRgb(card.bg)
    doc.setFillColor(rb,gb,bb); doc.rect(ML, y, W - ML - MR, 28, 'F')
    const [ra,ga,ba] = hexToRgb(card.color); doc.setFillColor(ra,ga,ba); doc.rect(ML, y, 3, 28, 'F')
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); setC(card.color)
    t(card.icon + '  ' + card.title, ML + 7, y + 8)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setC('#374151')
    const bLines = doc.splitTextToSize(card.body, W - ML - MR - 14)
    bLines.forEach((l: string, li: number) => t(l, ML + 7, y + 16 + li * 4.5))
    y += 32
  })

  // Conservacion alert at end of sec 0
  {
    const scP = Math.floor(datos.semanas_totales / 4)
    const mcP = Math.round(scP / 4.33)
    const mdP = datos.fecha_calculo ? Math.floor((Date.now() - new Date(datos.fecha_calculo).getTime()) / (30 * 86400000)) : -1
    const mrP = mdP >= 0 ? Math.max(0, mcP - mdP) : null
    if (mrP !== null && mrP === 0) alertChip('⚠ Conservación de derechos VENCIDA — se requiere reactivación antes de tramitar la pensión', 'danger')
    else if (mrP !== null && mrP < 12) alertChip('⚠ Conservación de derechos vigente pero próxima a vencer — ' + mrP + ' meses restantes', 'warning')
  }

  // ══════════════════════════════════════════════════
  // SECCIÓN 1 — DATOS DEL TRABAJADOR
  // ══════════════════════════════════════════════════
  checkPage(50)
  sectionTitle('1', 'DATOS DEL TRABAJADOR')
  kpiRow([
    { label: 'Nombre', value: (datos.nombre_trabajador || datos.nombre || '—').substring(0, 22) },
    { label: 'NSS', value: datos.nss || '—' },
    { label: 'Edad actual', value: (datos.edad_actual || '—') + ' años' },
    { label: 'Régimen', value: datos.ley === '73' ? 'Ley 73' : datos.ley === '97' ? 'Ley 97' : '—', color: datos.ley === '73' ? HC : VERDE },
  ])
  kpiRow([
    { label: 'Semanas cotizadas', value: (datos.semanas_totales || 0).toLocaleString(), color: (datos.semanas_totales || 0) >= 500 ? VERDE : ROJO },
    { label: 'Fecha de nacimiento', value: datos.fecha_nacimiento || '—' },
    { label: 'Última cotización', value: datos.fecha_calculo || 'No registrada', color: datos.fecha_calculo ? HC : GRIS },
    { label: 'Asignaciones familiares', value: '+' + ((datos.tiene_conyuge ? 15 : 0) + (datos.num_hijos || 0) * 10) + '%', color: NARANJA },
  ])
  if ((datos.semanas_totales || 0) >= 500) {
    alertChip('✓ Semanas suficientes para pensionarse (' + (datos.semanas_totales || 0) + ' de 500 requeridas)', 'success')
  } else {
    alertChip('⚠ Semanas insuficientes (' + (datos.semanas_totales || 0) + ' de 500 requeridas) — no es posible pensionarse aún', 'danger')
  }

  // ══════════════════════════════════════════════════
  // SECCIÓN 2 — CONSERVACIÓN DE DERECHOS
  // ══════════════════════════════════════════════════
  checkPage(50)
  sectionTitle('2', 'CONSERVACIÓN DE DERECHOS', 'Art. 183 Ley del Seguro Social 1973')
  const semConserv  = Math.floor(datos.semanas_totales / 4)
  const mesConserv  = Math.round(semConserv / 4.33)
  const mDesde      = datos.fecha_calculo ? Math.floor((Date.now() - new Date(datos.fecha_calculo).getTime()) / (30 * 86400000)) : -1
  const mRestantes  = mDesde >= 0 ? Math.max(0, mesConserv - mDesde) : null
  const vigente     = mRestantes !== null ? mRestantes > 0 : null
  kpiRow([
    { label: 'Semanas de conservación', value: semConserv + ' semanas', color: HC },
    { label: 'Período de conservación', value: (semConserv / 4.33 / 12).toFixed(1) + ' años', color: HC },
    { label: 'Estado actual', value: vigente === null ? 'Sin fecha de baja' : vigente ? 'VIGENTE ✓' : 'VENCIDO ✗', color: vigente === null ? GRIS : vigente ? VERDE : ROJO },
    { label: 'Meses restantes', value: mRestantes !== null ? (vigente ? mRestantes + ' meses' : 'Requiere reactivación') : 'Capturar fecha de baja', color: vigente ? VERDE : ROJO },
  ])
  if (vigente === false) {
    const aniosSin = mDesde / 12
    const accion   = aniosSin <= 3 ? 'Reconocimiento inmediato al reingresar (Art. 150)' : aniosSin <= 6 ? 'Cotizar 26 semanas nuevas para recuperar derechos (Art. 151)' : 'Cotizar 52 semanas nuevas para recuperar derechos (Art. 151)'
    alertChip('⚠ Período de conservación vencido — ' + accion, 'danger')
  } else if (vigente === true) {
    alertChip('✓ Conservación de derechos vigente — ' + mRestantes + ' meses restantes para tramitar la pensión', 'success')
  }
  bodyText('La conservación de derechos equivale a 1/4 de las semanas cotizadas (Art. 183 LSS). Con ' + datos.semanas_totales + ' semanas cotizadas, el período es de ' + semConserv + ' semanas (~' + (semConserv / 4.33 / 12).toFixed(1) + ' años). Este cálculo es una estimación — el resultado definitivo lo determina el IMSS.', 0)

  // ══════════════════════════════════════════════════
  // SECCIÓN 3 — SALARIO PROMEDIO 250 SEMANAS
  // ══════════════════════════════════════════════════
  newPage()
  sectionTitle('3', 'SALARIO PROMEDIO — ÚLTIMAS 250 SEMANAS COTIZADAS', 'Art. 167 LSS 1973')
  bodyText('La pensión bajo Ley 73 se calcula sobre el promedio del Salario Diario Integrado (SDI) de las últimas 250 semanas cotizadas (~5 años). Este promedio es la base de todos los escenarios calculados en este diagnóstico.')
  kpiRow([
    { label: 'SDI promedio 250 sem.', value: fmtMXN2(sdiPromedio), color: NARANJA },
    { label: 'SDI mensual equivalente', value: fmtMXN(sdiPromedio * 30.4) },
    { label: 'Períodos analizados', value: periodos.length.toString() },
    { label: 'Semanas cubiertas', value: periodos.reduce((s: number, p: any) => s + (p.semanas || 0), 0).toString() },
  ])
  if (periodos.length > 0) {
    const ws = [8, 26, 26, 18, 30, 30, 22]
    tHead(['#', 'Inicio', 'Fin', 'Sem.', 'SDI diario', 'SDI mensual', 'Peso %'], ws)
    periodos.forEach((p: any, i: number) => {
      tRow([(i+1).toString(), p.fecha_inicio || '—', p.fecha_fin || '—', (p.semanas || 0).toString(), fmtMXN2(p.sdi || 0), fmtMXN((p.sdi || 0) * 30.4), (p.peso || 0).toFixed(1) + '%'], ws, i % 2 === 0, ML, ['center','center','center','right','right','right','right'])
    })
    tFoot(['Promedio ponderado', '', '', periodos.reduce((s: number, p: any) => s + (p.semanas || 0), 0).toString(), fmtMXN2(sdiPromedio), fmtMXN(sdiPromedio * 30.4), '100%'], ws, ML, ['left','center','center','right','right','right','right'])
  }

  // ══════════════════════════════════════════════════
  // SECCIÓN 4 — MODALIDAD 40
  // ══════════════════════════════════════════════════
  newPage()
  sectionTitle('4', 'MODALIDAD 40 — ESTRATEGIA DE OPTIMIZACIÓN', 'Art. 218 Ley del Seguro Social 1973')
  bodyText('La Modalidad 40 permite al trabajador continuar cotizando voluntariamente al IMSS sobre un salario mayor al histórico, incrementando el SDI promedio de las últimas 250 semanas y con ello la pensión final. Solo aplica a trabajadores con historial de cotización previa bajo Ley 73.')
  if (escSel && escSel.mod40_meses > 0) {
    kpiRow([
      { label: 'Salario base (UMAs)', value: (escSel.mod40_umas || 0).toFixed(1) + ' UMAs', color: HC },
      { label: 'Período de cotización', value: (escSel.mod40_meses || 0) + ' meses', color: HC },
      { label: 'Costo mensual', value: fmtMXN(escSel.costo_mensual_mod40 || 0), color: NARANJA },
      { label: 'Inversión total', value: fmtMXN(escSel.costo_total || 0), color: NARANJA },
    ])
    kpiRow([
      { label: 'Pensión estimada', value: fmtMXN(escSel.pension_mensual || 0) + '/mes', color: VERDE },
      { label: 'Incremento vs base', value: '+' + fmtMXN(escSel.incremento_vs_base || 0) + '/mes', color: VERDE },
      { label: 'Recuperación de inversión', value: (escSel.roi_meses || 0) + ' meses', color: HC },
      { label: 'Tasa aplicada 2026', value: '14.438%', color: GRIS },
    ])
    // Projection table
    subTitle('Proyección de cotización mensual')
    const wsMod = [16, 38, 32, 32, 32, 30]
    tHead(['Mes', 'SDI cotizado/día', 'Cuota mensual', 'Acumulado', 'Sem. adicionales', '% del plazo'], wsMod)
    const sdiM40  = (escSel.mod40_umas || 0) * 117.31
    const costoM  = escSel.costo_mensual_mod40 || 0
    const showM   = [1, 3, 6, 12, 18, 24, escSel.mod40_meses].filter((m: number, _i: number, a: number[]) => m <= escSel.mod40_meses && a.indexOf(m) === _i)
    showM.forEach((mes: number, i: number) => {
      tRow([mes.toString(), fmtMXN2(sdiM40), fmtMXN(costoM), fmtMXN(costoM * mes), (mes * 4.33).toFixed(1), Math.round(mes / escSel.mod40_meses * 100) + '%'], wsMod, i % 2 === 0, ML, ['center','right','right','right','right','right'], mes === escSel.mod40_meses)
      if (i === 2 && escSel.mod40_meses > 8) {
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setC('#94a3b8')
        t('· · · meses intermedios · · ·', ML + 60, y + 4); y += 7
      }
    })
    tFoot(['Total', '—', fmtMXN(costoM) + '/mes', fmtMXN(escSel.costo_total || 0), (escSel.mod40_meses * 4.33).toFixed(0), '100%'], wsMod, ML, ['left','center','right','right','right','right'])
  }

  // ══════════════════════════════════════════════════
  // SECCIÓN 5 — MODALIDAD 10 (si aplica)
  // ══════════════════════════════════════════════════
  const escM10 = escenarios.find((e: any) => e.id === 'e_m10')
  if (escM10) {
    newPage()
    sectionTitle('5', 'MODALIDAD 10 — INCORPORACIÓN VOLUNTARIA', 'Art. 240 Ley del Seguro Social — Trabajadores independientes')
    bodyText('La Modalidad 10 permite a trabajadores independientes afiliarse al IMSS con cobertura integral, incluyendo servicio médico, guarderías e Infonavit, además de acumular semanas para pensión. Es más cara que Mod 40 pero ofrece beneficios adicionales significativos.')
    const cuotaM40ref = escSel?.costo_mensual_mod40 || 0
    const difM = escM10.costo_mensual_mod40 - cuotaM40ref
    kpiRow([
      { label: 'Cuota mensual (22%)', value: fmtMXN(escM10.costo_mensual_mod40), color: VERDE },
      { label: 'Inversión total', value: fmtMXN(escM10.costo_total), color: NARANJA },
      { label: 'Pensión estimada', value: fmtMXN(escM10.pension_mensual) + '/mes', color: VERDE },
      { label: 'Costo extra vs Mod 40', value: fmtMXN(difM) + '/mes mas cara', color: '#f97316', sub: 'por servicio médico + Infonavit + guarderías' },
    ])
    subTitle('Comparativa Modalidad 10 vs Modalidad 40')
    const wsM10 = [50, 30, 30, 40, 34]
    tHead(['Concepto', 'Modalidad 10', 'Modalidad 40', 'Diferencia', 'Extra'], wsM10)
    const compRows = [
      ['Cuota mensual', fmtMXN(escM10.costo_mensual_mod40), fmtMXN(cuotaM40ref), fmtMXN(difM) + ' mas cara', ''],
      ['Inversión total', fmtMXN(escM10.costo_total), fmtMXN(escSel?.costo_total || 0), '+' + fmtMXN(escM10.costo_total - (escSel?.costo_total || 0)), ''],
      ['Pensión estimada', fmtMXN(escM10.pension_mensual) + '/mes', fmtMXN(escSel?.pension_mensual || 0) + '/mes', '= mismo monto', ''],
      ['Servicio médico IMSS', 'Sí ✓', 'No ✗', '', '✓'],
      ['Guarderías', 'Sí ✓', 'No ✗', '', '✓'],
      ['Aportaciones Infonavit', 'Sí ✓', 'No ✗', '', '✓'],
      ['Requiere historial IMSS', 'No', 'Sí', '', ''],
    ]
    compRows.forEach((row, i) => tRow(row, wsM10, i % 2 === 0, ML, ['left','right','right','right','center']))
    y += 4
    doc.setFontSize(7); doc.setFont('helvetica', 'italic'); setC(GRIS)
    const nota = doc.splitTextToSize('Nota: La tasa del 22% de Modalidad 10 es un estimado. El monto exacto varía por actividad y zona. Verificar en imss.gob.mx/personas-trabajadoras-independientes', W - ML - MR)
    nota.forEach((l: string) => { t(l, ML, y); y += 4 })
  }

  // ══════════════════════════════════════════════════
  // SECCIÓN 6 — COMPARATIVO DE ESCENARIOS + GRÁFICA
  // ══════════════════════════════════════════════════
  newPage()
  const numSec6 = escM10 ? '6' : '5'
  sectionTitle(numSec6, 'COMPARATIVO DE ESCENARIOS DE PENSIÓN')

  // Table
  const wsEsc = [58, 28, 28, 28, 22, 16]
  tHead(['Escenario', 'Pensión/mes', 'Incremento', 'Inversión', 'ROI meses', 'Elegido'], wsEsc)
  escenarios.forEach((esc: any, i: number) => {
    const isElegido = i === escSelIdx || (escSelIdx < 0 && esc.recomendado)
    tRow([esc.label, fmtMXN(esc.pension_mensual), i === 0 ? '—' : '+' + fmtMXN(esc.incremento_vs_base), i === 0 ? '$0' : fmtMXN(esc.costo_total), i === 0 ? '—' : (esc.roi_meses || '—') + ' m', isElegido ? '⭐' : ''], wsEsc, i % 2 === 0, ML, ['left','right','right','right','right','center'], isElegido)
  })
  y += 8

  // Bar chart — real proportional bars
  checkPage(20)
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); setC(HC)
  t('Pensión mensual estimada por escenario', ML, y); y += 7
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setC(GRIS)
  t('Las barras muestran la pensión mensual estimada. La barra marcada con ★ es el escenario recomendado.', ML, y); y += 7
  const maxPension = Math.max(...escenarios.map((e: any) => e.pension_mensual || 0), ingresoObjetivo || 0)
  const barColors  = ['#94a3b8', '#3b82f6', '#eab308', '#f97316', HC, '#7c3aed']
  barChart(
    escenarios.map((esc: any, i: number) => ({
      label: esc.label,
      value: esc.pension_mensual || 0,
      color: barColors[i] || HC,
      highlight: i === escSelIdx || (escSelIdx < 0 && esc.recomendado),
    })),
    maxPension,
    ingresoObjetivo ?? undefined
  )


  

  // ══════════════════════════════════════════════════
  // SECCIÓN 7 — ANÁLISIS EJECUTIVO
  // ══════════════════════════════════════════════════
  if (analisis.length > 0) {
    newPage()
    const numSec7 = escM10 ? '7' : '6'
    sectionTitle(numSec7, 'ANÁLISIS EJECUTIVO DEL PROYECTO DE PENSIÓN')
    // Skip "Próximos pasos" section — it lives in sección 8
    analisis
      .filter((sec: any) => !sec.titulo?.toLowerCase().includes('paso') && !sec.titulo?.toLowerCase().includes('siguiente'))
      .forEach((sec: any) => {
        checkPage(35)
        // Section subtitle with underline
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); setC(HC)
        t(sec.titulo || '', ML, y + 6)
        setS(HC); doc.setLineWidth(0.4)
        doc.line(ML, y + 8, ML + 60, y + 8)
        y += 13
        // Content with better size and line height
        doc.setFontSize(9); doc.setFont('helvetica', 'normal'); setC('#1e293b')
        const rawContent = String(sec?.contenido ?? '')
        const secLines = doc.splitTextToSize(rawContent, W - ML - MR - 6)
        secLines.forEach((l: string) => {
          checkPage(8)
          // Detect lines with key financial data and make them slightly bolder
          const hasAmount = /\$[\d,]+/.test(l) || /\d+\s*meses/.test(l) || /VENCID/.test(l)
          doc.setFont('helvetica', hasAmount ? 'bold' : 'normal')
          setC(hasAmount ? HC : '#1e293b')
          t(l, ML + 2, y)
          y += 5.5
        })
        doc.setFont('helvetica', 'normal'); setC('#1e293b')
        y += 6
      })
  }

  // ══════════════════════════════════════════════════
  // SECCIÓN 8 — PRÓXIMOS PASOS (timeline)
  // ══════════════════════════════════════════════════
  checkPage(60)
  const numSec8 = escM10 ? '8' : analisis.length > 0 ? '7' : '6'
  sectionTitle(numSec8, 'PRÓXIMOS PASOS')

  // Build 4 chronological hitos for section 8
  const edadActual   = datos.edad_actual || 60
  const mesesMod40   = escSel?.mod40_meses || 0
  const edadFinMod40 = Math.round(edadActual + mesesMod40 / 12)
  const hitosS8: {label: string; desc: string; color: string; age: number}[] = [
    { label: 'Hoy (' + edadActual + ' años)', desc: 'Verificar semanas en portal IMSS', color: NARANJA, age: edadActual },
    { label: edadFinMod40 + ' años', desc: 'Alta Mod 40: ' + fmtMXN(escSel?.costo_mensual_mod40 || 0) + '/mes', color: HC, age: edadFinMod40 },
    { label: '65 años', desc: 'Pension vejez: ' + fmtMXN(escSel?.pension_mensual || 0) + '/mes', color: VERDE, age: 65 },
  ]
  if (edadFinMod40 < 60) hitosS8.splice(2, 0, { label: '60 años', desc: 'Solicitar cesantía IMSS', color: HC, age: 60 })
  const steps = hitosS8.sort((a,b) => a.age - b.age).filter((s,i,arr) => i===0 || s.age > arr[i-1].age).map(({label,desc,color}) => ({label,desc,color}))

  timeline(steps)

  const lastSec = analisis.find((s: any) => s.titulo?.toLowerCase().includes('paso'))
  if (lastSec) bodyText(lastSec.contenido || '')
  else {
    bodyText('1. Confirmar los datos presentados en este diagnóstico con el asesor.')
    bodyText('2. Tramitar el alta en Modalidad 40 ante el IMSS (subdelegación correspondiente o imss.gob.mx).')
    bodyText('3. Iniciar pagos mensuales de ' + fmtMXN(escSel?.costo_mensual_mod40 || 0) + ' durante ' + mesesMod40 + ' meses.')
    bodyText('4. Al completar el período, iniciar trámite de pensión con la documentación requerida.')
    bodyText('5. Verificar periódicamente el historial de semanas en el portal del IMSS: imss.gob.mx')
  }

  // ══════════════════════════════════════════════════
  // AVISO LEGAL — página propia
  // ══════════════════════════════════════════════════
  newPage()
  sectionTitle('', 'AVISO LEGAL Y LIMITACIONES')
  bodyText('Este diagnóstico pensional fue elaborado con base en la información proporcionada por el trabajador y los datos registrados en la constancia de semanas cotizadas emitida por el Instituto Mexicano del Seguro Social (IMSS).')
  bodyText('Los cálculos se realizan conforme a la Ley del Seguro Social de 1973 y sus reformas vigentes. El monto final de la pensión estará sujeto a la resolución definitiva del IMSS, quien determinará el importe de acuerdo con los salarios y semanas registrados en sus sistemas oficiales.')
  bodyText('Este documento tiene carácter informativo y no constituye una promesa de pago ni un compromiso por parte del IMSS ni del asesor. Los escenarios presentados son proyecciones basadas en los datos disponibles al momento del diagnóstico y pueden variar.')
  bodyText('Se recomienda verificar periódicamente la vigencia y exactitud de la información de semanas cotizadas en el portal oficial del IMSS: imss.gob.mx · Tel. IMSS: 800 623 2323')
  if (esBorrador) {
    y += 6
    alertChip('BORRADOR — Este documento no ha sido autorizado por el asesor. No debe ser entregado al cliente en este estado.', 'warning')
  }
  y += 10
  setS('#e2e8f0'); doc.setLineWidth(0.3); doc.line(ML, y, W - MR, y); y += 6
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setC('#94a3b8')
  t(razonSocial || 'KSE Pensiones', ML, y)
  t('Generado el ' + new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }), W - MR, y, { align: 'right' })

  return doc
}
