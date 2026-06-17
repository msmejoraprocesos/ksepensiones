// PDF Generator for KSE Pensiones - Proyecto de Pensión Completo
import jsPDF from 'jspdf'

const AZUL = '#1B3A6B'
const NARANJA = '#F05B21'
const VERDE = '#2E8B57'

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

export function generarPDFProyecto(params: {
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
}) {
  const { datos, periodos, sdiPromedio, escenarios, escSelIdx, corridaFin, finSel, finPlazo, analisis, logoUrl, razonSocial, asesorNombre, ingresoObjetivo } = params
  const escSel = escenarios[escSelIdx]
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const W = 216, H = 279
  const ML = 18, MR = 18, MT = 18

  let y = MT

  // ── Helpers
  const setColor = (hex: string) => { const [r,g,b] = hexToRgb(hex); doc.setTextColor(r,g,b) }
  const setFill = (hex: string) => { const [r,g,b] = hexToRgb(hex); doc.setFillColor(r,g,b) }
  const setStroke = (hex: string) => { const [r,g,b] = hexToRgb(hex); doc.setDrawColor(r,g,b) }

  const text = (t: string, x: number, yy: number, opts?: any) => doc.text(t, x, yy, opts)
  const newPage = () => { doc.addPage(); y = MT; addHeader() }

  const checkPage = (needed = 30) => { if (y + needed > H - 20) newPage() }

  function addHeader() {
    setFill(AZUL)
    doc.rect(0, 0, W, 14, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    setColor('#ffffff')
    text('KSE Pensiones — Proyecto de Pensión Confidencial', ML, 9)
    setColor('#94a3b8')
    doc.setFont('helvetica', 'normal')
    text(new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }), W - MR, 9, { align: 'right' })
    y = 22
  }

  function sectionHeader(title: string, sub?: string) {
    checkPage(20)
    setFill(AZUL)
    doc.rect(ML, y, W - ML - MR, 8, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    setColor('#ffffff')
    text(title, ML + 3, y + 5.5)
    if (sub) {
      setColor('rgba(255,255,255,0.7)')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      text(sub, W - MR - 3, y + 5.5, { align: 'right' })
    }
    y += 12
  }

  function kpiRow(items: {label: string; value: string; color?: string}[]) {
    checkPage(18)
    const colW = (W - ML - MR) / items.length
    items.forEach((item, i) => {
      const x = ML + i * colW
      setFill('#F4F6FB')
      setStroke('#e2e8f0')
      doc.setLineWidth(0.3)
      doc.rect(x, y, colW - 1, 14, 'FD')
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      setColor('#94a3b8')
      text(item.label.toUpperCase(), x + 3, y + 4.5)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      const [r,g,b] = hexToRgb(item.color || AZUL)
      doc.setTextColor(r,g,b)
      text(item.value, x + 3, y + 11)
    })
    y += 17
  }

  function tableHeader(headers: string[], widths: number[], startX = ML) {
    setFill('#1B3A6B')
    const totalW = widths.reduce((s,w) => s+w, 0)
    doc.rect(startX, y, totalW, 7, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    setColor('#ffffff')
    let x = startX
    headers.forEach((h, i) => {
      text(h, x + widths[i] / 2, y + 4.8, { align: 'center' })
      x += widths[i]
    })
    y += 7
  }

  function tableRow(cells: string[], widths: number[], even: boolean, startX = ML, aligns?: string[]) {
    checkPage(8)
    const totalW = widths.reduce((s,w) => s+w, 0)
    if (even) { setFill('#F8FAFC'); doc.rect(startX, y, totalW, 6.5, 'F') }
    setStroke('#e2e8f0')
    doc.setLineWidth(0.2)
    doc.line(startX, y + 6.5, startX + totalW, y + 6.5)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    setColor('#374151')
    let x = startX
    cells.forEach((c, i) => {
      const align = aligns?.[i] || (i === 0 ? 'left' : 'right')
      const tx = align === 'right' ? x + widths[i] - 2 : x + 2
      text(c, tx, y + 4.5, { align })
      x += widths[i]
    })
    y += 6.5
  }

  function tableFooter(cells: string[], widths: number[], startX = ML, aligns?: string[]) {
    checkPage(8)
    setFill('#EEF2F8')
    const totalW = widths.reduce((s,w) => s+w, 0)
    doc.rect(startX, y, totalW, 7, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    setColor(AZUL)
    let x = startX
    cells.forEach((c, i) => {
      const align = aligns?.[i] || (i === 0 ? 'left' : 'right')
      const tx = align === 'right' ? x + widths[i] - 2 : x + 2
      text(c, tx, y + 5, { align })
      x += widths[i]
    })
    y += 10
  }

  // ══════════════════════════════════════════════════
  // PÁGINA 1: PORTADA
  // ══════════════════════════════════════════════════
  setFill(AZUL)
  doc.rect(0, 0, W, 80, 'F')

  // Logo / Razón social del asesor
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  setColor('#ffffff')
  text(razonSocial || 'KSE Pensiones', W / 2, 35, { align: 'center' })
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  setColor('rgba(255,255,255,0.7)')
  text('Consultoría Pensional Especializada', W / 2, 44, { align: 'center' })

  // Título del documento
  y = 95
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  setColor(AZUL)
  text('PROYECTO DE PENSIÓN', W / 2, y, { align: 'center' })
  text('CON MODALIDAD 40', W / 2, y + 10, { align: 'center' })

  y += 25
  setFill(NARANJA)
  doc.rect(ML, y, W - ML - MR, 0.5, 'F')
  y += 8

  // Datos del trabajador en portada
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  setColor('#1e293b')
  text(datos.nombre || 'Trabajador', W / 2, y, { align: 'center' })
  y += 7
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  setColor('#64748b')
  text(`NSS: ${datos.nss || '—'}  ·  ${datos.ley === '73' ? 'Régimen Ley 73 (pre-1997)' : datos.ley === '97' ? 'Régimen Ley 97 (post-1997)' : 'Régimen por determinar'}`, W / 2, y, { align: 'center' })
  y += 6
  text(`${datos.semanas_totales.toLocaleString()} semanas cotizadas  ·  Edad: ${datos.edad_actual} años`, W / 2, y, { align: 'center' })

  y += 20
  // Resumen de la propuesta en portada
  const items = [
    { label: 'Pensión sin Mod 40', value: fmtMXN(escenarios[0]?.pension_mensual || 0) + '/mes', color: '#94a3b8' },
    { label: 'Pensión con Mod 40', value: fmtMXN(escSel?.pension_mensual || 0) + '/mes', color: AZUL },
    { label: 'Incremento mensual', value: '+' + fmtMXN(escSel?.incremento_vs_base || 0), color: VERDE },
    { label: 'Punto de equilibrio', value: (escSel?.roi_meses || 0) + ' meses', color: NARANJA },
  ]
  const colW2 = (W - ML - MR) / 4
  items.forEach((item, i) => {
    const x = ML + i * colW2
    setFill(i === 1 ? '#EEF2F8' : '#F4F6FB')
    setStroke('#e2e8f0')
    doc.setLineWidth(0.3)
    doc.rect(x, y, colW2 - 2, 22, 'FD')
    if (i === 1) { setFill(NARANJA); doc.rect(x, y, 2, 22, 'F') }
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    setColor('#94a3b8')
    text(item.label.toUpperCase(), x + 5, y + 6)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    const [r,g,b] = hexToRgb(item.color)
    doc.setTextColor(r,g,b)
    text(item.value, x + 5, y + 16)
  })

  y += 30
  // Footer portada
  setColor('#94a3b8')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  text(`Elaborado por: ${asesorNombre || razonSocial || 'Asesor KSE'}`, ML, H - 25)
  text(`Fecha: ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}`, W - MR, H - 25, { align: 'right' })
  text('Este documento es confidencial y fue elaborado exclusivamente para el trabajador indicado.', W / 2, H - 18, { align: 'center' })
  doc.setFontSize(7)
  text('KSE Pensiones · Consultoría Pensional Especializada · Información basada en Ley del Seguro Social 1973', W / 2, H - 13, { align: 'center' })

  // ══════════════════════════════════════════════════
  // PÁGINA 2: DATOS GENERALES + SALARIO 250 SEMANAS
  // ══════════════════════════════════════════════════
  doc.addPage()
  addHeader()

  sectionHeader('1. DATOS GENERALES DEL TRABAJADOR')
  kpiRow([
    { label: 'Nombre', value: datos.nombre || '—' },
    { label: 'NSS', value: datos.nss || '—' },
    { label: 'Edad actual', value: `${datos.edad_actual} años` },
    { label: 'Régimen', value: datos.ley === '73' ? 'Ley 73' : 'Ley 97' },
  ])
  kpiRow([
    { label: 'Semanas cotizadas', value: datos.semanas_totales.toLocaleString(), color: datos.semanas_totales >= 500 ? VERDE : '#ef4444' },
    { label: 'Fecha de nacimiento', value: datos.fecha_nacimiento || '—' },
    { label: 'Asignaciones familiares', value: `+${(datos.tiene_conyuge ? 15 : 0) + datos.num_hijos * 10}%` },
    { label: 'Estado', value: datos.semanas_totales >= 500 ? 'Apto para pensionarse' : 'Semanas insuficientes', color: datos.semanas_totales >= 500 ? VERDE : '#ef4444' },
  ])

  // Conservacion de derechos
  y += 2
  sectionHeader('2. CONSERVACIÓN DE DERECHOS', 'Art. 183 Ley del Seguro Social 1973')
  const semanasConserv = Math.floor(datos.semanas_totales / 4)
  const mesesConserv = Math.round(semanasConserv / 4.33)
  const mesesDesde = datos.fecha_calculo ? Math.floor((Date.now() - new Date(datos.fecha_calculo).getTime()) / (30 * 86400000)) : 0
  const mesesRestantes = Math.max(0, mesesConserv - mesesDesde)
  const vigente = mesesRestantes > 0
  kpiRow([
    { label: 'Semanas de conservación', value: semanasConserv + ' sem', color: AZUL },
    { label: 'Período de conservación', value: (semanasConserv / 4.33 / 12).toFixed(1) + ' años', color: AZUL },
    { label: 'Estado', value: vigente ? 'VIGENTE ✓' : 'VENCIDO ✗', color: vigente ? VERDE : '#ef4444' },
    { label: 'Meses restantes', value: vigente ? mesesRestantes + ' meses' : 'Requiere reactivación', color: vigente ? VERDE : '#ef4444' },
  ])
  if (!vigente) {
    const aniosSin = mesesDesde / 12
    const accion = aniosSin <= 3 ? 'Reconocimiento inmediato al reingresar' : aniosSin <= 6 ? 'Requiere 26 semanas nuevas (Art. 151)' : 'Requiere 52 semanas nuevas (Art. 151)'
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    setColor('#991b1b')
    text('⚠ Para reactivar: ' + accion, ML, y)
    y += 7
  }

  y += 2
  sectionHeader('3. SALARIO PROMEDIO — ÚLTIMAS 250 SEMANAS COTIZADAS', 'Art. 167 Ley del Seguro Social 1973')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  setColor('#64748b')
  const textoBases = doc.splitTextToSize('La pensión se calcula sobre el promedio del Salario Diario Integrado (SDI) de las últimas 250 semanas cotizadas (~5 años), no sobre el salario actual. Este cálculo garantiza que la base sea representativa del historial salarial del trabajador.', W - ML - MR)
  doc.text(textoBases, ML, y)
  y += textoBases.length * 4 + 4

  kpiRow([
    { label: 'SDI promedio 250 sem.', value: fmtMXN2(sdiPromedio), color: NARANJA },
    { label: 'SDI mensual equiv.', value: fmtMXN(sdiPromedio * 30.4) },
    { label: 'Períodos analizados', value: periodos.length.toString() },
    { label: 'Semanas cubiertas', value: periodos.reduce((s: number, p: any) => s + p.semanas, 0).toString() },
  ])

  if (periodos.length > 0) {
    const ws = [30, 35, 35, 22, 32, 32, 24]
    tableHeader(['#', 'Fecha inicio', 'Fecha fin', 'Semanas', 'SDI diario', 'SDI mensual', 'Peso'], ws)
    periodos.forEach((p: any, i: number) => {
      checkPage(8)
      tableRow([
        (i+1).toString(),
        p.fecha_inicio || '—',
        p.fecha_fin || '—',
        p.semanas.toString(),
        fmtMXN2(p.sdi),
        fmtMXN(p.sdi * 30.4),
        p.peso.toFixed(1) + '%'
      ], ws, i % 2 === 0, ML, ['center', 'center', 'center', 'right', 'right', 'right', 'right'])
    })
    tableFooter(['Promedio ponderado', '', '', periodos.reduce((s: number, p: any) => s+p.semanas, 0).toString(), fmtMXN2(sdiPromedio), fmtMXN(sdiPromedio*30.4), '100%'], ws, ML, ['left','center','center','right','right','right','right'])
  }

  // ══════════════════════════════════════════════════
  // PÁGINA 3: MODALIDAD 40 + ESCENARIOS
  // ══════════════════════════════════════════════════
  checkPage(40)
  sectionHeader('4. MODALIDAD 40 — ESTRATEGIA DE OPTIMIZACIÓN', 'Art. 218 Ley del Seguro Social 1973')

  if (escSel) {
    kpiRow([
      { label: 'Salario Mod 40 (UMAs)', value: escSel.mod40_umas.toFixed(1), color: AZUL },
      { label: 'Período cotización', value: `${escSel.mod40_meses} meses`, color: AZUL },
      { label: 'Costo mensual', value: fmtMXN(escSel.costo_mensual_mod40), color: NARANJA },
      { label: 'Inversión total', value: fmtMXN(escSel.inversion_total), color: NARANJA },
    ])

    // Tabla de cotización Mod 40
    const wsMod = [18, 42, 32, 32, 36]
    tableHeader(['Mes', 'SDI cotizado (diario)', 'Cuota mensual', 'Acumulado', 'Semanas Mod 40'], wsMod)
    const sdiMod40 = escSel.mod40_umas * 117.31
    const costoMes = escSel.costo_mensual_mod40
    const showM = [1,2,3,6,12,18,24,escSel.mod40_meses].filter((m: number, i: number, a: number[]) => m <= escSel.mod40_meses && a.indexOf(m) === i)
    showM.forEach((mes: number, i: number) => {
      checkPage(8)
      tableRow([
        mes.toString(),
        fmtMXN2(sdiMod40),
        fmtMXN(costoMes),
        fmtMXN(costoMes * mes),
        (mes * 4.33).toFixed(1)
      ], wsMod, i % 2 === 0, ML, ['center','right','right','right','right'])
      if (mes === 3 && escSel.mod40_meses > 6) {
        checkPage(6)
        setColor('#94a3b8')
        doc.setFontSize(7)
        text('  ···  meses intermedios  ···', ML + 40, y + 3)
        y += 6
      }
    })
    tableFooter(['Total', '—', fmtMXN(costoMes)+'/mes', fmtMXN(escSel.inversion_total), (escSel.mod40_meses * 4.33).toFixed(0)], wsMod, ML, ['left','center','right','right','right'])
  }

  // ══════════════════════════════════════════════════
  // MODALIDAD 10 (si aplica)
  // ══════════════════════════════════════════════════
  const escM10 = escenarios.find((e: any) => e.id === 'e_m10')
  if (escM10) {
    checkPage(50)
    sectionHeader('4. MODALIDAD 10 — INCORPORACIÓN VOLUNTARIA', 'Art. 240 Ley del Seguro Social — Para trabajadores independientes')

    kpiRow([
      { label: 'Salario base (UMAs)', value: (escM10.mod40_umas || 0).toFixed(1), color: VERDE },
      { label: 'Período', value: `${escM10.mod40_meses} meses`, color: VERDE },
      { label: 'Cuota mensual (22%)', value: fmtMXN(escM10.costo_mensual_mod40), color: NARANJA },
      { label: 'Inversión total', value: fmtMXN(escM10.inversion_total), color: NARANJA },
    ])

    // Diferencia vs Mod40
    const cuotaM40ref = escSel ? escSel.costo_mensual_mod40 : 0
    const difMensual = escM10.costo_mensual_mod40 - cuotaM40ref
    kpiRow([
      { label: 'Pensión estimada', value: fmtMXN(escM10.pension_mensual) + '/mes', color: VERDE },
      { label: 'Diferencia vs Mod 40', value: '+' + fmtMXN(difMensual) + '/mes', color: '#f97316' },
      { label: 'Cobertura adicional', value: 'Médica + Infonavit + Guarderías', color: AZUL },
      { label: 'Vs objetivo', value: ingresoObjetivo > 0 ? Math.round(escM10.pension_mensual / ingresoObjetivo * 100) + '% del objetivo' : '—' },
    ])

    // Tabla comparativa Mod10 vs Mod40
    const wsM10 = [55, 38, 38, 38, 27]
    tableHeader(['Concepto', 'Modalidad 10', 'Modalidad 40', 'Diferencia', '¿Qué incluye extra?'], wsM10)
    const compRows = [
      ['Cuota mensual', fmtMXN(escM10.costo_mensual_mod40), fmtMXN(cuotaM40ref), '+' + fmtMXN(difMensual), 'Más cara'],
      ['Inversión total', fmtMXN(escM10.inversion_total), fmtMXN(escSel?.inversion_total || 0), '+' + fmtMXN(escM10.inversion_total - (escSel?.inversion_total || 0)), ''],
      ['Pensión estimada', fmtMXN(escM10.pension_mensual) + '/mes', fmtMXN(escSel?.pension_mensual || 0) + '/mes', '≈ igual', ''],
      ['Servicio médico', 'Sí ✓', 'No ✗', '+Beneficio', 'IMSS familiar'],
      ['Infonavit', 'Sí ✓', 'No ✗', '+Beneficio', 'Crédito vivienda'],
      ['Guarderías', 'Sí ✓', 'No ✗', '+Beneficio', 'Hijos hasta 4 años'],
      ['Req. historial IMSS', 'No requerido', 'Sí requerido', '', ''],
    ]
    compRows.forEach((row, i) => {
      checkPage(8)
      tableRow(row, wsM10, i % 2 === 0, ML, ['left','right','right','right','left'])
    })

    y += 4
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'italic')
    setColor('#94a3b8')
    const notaM10 = doc.splitTextToSize('Nota: La tasa de Modalidad 10 (22%) es un estimado. El monto exacto varía según actividad económica y zona geográfica. Verificar en el portal oficial del IMSS.', W - ML - MR)
    doc.text(notaM10, ML, y)
    y += notaM10.length * 4 + 4
  }

  y += 4
  sectionHeader(escM10 ? '5. COMPARATIVO DE ESCENARIOS DE PENSIÓN' : '4. COMPARATIVO DE ESCENARIOS DE PENSIÓN')

  const wsEsc = [55, 32, 32, 28, 28, 25]
  tableHeader(['Escenario', 'Pensión mensual', 'Incremento', 'Inversión', 'ROI meses', 'Recom.'], wsEsc)
  escenarios.forEach((esc: any, i: number) => {
    checkPage(8)
    tableRow([
      esc.label,
      fmtMXN(esc.pension_mensual),
      i === 0 ? '—' : '+' + fmtMXN(esc.incremento_vs_base),
      i === 0 ? '$0' : fmtMXN(esc.inversion_total),
      i === 0 ? '—' : esc.roi_meses + ' m',
      esc.recomendado ? '⭐ Óptimo' : '',
    ], wsEsc, i % 2 === 0, ML, ['left','right','right','right','right','center'])
  })

  // ══════════════════════════════════════════════════
  // PÁGINA 4: FINANCIAMIENTO
  // ══════════════════════════════════════════════════
  if (corridaFin && finSel && escSel) {
    checkPage(50)
    sectionHeader('5. FINANCIAMIENTO MODALIDAD 40', `${finSel.nombre} · ${finSel.tasa_anual}% anual · ${finPlazo} meses`)

    kpiRow([
      { label: 'Capital financiado', value: fmtMXN(escSel.inversion_total) },
      { label: 'Cuota mensual', value: fmtMXN(corridaFin.cuota), color: NARANJA },
      { label: 'Pensión obtenida', value: fmtMXN(escSel.pension_mensual), color: VERDE },
      { label: 'Saldo neto mensual', value: fmtMXN(escSel.pension_mensual - corridaFin.cuota), color: escSel.pension_mensual > corridaFin.cuota ? VERDE : '#ef4444' },
    ])
    kpiRow([
      { label: 'Total a pagar', value: fmtMXN(corridaFin.totalPagado) },
      { label: 'Total intereses', value: fmtMXN(corridaFin.totalPagado - escSel.inversion_total) },
      { label: 'Viabilidad', value: corridaFin.cuota < escSel.pension_mensual ? 'VIABLE ✓' : 'REVISAR ✗', color: corridaFin.cuota < escSel.pension_mensual ? VERDE : '#ef4444' },
      { label: 'Financiera', value: finSel.nombre },
    ])

    const wsAmort = [18, 36, 36, 36, 36, 38]
    tableHeader(['Mes', 'Cuota mensual', 'Capital pagado', 'Interés', 'Capital acum.', 'Saldo'], wsAmort)
    corridaFin.rows.forEach((r: any, i: number) => {
      checkPage(8)
      tableRow([
        r.mes.toString(),
        fmtMXN(r.cuota),
        fmtMXN(r.capital),
        fmtMXN(r.interes),
        fmtMXN(corridaFin.rows.slice(0,i+1).reduce((s: number, rr: any) => s + rr.capital, 0)),
        fmtMXN(r.saldo),
      ], wsAmort, i % 2 === 0, ML, ['center','right','right','right','right','right'])
    })
    tableFooter(['Total', fmtMXN(corridaFin.totalPagado), fmtMXN(escSel.inversion_total), fmtMXN(corridaFin.totalPagado - escSel.inversion_total), '—', '—'], wsAmort, ML, ['left','right','right','right','right','right'])
  }

  // ══════════════════════════════════════════════════
  // PÁGINAS 5+: ANÁLISIS NARRATIVO
  // ══════════════════════════════════════════════════
  if (analisis.length > 0) {
    checkPage(40)
    sectionHeader('7. ANÁLISIS EJECUTIVO DEL PROYECTO DE PENSIÓN')

    analisis.forEach((sec: any) => {
      checkPage(25)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      setColor(AZUL)
      text(sec.titulo, ML, y)
      y += 5

      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      setColor('#374151')
      const lines = doc.splitTextToSize(sec.contenido, W - ML - MR)
      lines.forEach((line: string) => {
        checkPage(6)
        text(line, ML, y)
        y += 4.5
      })
      y += 4
    })
  }

  // ══════════════════════════════════════════════════
  // PÁGINA FINAL: DISCLAIMER
  // ══════════════════════════════════════════════════
  checkPage(60)
  y += 10
  setFill('#F4F6FB')
  doc.rect(ML, y, W - ML - MR, 50, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  setColor(AZUL)
  text('AVISO LEGAL', ML + 5, y + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setColor('#64748b')
  const disclaimer = `Este proyecto de pensión fue elaborado con base en la información proporcionada por el trabajador y los datos registrados en la constancia de semanas cotizadas emitida por el IMSS. Los cálculos se realizan conforme a la Ley del Seguro Social de 1973 y sus reformas vigentes. El monto final de la pensión estará sujeto a la resolución definitiva del Instituto Mexicano del Seguro Social, quien determinará el importe de acuerdo con los salarios registrados en su sistema. Este documento tiene carácter informativo y no constituye una promesa de pago ni un compromiso por parte del IMSS. Se recomienda verificar periódicamente la información en el portal del IMSS.`
  const disclaimerLines = doc.splitTextToSize(disclaimer, W - ML - MR - 10)
  disclaimerLines.forEach((line: string, i: number) => {
    text(line, ML + 5, y + 14 + i * 4)
  })

  return doc
}
