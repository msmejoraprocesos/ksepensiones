import jsPDF from 'jspdf'

interface SysVars {
  UMA_DIARIA: number
  SALARIO_MIN: number
  PMG_MENSUAL: number
  RENDIMIENTO_DEFAULT: number
}

interface Escenario {
  nombre: string
  pension: number
  inversion: number
  brecha: number
  recomendado: boolean
  color: string
}

interface PDFData {
  asesorNombre: string
  asesorEmail: string
  asesorLogoUrl: string | null
  clienteNombre: string
  ley: string
  semanas: number
  salarioDiario: number
  edadRetiro: number
  ingresoDes: number
  aforeSaldo: number
  pprMensual: number
  rendimiento: number
  escenarios: Escenario[]
  sys: SysVars
  fechaNac?: string
}

const AZUL = '#1B3A6B'
const NARANJA = '#F47920'
const VERDE = '#2E8B57'

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function fmtMXN(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generarPDFDiagnostico(data: PDFData): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const H = 297
  const margin = 16

  // ── HEADER ────────────────────────────────────────────────────
  const [ar, ag, ab] = hexToRgb(AZUL)
  doc.setFillColor(ar, ag, ab)
  doc.rect(0, 0, W, 36, 'F')

  // Logo KSE
  const kseLogoB64 = await loadImageAsBase64('/logo-kse.png')
  if (kseLogoB64) {
    doc.addImage(kseLogoB64, 'PNG', margin, 6, 40, 22)
  } else {
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('KSE Pensiones', margin, 22)
  }

  // Título derecha
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Diagnóstico Pensional', W - margin, 16, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }), W - margin, 23, { align: 'right' })

  let y = 44

  // ── INFO ASESOR Y CLIENTE ──────────────────────────────────────
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, y, W - margin * 2, 28, 3, 3, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(margin, y, W - margin * 2, 28, 3, 3, 'S')

  // Logo asesor
  if (data.asesorLogoUrl) {
    const logoB64 = await loadImageAsBase64(data.asesorLogoUrl)
    if (logoB64) doc.addImage(logoB64, 'PNG', margin + 4, y + 4, 20, 20)
  }

  const infoX = data.asesorLogoUrl ? margin + 28 : margin + 6

  doc.setTextColor(100, 116, 139)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('ASESOR', infoX, y + 8)
  doc.setTextColor(27, 58, 107)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(data.asesorNombre || 'Asesor KSE', infoX, y + 14)
  doc.setTextColor(100, 116, 139)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(data.asesorEmail, infoX, y + 20)

  // Cliente
  const clienteX = W / 2 + 8
  doc.setTextColor(100, 116, 139)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('CLIENTE', clienteX, y + 8)
  doc.setTextColor(27, 58, 107)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(data.clienteNombre || 'Cliente', clienteX, y + 14)
  doc.setTextColor(100, 116, 139)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Ley ${data.ley} · ${data.semanas} semanas · Retiro a los ${data.edadRetiro} años`, clienteX, y + 20)

  y += 36

  // ── DATOS DEL DIAGNÓSTICO ──────────────────────────────────────
  doc.setTextColor(ar, ag, ab)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Parámetros del diagnóstico', margin, y)
  y += 6

  const params = [
    ['Régimen', `Ley ${data.ley}`],
    ['Semanas cotizadas', data.semanas.toString()],
    ['Salario diario', `${data.salarioDiario}x SM (${fmtMXN(data.salarioDiario * data.sys.SALARIO_MIN)}/día)`],
    ['Edad de retiro', `${data.edadRetiro} años`],
    ['Ingreso deseado', fmtMXN(data.ingresoDes) + '/mes'],
    ['Saldo AFORE', fmtMXN(data.aforeSaldo)],
    ['Aportación PPR', fmtMXN(data.pprMensual) + '/mes'],
    ['Rendimiento', `${data.rendimiento}% anual`],
  ]

  const colW = (W - margin * 2) / 4
  params.forEach(([label, value], i) => {
    const col = i % 4
    const row = Math.floor(i / 4)
    const x = margin + col * colW
    const rowY = y + row * 14

    doc.setFillColor(col % 2 === 0 ? 248 : 241, col % 2 === 0 ? 250 : 245, col % 2 === 0 ? 252 : 251)
    doc.rect(x, rowY, colW, 13, 'F')

    doc.setTextColor(148, 163, 184)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text(label.toUpperCase(), x + 3, rowY + 5)
    doc.setTextColor(27, 58, 107)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(value, x + 3, rowY + 10)
  })

  y += Math.ceil(params.length / 4) * 14 + 8

  // ── 4 ESCENARIOS ──────────────────────────────────────────────
  doc.setTextColor(ar, ag, ab)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Comparativo de escenarios', margin, y)
  y += 6

  const escW = (W - margin * 2) / 4
  const escH = 52

  data.escenarios.forEach((esc, i) => {
    const x = margin + i * escW
    const [er, eg, eb] = hexToRgb(esc.color)

    // Card background
    doc.setFillColor(esc.recomendado ? er : 248, esc.recomendado ? eg : 250, esc.recomendado ? eb : 252)
    doc.roundedRect(x + 1, y, escW - 2, escH, 2, 2, 'F')
    doc.setDrawColor(esc.recomendado ? er : 226, esc.recomendado ? eg : 232, esc.recomendado ? eb : 240)
    doc.roundedRect(x + 1, y, escW - 2, escH, 2, 2, 'S')

    // Badge recomendado
    if (esc.recomendado) {
      const [nr, ng, nb] = hexToRgb(NARANJA)
      doc.setFillColor(nr, ng, nb)
      doc.roundedRect(x + escW - 24, y - 3, 22, 6, 2, 2, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(5)
      doc.setFont('helvetica', 'bold')
      doc.text('⭐ MEJOR', x + escW - 23, y + 0.5)
    }

    // E number
    doc.setTextColor(esc.recomendado ? 255 : er, esc.recomendado ? 255 : eg, esc.recomendado ? 255 : eb)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text(`E${i + 1}`, x + 4, y + 7)

    // Nombre
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    const textColor = esc.recomendado ? [255, 255, 255] : [er, eg, eb]
    doc.setTextColor(textColor[0], textColor[1], textColor[2])
    doc.text(esc.nombre, x + 4, y + 13, { maxWidth: escW - 8 })

    // Pensión
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(fmtMXN(esc.pension), x + 4, y + 24)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('/mes en retiro', x + 4, y + 29)

    // Barra progreso
    const pct = Math.min(1, esc.pension / data.ingresoDes)
    doc.setFillColor(esc.recomendado ? 255 : 226, esc.recomendado ? 255 : 232, esc.recomendado ? 255 : 240)
    doc.setFillColor(esc.recomendado ? 'rgba(255,255,255,0.2)' as any : 226, 232, 240)
    doc.rect(x + 4, y + 32, escW - 8, 3, 'F')
    doc.setFillColor(esc.recomendado ? 255 : er, esc.recomendado ? 255 : eg, esc.recomendado ? 255 : eb)
    doc.rect(x + 4, y + 32, (escW - 8) * pct, 3, 'F')

    doc.setFontSize(7)
    doc.text(`${Math.round(pct * 100)}% del objetivo`, x + 4, y + 39)

    // Inversión / brecha
    if (esc.inversion > 0) {
      doc.setFontSize(6.5)
      doc.text(`Inversión: ${fmtMXN(esc.inversion)}/mes`, x + 4, y + 44)
    }
    if (esc.brecha > 0) {
      doc.setFontSize(6.5)
      doc.text(`Brecha: ${fmtMXN(esc.brecha)}/mes`, x + 4, y + 49)
    } else {
      doc.setFontSize(6.5)
      doc.text('✓ Objetivo cubierto', x + 4, y + 49)
    }
  })

  y += escH + 12

  // ── VARIABLES DEL SISTEMA ─────────────────────────────────────
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, y, W - margin * 2, 18, 2, 2, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(margin, y, W - margin * 2, 18, 2, 2, 'S')

  doc.setTextColor(100, 116, 139)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('VARIABLES 2026', margin + 4, y + 6)

  const vars = [
    `UMA: $${data.sys.UMA_DIARIA}/día`,
    `SM: $${data.sys.SALARIO_MIN}/día`,
    `PMG: ${fmtMXN(data.sys.PMG_MENSUAL)}/mes`,
    `Rend. default: ${data.sys.RENDIMIENTO_DEFAULT}%`,
  ]
  doc.setTextColor(27, 58, 107)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  vars.forEach((v, i) => {
    doc.text(v, margin + 4 + i * 44, y + 13)
  })

  y += 26

  // ── DISCLAIMER ────────────────────────────────────────────────
  const [nr, ng, nb] = hexToRgb(NARANJA)
  doc.setFillColor(254, 244, 236)
  doc.roundedRect(margin, y, W - margin * 2, 22, 2, 2, 'F')
  doc.setDrawColor(nr, ng, nb)
  doc.roundedRect(margin, y, W - margin * 2, 22, 2, 2, 'S')

  doc.setTextColor(nr, ng, nb)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('⚠️  AVISO LEGAL', margin + 4, y + 6)
  doc.setTextColor(146, 64, 14)
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  const disclaimer = 'Los cálculos son estimaciones orientativas basadas en la Ley del Seguro Social y variables actualizadas a 2026. No constituyen asesoría jurídica ni garantía de prestaciones. Los rendimientos AFORE mostrados son proyecciones, no rendimientos garantizados. Los resultados reales dependen del historial laboral individual, resoluciones del IMSS y cambios legislativos. Verifica tus semanas cotizadas en imss.gob.mx.'
  const lines = doc.splitTextToSize(disclaimer, W - margin * 2 - 8)
  doc.text(lines, margin + 4, y + 12)

  // ── FOOTER ────────────────────────────────────────────────────
  doc.setFillColor(ar, ag, ab)
  doc.rect(0, H - 10, W, 10, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('KSE Pensiones · CRM de Diagnóstico Pensional', margin, H - 4)
  doc.text(`Generado el ${new Date().toLocaleDateString('es-MX')}`, W - margin, H - 4, { align: 'right' })

  // Save
  const filename = `diagnostico-${(data.clienteNombre || 'cliente').replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(filename)
}
