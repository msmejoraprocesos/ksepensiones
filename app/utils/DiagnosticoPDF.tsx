// DiagnosticoPDF.tsx — KSE Pensiones
// Generador de PDF con @react-pdf/renderer
// Reemplaza pdf-generator.ts (jsPDF)

import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet,
  Font, Canvas,
} from '@react-pdf/renderer'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface DatosTrabajador {
  nombre?: string
  nombre_trabajador?: string
  nss?: string
  ley?: string
  edad_actual?: number
  semanas_totales?: number
  fecha_calculo?: string
  fecha_nacimiento?: string
  tiene_conyuge?: boolean
  num_hijos?: number
  num_padres?: number
}

interface Escenario {
  id: string
  label: string
  descripcion?: string
  pension_mensual: number
  inversion_total: number
  costo_mensual_mod40: number
  incremento_vs_base: number
  roi_meses: number
  mod40_meses: number
  mod40_umas: number
  recomendado?: boolean
}

interface Periodo {
  fecha_inicio?: string
  fecha_fin?: string
  semanas?: number
  sdi?: number
  peso?: number
}

interface SeccionAnalisis {
  titulo: string
  contenido: string
}

interface PDFProps {
  datos: DatosTrabajador
  periodos: Periodo[]
  sdiPromedio: number
  escenarios: Escenario[]
  escSelIdx: number
  analisis: SeccionAnalisis[]
  ingresoObjetivo?: number
  logoUrl?: string
  razonSocial?: string
  asesorNombre?: string
  encabezadoColor?: string
  encabezadoTitulo?: string
  esBorrador?: boolean
}

// ─── Colores ─────────────────────────────────────────────────────────────────
const C = {
  azul:    '#1B3A6B',
  naranja: '#F05B21',
  verde:   '#2E8B57',
  rojo:    '#DC2626',
  gris:    '#64748b',
  grisCl:  '#F4F6FB',
  blanco:  '#FFFFFF',
  texto:   '#1e293b',
  textoSm: '#64748b',
  borde:   '#e2e8f0',
  zebraFondo: '#F7F9F7',
  totalFondo: '#E1F5EE',
}

// ─── Formato MXN ─────────────────────────────────────────────────────────────
const mxn = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const mxn2 = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

// ─── Estilos globales ─────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.texto,
    paddingTop: 52,
    paddingBottom: 28,
    paddingHorizontal: 28,
    backgroundColor: C.blanco,
  },
  // Header en cada página interior
  pageHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  pageHeaderText: { color: C.blanco, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  pageHeaderDate: { color: 'rgba(255,255,255,0.8)', fontSize: 7 },
  // Borrador watermark
  watermark: {
    position: 'absolute',
    top: '35%', left: '10%',
    transform: 'rotate(-35deg)',
    fontSize: 72,
    fontFamily: 'Helvetica-Bold',
    color: '#DC2626',
    opacity: 0.06,
  },
  // Section title bar
  sectionBar: {
    backgroundColor: C.azul,
    borderRadius: 3,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionBarText: { color: C.blanco, fontSize: 12, fontFamily: 'Helvetica-Bold' },
  sectionBarSub:  { color: 'rgba(255,255,255,0.8)', fontSize: 7 },
  // KPI card
  kpiCard: {
    flex: 1,
    backgroundColor: C.grisCl,
    borderRadius: 6,
    padding: 8,
    marginHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  kpiLabel: { fontSize: 6.5, color: C.textoSm, textTransform: 'uppercase', textAlign: 'center', marginBottom: 4 },
  kpiValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  kpiRow: { flexDirection: 'row', marginBottom: 8 },
  // Body text
  body: { fontSize: 9, color: C.texto, lineHeight: 1.6, marginBottom: 6 },
  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: C.azul, borderRadius: 3 },
  tableHeaderCell: { color: C.blanco, fontSize: 7, fontFamily: 'Helvetica-Bold', paddingVertical: 5, paddingHorizontal: 4, textAlign: 'center' },
  tableRow: { flexDirection: 'row', borderBottomColor: C.borde, borderBottomWidth: 0.5 },
  tableRowEven: { backgroundColor: C.zebraFondo },
  tableRowTotal: { backgroundColor: C.totalFondo },
  tableCell: { fontSize: 7.5, paddingVertical: 4, paddingHorizontal: 4, color: C.texto },
  tableCellBold: { fontSize: 7.5, paddingVertical: 4, paddingHorizontal: 4, fontFamily: 'Helvetica-Bold', color: C.azul },
  // Alert chip
  chip: { flexDirection: 'row', borderRadius: 5, marginBottom: 8, overflow: 'hidden' },
  chipAccent: { width: 4 },
  chipBody: { flex: 1, paddingVertical: 6, paddingHorizontal: 8 },
  chipText: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  // Subtitle H2
  h2: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.azul, marginBottom: 5, marginTop: 4 },
})

// ─── Componentes reutilizables ────────────────────────────────────────────────

// Header de página interior
const PageHeader = ({ razonSocial, titulo, color, esBorrador }: { razonSocial?: string; titulo?: string; color: string; esBorrador?: boolean }) => (
  <View style={[s.pageHeader, { backgroundColor: color }]} fixed>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={s.pageHeaderText}>{razonSocial || 'KSE Pensiones'}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8 }}>·</Text>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 7 }}>{titulo || 'Diagnóstico Pensional'}</Text>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {esBorrador && <Text style={{ color: '#fbbf24', fontSize: 7, fontFamily: 'Helvetica-Bold' }}>BORRADOR</Text>}
      <Text style={s.pageHeaderDate} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  </View>
)

// Marca de agua BORRADOR
const Watermark = () => (
  <Text style={s.watermark} fixed>BORRADOR</Text>
)

// Barra de sección
const SectionTitle = ({ title, sub, color }: { title: string; sub?: string; color: string }) => (
  <View style={[s.sectionBar, { backgroundColor: color }]}>
    <Text style={s.sectionBarText}>{title}</Text>
    {sub && <Text style={s.sectionBarSub}>{sub}</Text>}
  </View>
)

// Fila de KPI cards
const KpiRow = ({ items, color }: { items: { label: string; value: string; color?: string }[]; color: string }) => (
  <View style={s.kpiRow}>
    {items.map((item, i) => (
      <View key={i} style={[s.kpiCard, i === 0 ? { marginLeft: 0 } : {}, i === items.length - 1 ? { marginRight: 0 } : {}]}>
        <Text style={s.kpiLabel}>{item.label}</Text>
        <Text style={[s.kpiValue, { color: item.color || color }]}>{item.value}</Text>
      </View>
    ))}
  </View>
)

// Chip de alerta
const AlertChip = ({ msg, type = 'danger' }: { msg: string; type?: 'danger' | 'success' | 'warning' }) => {
  const cfg = {
    danger:  { bg: '#fef2f2', acc: C.rojo,    txt: '#991b1b' },
    success: { bg: '#f0fdf4', acc: C.verde,   txt: '#15803d' },
    warning: { bg: '#fffbeb', acc: '#f59e0b', txt: '#92400e' },
  }[type]
  return (
    <View style={[s.chip, { backgroundColor: cfg.bg, marginBottom: 8 }]}>
      <View style={[s.chipAccent, { backgroundColor: cfg.acc }]} />
      <View style={s.chipBody}>
        <Text style={[s.chipText, { color: cfg.txt }]}>{msg}</Text>
      </View>
    </View>
  )
}

// Tabla genérica
const DataTable = ({
  headers, rows, widths, aligns, totalRow,
}: {
  headers: string[]
  rows: string[][]
  widths: number[]
  aligns?: string[]
  totalRow?: string[]
}) => (
  <View style={{ marginBottom: 8 }}>
    <View style={s.tableHeader}>
      {headers.map((h, i) => (
        <Text key={i} style={[s.tableHeaderCell, { width: widths[i], textAlign: (aligns?.[i] || 'center') as any }]}>{h}</Text>
      ))}
    </View>
    {rows.map((row, ri) => (
      <View key={ri} style={[s.tableRow, ri % 2 === 1 ? s.tableRowEven : {}]} wrap={false}>
        {row.map((cell, ci) => (
          <Text key={ci} style={[s.tableCell, { width: widths[ci], textAlign: (aligns?.[ci] || (ci === 0 ? 'left' : 'right')) as any }]}>
            {cell}
          </Text>
        ))}
      </View>
    ))}
    {totalRow && (
      <View style={[s.tableRow, s.tableRowTotal]} wrap={false}>
        {totalRow.map((cell, ci) => (
          <Text key={ci} style={[s.tableCellBold, { width: widths[ci], textAlign: (aligns?.[ci] || (ci === 0 ? 'left' : 'right')) as any }]}>
            {cell}
          </Text>
        ))}
      </View>
    )}
  </View>
)

// Gráfica de barras horizontal (Canvas de react-pdf)
const BarChart = ({ escenarios, escSelIdx, maxVal, objetivo }: {
  escenarios: Escenario[]
  escSelIdx: number
  maxVal: number
  objetivo?: number
}) => {
  const barColors = ['#94a3b8', '#3b82f6', '#eab308', '#f97316', C.azul, '#7c3aed']
  const barH = 14
  const gap  = 6
  const labelW = 120
  const valW   = 65
  const totalH = escenarios.length * (barH + gap) + 20
  const chartW = 420 - labelW - valW

  return (
    <Canvas
      style={{ width: 420, height: totalH, marginBottom: 8 }}
      paint={(painter) => {
        escenarios.forEach((esc, i) => {
          const rowY = i * (barH + gap)
          const isEl = i === escSelIdx || (escSelIdx < 0 && esc.recomendado)
          const pct  = maxVal > 0 ? Math.min(esc.pension_mensual / maxVal, 1) : 0
          const barLen = Math.max(pct * chartW, 2)
          const color  = barColors[i] || C.azul

          // Zebra background
          if (i % 2 === 0) {
            painter.rect(0, rowY, 420, barH + gap - 1).fill('#F8FAFC')
          }

          // Label
          painter
            .fontSize(isEl ? 8 : 7)
            .fillColor(isEl ? C.azul : C.gris)
            .text(esc.label.substring(0, 22), 2, rowY + barH * 0.3, { width: labelW - 4 })

          // Bar track
          painter.rect(labelW, rowY + 2, chartW, barH - 4).fill('#E8EDF5')

          // Filled bar
          painter.rect(labelW, rowY + 2, barLen, barH - 4).fill(color)

          // Highlight stripe
          if (isEl) {
            painter.rect(labelW, rowY + 2, 3, barH - 4).fill(C.naranja)
          }

          // Value
          painter
            .fontSize(isEl ? 9 : 8)
            .fillColor(isEl ? C.azul : '#374151')
            .text(mxn(esc.pension_mensual) + '/mes', labelW + chartW + 4, rowY + barH * 0.3, { width: valW - 4 })
        })

        // Objetivo line
        if (objetivo && objetivo > 0 && maxVal > 0) {
          const objX = labelW + Math.min(objetivo / maxVal, 1) * chartW
          painter
            .moveTo(objX, 0)
            .lineTo(objX, totalH - 20)
            .dash(3, { space: 2 })
            .strokeColor(C.rojo)
            .lineWidth(1)
            .stroke()
          painter.undash()
          painter.fontSize(6.5).fillColor(C.rojo).text('Objetivo', objX + 2, 2)
          painter.fontSize(6.5).fillColor(C.rojo).text(mxn(objetivo), objX + 2, 9)
        }
      }}
    />
  )
}

// Timeline horizontal
const Timeline = ({ steps }: { steps: { label: string; desc: string; color: string }[] }) => {
  const w = 420
  const stepW = w / steps.length

  return (
    <Canvas
      style={{ width: 420, height: 48, marginVertical: 10 }}
      paint={(painter) => {
        // Line
        painter
          .moveTo(stepW / 2, 10)
          .lineTo(w - stepW / 2, 10)
          .strokeColor('#e2e8f0')
          .lineWidth(1)
          .stroke()

        steps.forEach((step, i) => {
          const cx = i * stepW + stepW / 2

          // Circle
          painter.circle(cx, 10, 5).fill(step.color)

          // Label
          painter
            .fontSize(7.5)
            .fillColor(step.color)
            .text(step.label, cx - stepW / 2 + 2, 18, { width: stepW - 4, align: 'center' })

          // Desc
          painter
            .fontSize(6.5)
            .fillColor(C.gris)
            .text(step.desc, cx - stepW / 2 + 2, 29, { width: stepW - 4, align: 'center' })
        })
      }}
    />
  )
}

// ─── PÁGINA 1: PORTADA ────────────────────────────────────────────────────────
const PaginaPortada = ({ datos, escenarios, escSelIdx, ingresoObjetivo, logoUrl, razonSocial, asesorNombre, color, titulo, esBorrador }: PDFProps & { color: string; titulo: string }) => {
  const escBase = escenarios[0]
  const escSel  = escenarios[escSelIdx] ?? escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const trabajador = datos.nombre_trabajador || datos.nombre || '—'
  const cliente    = datos.nombre && datos.nombre !== trabajador ? datos.nombre : null

  // Conservación
  const semC = Math.floor((datos.semanas_totales || 0) / 4)
  const mesC = Math.round(semC / 4.33)
  const mDes = datos.fecha_calculo ? Math.floor((Date.now() - new Date(datos.fecha_calculo).getTime()) / (30 * 86400000)) : -1
  const mRest = mDes >= 0 ? Math.max(0, mesC - mDes) : null
  const venc  = mRest !== null ? mRest === 0 : false

  // Timeline portada
  const edadA = datos.edad_actual || 60
  const mMod  = escSel?.mod40_meses || 0
  const edadFin = Math.round(edadA + mMod / 12)
  const tlSteps = [
    { label: `Hoy (${edadA} años)`, desc: 'Verificar semanas IMSS', color: C.naranja, age: edadA },
    { label: `${edadFin} años`, desc: `Alta Mod 40\n${mxn(escSel?.costo_mensual_mod40 || 0)}/mes`, color: color, age: edadFin },
    { label: '65 años', desc: `Pensión vejez\n${mxn(escSel?.pension_mensual || 0)}/mes`, color: C.verde, age: 65 },
  ]
  if (edadFin < 60) tlSteps.splice(2, 0, { label: '60 años', desc: 'Cesantía IMSS', color: color, age: 60 })
  const stepsOrd = tlSteps.sort((a, b) => a.age - b.age).filter((s, i, arr) => i === 0 || s.age > arr[i-1].age)

  return (
    <Page size="LETTER" style={{ fontFamily: 'Helvetica', backgroundColor: C.blanco }}>
      {esBorrador && <Watermark />}

      {/* Franja del asesor */}
      <View style={{ backgroundColor: color, height: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          {logoUrl && (
            <Image src={logoUrl} style={{ height: 36, maxWidth: 60, objectFit: 'contain' }} />
          )}
          <View>
            <Text style={{ color: C.blanco, fontSize: 18, fontFamily: 'Helvetica-Bold' }}>{razonSocial || 'KSE Pensiones'}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 }}>{titulo}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9 }}>
            {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
          {asesorNombre && <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8, marginTop: 2 }}>Asesor: {asesorNombre}</Text>}
          {esBorrador && <Text style={{ color: '#fbbf24', fontSize: 8, fontFamily: 'Helvetica-Bold', marginTop: 4 }}>BORRADOR — No oficial</Text>}
        </View>
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 18 }}>
        {/* Título */}
        <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: color, textAlign: 'center' }}>DIAGNÓSTICO PENSIONAL</Text>
        <Text style={{ fontSize: 11, color: C.textoSm, textAlign: 'center', marginTop: 4 }}>Proyecto de optimización de pensión IMSS · Ley {datos.ley || '73'}</Text>

        {/* Línea naranja */}
        <View style={{ height: 2, backgroundColor: C.naranja, marginVertical: 12, borderRadius: 1 }} />

        {/* Nombre del trabajador */}
        <Text style={{ fontSize: 17, fontFamily: 'Helvetica-Bold', color: C.texto }}>{trabajador}</Text>
        <Text style={{ fontSize: 8.5, color: C.textoSm, marginTop: 3 }}>
          {[datos.nss ? `NSS: ${datos.nss}` : null, datos.ley === '73' ? 'Ley 73' : 'Ley 97', datos.edad_actual ? `${datos.edad_actual} años` : null].filter(Boolean).join('  ·  ')}
        </Text>
        <Text style={{ fontSize: 8.5, color: C.textoSm, marginTop: 2 }}>
          {[(datos.semanas_totales || 0).toLocaleString() + ' semanas cotizadas', datos.fecha_calculo ? `Últ. cotización: ${datos.fecha_calculo}` : null, cliente ? `Solicitante: ${cliente}` : null].filter(Boolean).join('  ·  ')}
        </Text>

        {/* 4 KPI cards */}
        <View style={{ flexDirection: 'row', marginTop: 14, gap: 6 }}>
          {[
            { label: 'Pensión sin acción', value: mxn(escBase?.pension_mensual || 0) + '/mes', color: C.gris, bg: '#F8FAFC' },
            { label: 'Pensión con estrategia', value: mxn(escSel?.pension_mensual || 0) + '/mes', color: color, bg: '#EEF7F4' },
            { label: 'Incremento mensual', value: escSel?.incremento_vs_base > 0 ? '+' + mxn(escSel.incremento_vs_base) : '—', color: C.verde, bg: '#f0fdf4' },
            { label: 'Inversión requerida', value: mxn(escSel?.inversion_total || 0), color: C.naranja, bg: '#FFF7ED' },
          ].map((k, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: k.bg, borderRadius: 7, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 7, color: C.textoSm, textTransform: 'uppercase', textAlign: 'center', marginBottom: 5 }}>{k.label}</Text>
              <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: k.color, textAlign: 'center' }}>{k.value}</Text>
            </View>
          ))}
        </View>

        {/* Estrategia recomendada */}
        {escSel && escSel.mod40_meses > 0 && (
          <View style={{ backgroundColor: '#EEF2F8', borderRadius: 7, padding: 10, marginTop: 10, borderLeftWidth: 3, borderLeftColor: color }}>
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: color }}>
              ESTRATEGIA RECOMENDADA: {escSel.label}
            </Text>
            <Text style={{ fontSize: 8, color: C.texto, marginTop: 3 }}>
              {(escSel.mod40_umas || 0).toFixed(1)} UMAs · {escSel.mod40_meses || 0} meses · Costo: {mxn(escSel.costo_mensual_mod40 || 0)}/mes · Recuperación: {escSel.roi_meses || '—'} meses
            </Text>
          </View>
        )}

        {/* Timeline */}
        <View style={{ marginTop: 12 }}>
          <Timeline steps={stepsOrd.map(s => ({ label: s.label, desc: s.desc, color: s.color }))} />
        </View>

        {/* Alerta conservación */}
        {venc && <AlertChip msg="⚠ Conservación de derechos VENCIDA — se requiere reactivación antes del trámite" type="danger" />}
        {!venc && mRest !== null && mRest < 12 && <AlertChip msg={`⚠ Conservación vigente pero próxima a vencer — ${mRest} meses restantes`} type="warning" />}

        {/* Footer */}
        <View style={{ position: 'absolute', bottom: 16, left: 28, right: 28 }}>
          <View style={{ height: 0.5, backgroundColor: C.borde, marginBottom: 6 }} />
          <Text style={{ fontSize: 7, color: C.textoSm }}>
            Documento confidencial elaborado exclusivamente para el trabajador indicado. Los cálculos son estimaciones basadas en la Ley del Seguro Social 1973.
          </Text>
          {esBorrador && (
            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#b45309', marginTop: 3 }}>
              BORRADOR — Pendiente de autorización oficial. No compartir con el cliente.
            </Text>
          )}
        </View>
      </View>
    </Page>
  )
}

// ─── PÁGINA 2: RESUMEN EJECUTIVO ──────────────────────────────────────────────
const PaginaResumen = ({ datos, escenarios, escSelIdx, analisis, ingresoObjetivo, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => {
  const escBase = escenarios[0]
  const escSel  = escenarios[escSelIdx] ?? escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const trabajador = datos.nombre_trabajador || datos.nombre || 'El trabajador'

  const cards = [
    { icon: '●', title: 'Situación actual', color: C.gris, bg: '#F8FAFC', body: `${trabajador} tiene ${datos.semanas_totales || 0} semanas cotizadas bajo Ley ${datos.ley || '73'}. Sin acción, la pensión estimada sería de ${mxn(escBase?.pension_mensual || 0)}/mes.` },
    { icon: '▲', title: 'Oportunidad detectada', color: C.verde, bg: '#f0fdf4', body: `Con la estrategia ${escSel?.label}, la pensión puede llegar a ${mxn(escSel?.pension_mensual || 0)}/mes — un incremento de ${mxn(escSel?.incremento_vs_base || 0)}/mes. La inversión se recupera en ${escSel?.roi_meses || '—'} meses.` },
    { icon: '✓', title: 'Recomendación', color: color, bg: '#EEF2F8', body: `Iniciar Modalidad 40 a ${(escSel?.mod40_umas || 0).toFixed(1)} UMAs por ${escSel?.mod40_meses || 0} meses. Costo: ${mxn(escSel?.costo_mensual_mod40 || 0)}/mes. Inversión total: ${mxn(escSel?.inversion_total || 0)}.` },
  ]

  // Conservación
  const semC = Math.floor((datos.semanas_totales || 0) / 4)
  const mesC = Math.round(semC / 4.33)
  const mDes = datos.fecha_calculo ? Math.floor((Date.now() - new Date(datos.fecha_calculo).getTime()) / (30 * 86400000)) : -1
  const mRest = mDes >= 0 ? Math.max(0, mesC - mDes) : null

  return (
    <Page size="LETTER" style={s.page}>
      {esBorrador && <Watermark />}
      <PageHeader razonSocial={razonSocial} titulo={titulo} color={color} esBorrador={esBorrador} />

      <SectionTitle title="RESUMEN EJECUTIVO" color={color} />

      {/* KPIs */}
      <KpiRow color={color} items={[
        { label: 'Pensión sin acción', value: mxn(escBase?.pension_mensual || 0) + '/mes', color: C.gris },
        { label: 'Pensión con estrategia', value: mxn(escSel?.pension_mensual || 0) + '/mes', color: color },
        { label: '% del objetivo', value: ingresoObjetivo && ingresoObjetivo > 0 ? Math.round((escSel?.pension_mensual || 0) / ingresoObjetivo * 100) + '%' : '—', color: C.verde },
        { label: 'Recuperación inversión', value: (escSel?.roi_meses || 0) + ' meses', color: C.naranja },
      ]} />

      {/* Tarjetas situación/oportunidad/recomendación */}
      {cards.map((card, i) => (
        <View key={i} style={{ backgroundColor: card.bg, borderRadius: 7, padding: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: card.color }} wrap={false}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: card.color, marginBottom: 4 }}>{card.icon}  {card.title}</Text>
          <Text style={{ fontSize: 8.5, color: C.texto, lineHeight: 1.6 }}>{card.body}</Text>
        </View>
      ))}

      {/* Alerta conservación al final */}
      {mRest !== null && mRest === 0 && <AlertChip msg="⚠ Conservación de derechos VENCIDA — se requiere reactivación antes de tramitar la pensión" type="danger" />}
      {mRest !== null && mRest > 0 && mRest < 12 && <AlertChip msg={`⚠ Conservación vigente pero próxima a vencer — ${mRest} meses restantes`} type="warning" />}
    </Page>
  )
}

// ─── PÁGINA 3: DATOS + CONSERVACIÓN ──────────────────────────────────────────
const PaginaDatosConservacion = ({ datos, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => {
  const semC = Math.floor((datos.semanas_totales || 0) / 4)
  const mesC = Math.round(semC / 4.33)
  const mDes = datos.fecha_calculo ? Math.floor((Date.now() - new Date(datos.fecha_calculo).getTime()) / (30 * 86400000)) : -1
  const mRest = mDes >= 0 ? Math.max(0, mesC - mDes) : null
  const vigente = mRest !== null ? mRest > 0 : null

  return (
    <Page size="LETTER" style={s.page}>
      {esBorrador && <Watermark />}
      <PageHeader razonSocial={razonSocial} titulo={titulo} color={color} esBorrador={esBorrador} />

      {/* Sección 1 — Datos */}
      <SectionTitle title="DATOS DEL TRABAJADOR" color={color} />
      <KpiRow color={color} items={[
        { label: 'Nombre', value: (datos.nombre_trabajador || datos.nombre || '—').substring(0, 24) },
        { label: 'NSS', value: datos.nss || '—' },
        { label: 'Edad actual', value: (datos.edad_actual || '—') + ' años' },
        { label: 'Régimen', value: datos.ley === '73' ? 'Ley 73' : datos.ley === '97' ? 'Ley 97' : '—', color: datos.ley === '73' ? color : C.verde },
      ]} />
      <KpiRow color={color} items={[
        { label: 'Semanas cotizadas', value: (datos.semanas_totales || 0).toLocaleString(), color: (datos.semanas_totales || 0) >= 500 ? C.verde : C.rojo },
        { label: 'Fecha de nacimiento', value: datos.fecha_nacimiento || '—' },
        { label: 'Última cotización', value: datos.fecha_calculo || 'No registrada' },
        { label: 'Asignaciones familiares', value: '+' + ((datos.tiene_conyuge ? 15 : 0) + (datos.num_hijos || 0) * 10) + '%', color: C.naranja },
      ]} />
      {(datos.semanas_totales || 0) >= 500
        ? <AlertChip msg={`✓ Semanas suficientes para pensionarse (${datos.semanas_totales} de 500 requeridas)`} type="success" />
        : <AlertChip msg={`⚠ Semanas insuficientes (${datos.semanas_totales} de 500 requeridas) — no es posible pensionarse aún`} type="danger" />
      }

      {/* Sección 2 — Conservación */}
      <View style={{ marginTop: 8 }} />
      <SectionTitle title="CONSERVACIÓN DE DERECHOS" sub="Art. 183 Ley del Seguro Social 1973" color={color} />
      <KpiRow color={color} items={[
        { label: 'Semanas de conservación', value: semC + ' semanas', color },
        { label: 'Período', value: (semC / 4.33 / 12).toFixed(1) + ' años', color },
        { label: 'Estado actual', value: vigente === null ? 'Sin fecha de baja' : vigente ? 'VIGENTE ✓' : 'VENCIDO ✗', color: vigente === null ? C.gris : vigente ? C.verde : C.rojo },
        { label: 'Meses restantes', value: mRest !== null ? (vigente ? mRest + ' meses' : 'Requiere reactivación') : 'Capturar fecha', color: vigente ? C.verde : C.rojo },
      ]} />
      {vigente === false && (
        <AlertChip msg={`⚠ Período de conservación vencido — ${mDes / 12 <= 3 ? 'reconocimiento inmediato al reingresar' : mDes / 12 <= 6 ? 'cotizar 26 semanas nuevas (Art. 151)' : 'cotizar 52 semanas nuevas (Art. 151)'}`} type="danger" />
      )}
      {vigente === true && <AlertChip msg={`✓ Conservación vigente — ${mRest} meses restantes para tramitar la pensión`} type="success" />}
      <Text style={[s.body, { marginTop: 4 }]}>
        La conservación de derechos equivale a 1/4 de las semanas cotizadas (Art. 183 LSS). Con {datos.semanas_totales} semanas, el período es de {semC} semanas (~{(semC / 4.33 / 12).toFixed(1)} años). Este cálculo es una estimación — el resultado definitivo lo determina el IMSS.
      </Text>
    </Page>
  )
}

// ─── PÁGINA 4: SALARIO PROMEDIO 250 SEMANAS ──────────────────────────────────
const PaginaSalario = ({ periodos, sdiPromedio, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => (
  <Page size="LETTER" style={s.page}>
    {esBorrador && <Watermark />}
    <PageHeader razonSocial={razonSocial} titulo={titulo} color={color} esBorrador={esBorrador} />
    <SectionTitle title="SALARIO PROMEDIO — ÚLTIMAS 250 SEMANAS COTIZADAS" sub="Art. 167 LSS 1973" color={color} />
    <Text style={[s.body, { marginBottom: 8 }]}>
      La pensión bajo Ley 73 se calcula sobre el promedio del Salario Diario Integrado (SDI) de las últimas 250 semanas cotizadas (~5 años). Este promedio es la base de todos los escenarios del diagnóstico.
    </Text>
    <KpiRow color={color} items={[
      { label: 'SDI promedio 250 sem.', value: mxn2(sdiPromedio), color: C.naranja },
      { label: 'SDI mensual equivalente', value: mxn(sdiPromedio * 30.4) },
      { label: 'Períodos analizados', value: periodos.length.toString() },
      { label: 'Semanas cubiertas', value: periodos.reduce((s, p) => s + (p.semanas || 0), 0).toString() },
    ]} />
    {periodos.length > 0 && (
      <DataTable
        headers={['#', 'Inicio', 'Fin', 'Sem.', 'SDI diario', 'SDI mensual', 'Peso %']}
        widths={[18, 52, 52, 24, 52, 52, 34]}
        aligns={['center', 'center', 'center', 'right', 'right', 'right', 'right']}
        rows={periodos.map((p, i) => [
          (i + 1).toString(),
          p.fecha_inicio || '—',
          p.fecha_fin || '—',
          (p.semanas || 0).toString(),
          mxn2(p.sdi || 0),
          mxn((p.sdi || 0) * 30.4),
          (p.peso || 0).toFixed(1) + '%',
        ])}
        totalRow={['Promedio ponderado', '', '', periodos.reduce((s, p) => s + (p.semanas || 0), 0).toString(), mxn2(sdiPromedio), mxn(sdiPromedio * 30.4), '100%']}
      />
    )}
  </Page>
)

// ─── PÁGINA 5: MODALIDAD 40 ───────────────────────────────────────────────────
const PaginaMod40 = ({ escenarios, escSelIdx, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => {
  const escSel = escenarios[escSelIdx] ?? escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  if (!escSel || !escSel.mod40_meses) return null

  const costoM  = escSel.costo_mensual_mod40 || 0
  const sdiM40  = (escSel.mod40_umas || 0) * 113.14
  const meses   = escSel.mod40_meses || 0
  const showMs  = meses <= 24
    ? Array.from({ length: meses }, (_, i) => i + 1)
    : [1, 3, 6, 12, Math.floor(meses / 2), meses].filter((m, i, a) => m <= meses && a.indexOf(m) === i).sort((a, b) => a - b)

  return (
    <Page size="LETTER" style={s.page}>
      {esBorrador && <Watermark />}
      <PageHeader razonSocial={razonSocial} titulo={titulo} color={color} esBorrador={esBorrador} />
      <SectionTitle title="MODALIDAD 40 — ESTRATEGIA DE OPTIMIZACIÓN" sub="Art. 218 Ley del Seguro Social 1973" color={color} />
      <Text style={[s.body, { marginBottom: 8 }]}>
        La Modalidad 40 permite al trabajador continuar cotizando voluntariamente al IMSS sobre un salario mayor al histórico, incrementando el SDI promedio de las últimas 250 semanas y con ello la pensión final.
      </Text>
      <KpiRow color={color} items={[
        { label: 'Salario base (UMAs)', value: (escSel.mod40_umas || 0).toFixed(1) + ' UMAs', color },
        { label: 'Período de cotización', value: meses + ' meses', color },
        { label: 'Costo mensual', value: mxn(costoM), color: C.naranja },
        { label: 'Inversión total', value: mxn(escSel.inversion_total || 0), color: C.naranja },
      ]} />
      <KpiRow color={color} items={[
        { label: 'Pensión estimada', value: mxn(escSel.pension_mensual || 0) + '/mes', color: C.verde },
        { label: 'Incremento vs base', value: '+' + mxn(escSel.incremento_vs_base || 0) + '/mes', color: C.verde },
        { label: 'Recuperación de inversión', value: (escSel.roi_meses || 0) + ' meses', color },
        { label: 'Tasa aplicada', value: '14.438%', color: C.gris },
      ]} />

      <Text style={s.h2}>Proyección de cotización mensual</Text>
      <DataTable
        headers={['Mes', 'SDI cotizado/día', 'Cuota mensual', 'Acumulado', 'Sem. adicionales', '% del plazo']}
        widths={[20, 68, 68, 68, 70, 50]}
        aligns={['center', 'right', 'right', 'right', 'right', 'right']}
        rows={showMs.map((mes, i) => [
          mes.toString(),
          mxn2(sdiM40),
          mxn(costoM),
          mxn(costoM * mes),
          (mes * 4.33).toFixed(1),
          Math.round(mes / meses * 100) + '%',
        ])}
        totalRow={['Total', '—', mxn(costoM) + '/mes', mxn(escSel.inversion_total || 0), (meses * 4.33).toFixed(0), '100%']}
      />
    </Page>
  )
}

// ─── PÁGINA 6: MODALIDAD 10 (opcional) ───────────────────────────────────────
const PaginaMod10 = ({ escenarios, escSelIdx, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => {
  const escM10 = escenarios.find(e => e.id === 'e_m10')
  const escSel = escenarios[escSelIdx] ?? escenarios.find(e => e.recomendado)
  if (!escM10) return null

  const cuotaM40 = escSel?.costo_mensual_mod40 || 0
  const dif = escM10.costo_mensual_mod40 - cuotaM40

  return (
    <Page size="LETTER" style={s.page}>
      {esBorrador && <Watermark />}
      <PageHeader razonSocial={razonSocial} titulo={titulo} color={color} esBorrador={esBorrador} />
      <SectionTitle title="MODALIDAD 10 — INCORPORACIÓN VOLUNTARIA" sub="Art. 240 Ley del Seguro Social" color={color} />
      <Text style={[s.body, { marginBottom: 8 }]}>
        La Modalidad 10 permite a trabajadores independientes afiliarse al IMSS con cobertura integral: servicio médico, guarderías e Infonavit. Es más cara que Mod 40 pero ofrece beneficios adicionales significativos.
      </Text>
      <KpiRow color={color} items={[
        { label: 'Cuota mensual (22%)', value: mxn(escM10.costo_mensual_mod40), color: C.verde },
        { label: 'Inversión total', value: mxn(escM10.inversion_total), color: C.naranja },
        { label: 'Pensión estimada', value: mxn(escM10.pension_mensual) + '/mes', color: C.verde },
        { label: 'Extra vs Mod 40', value: '+' + mxn(dif) + '/mes', color: '#f97316' },
      ]} />
      <Text style={s.h2}>Comparativa Modalidad 10 vs Modalidad 40</Text>
      <DataTable
        headers={['Concepto', 'Mod 10', 'Mod 40', 'Diferencia', 'Extra']}
        widths={[120, 68, 68, 72, 36]}
        aligns={['left', 'right', 'right', 'right', 'center']}
        rows={[
          ['Cuota mensual', mxn(escM10.costo_mensual_mod40), mxn(cuotaM40), mxn(dif) + ' más', ''],
          ['Inversión total', mxn(escM10.inversion_total), mxn(escSel?.inversion_total || 0), mxn(escM10.inversion_total - (escSel?.inversion_total || 0)) + ' más', ''],
          ['Pensión estimada', mxn(escM10.pension_mensual) + '/mes', mxn(escSel?.pension_mensual || 0) + '/mes', '≈ igual', ''],
          ['Servicio médico IMSS', 'Sí', 'No', '', '✓'],
          ['Guarderías', 'Sí', 'No', '', '✓'],
          ['Aportaciones Infonavit', 'Sí', 'No', '', '✓'],
          ['Requiere historial IMSS', 'No', 'Sí', '', ''],
        ]}
      />
      <Text style={{ fontSize: 7, color: C.textoSm, fontFamily: 'Helvetica-Oblique', marginTop: 4 }}>
        Nota: La tasa del 22% es un estimado. El monto exacto varía por actividad y zona geográfica. Verificar en imss.gob.mx
      </Text>
    </Page>
  )
}

// ─── PÁGINA 7: COMPARATIVO DE ESCENARIOS ─────────────────────────────────────
const PaginaEscenarios = ({ escenarios, escSelIdx, ingresoObjetivo, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => {
  const escSel = escenarios[escSelIdx] ?? escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const maxVal = Math.max(...escenarios.map(e => e.pension_mensual || 0), ingresoObjetivo || 0)

  return (
    <Page size="LETTER" style={s.page}>
      {esBorrador && <Watermark />}
      <PageHeader razonSocial={razonSocial} titulo={titulo} color={color} esBorrador={esBorrador} />
      <SectionTitle title="COMPARATIVO DE ESCENARIOS DE PENSIÓN" color={color} />

      {/* Tabla comparativa */}
      <DataTable
        headers={['Escenario', 'Pensión/mes', 'Incremento', 'Inversión', 'ROI', '★']}
        widths={[130, 56, 56, 56, 40, 26]}
        aligns={['left', 'right', 'right', 'right', 'right', 'center']}
        rows={escenarios.map((esc, i) => {
          const isEl = i === escSelIdx || (escSelIdx < 0 && esc.recomendado)
          return [
            esc.label,
            mxn(esc.pension_mensual),
            i === 0 ? '—' : '+' + mxn(esc.incremento_vs_base),
            i === 0 ? '$0' : mxn(esc.inversion_total),
            i === 0 ? '—' : (esc.roi_meses || '—') + 'm',
            isEl ? '★' : '',
          ]
        })}
      />

      {/* Gráfica */}
      <Text style={[s.h2, { marginTop: 10 }]}>Pensión mensual estimada por escenario</Text>
      <Text style={{ fontSize: 8, color: C.textoSm, marginBottom: 8 }}>
        Las barras muestran la pensión mensual estimada. La barra marcada con ★ es el escenario recomendado.
      </Text>
      <BarChart escenarios={escenarios} escSelIdx={escSelIdx} maxVal={maxVal} objetivo={ingresoObjetivo} />

      {/* Chip objetivo */}
      {ingresoObjetivo && ingresoObjetivo > 0 && (() => {
        const pct = Math.round((escSel?.pension_mensual || 0) / ingresoObjetivo * 100)
        return pct >= 100
          ? <AlertChip msg={`✓ El escenario elegido alcanza el objetivo de ${mxn(ingresoObjetivo)}/mes (${pct}%)`} type="success" />
          : <AlertChip msg={`⚠ El escenario elegido cubre el ${pct}% del objetivo — faltan ${mxn(ingresoObjetivo - (escSel?.pension_mensual || 0))}/mes`} type={pct >= 70 ? 'warning' : 'danger'} />
      })()}
    </Page>
  )
}

// ─── PÁGINA 8: ANÁLISIS EJECUTIVO ────────────────────────────────────────────
const PaginaAnalisis = ({ analisis, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => {
  if (!analisis || analisis.length === 0) return null
  const secciones = analisis.filter(s => !s.titulo?.toLowerCase().includes('paso') && !s.titulo?.toLowerCase().includes('siguiente'))

  return (
    <Page size="LETTER" style={s.page}>
      {esBorrador && <Watermark />}
      <PageHeader razonSocial={razonSocial} titulo={titulo} color={color} esBorrador={esBorrador} />
      <SectionTitle title="ANÁLISIS EJECUTIVO DEL PROYECTO DE PENSIÓN" color={color} />
      {secciones.map((sec, i) => (
        <View key={i} style={{ marginBottom: 12 }} wrap={false}>
          <Text style={[s.h2, { borderBottomWidth: 0.5, borderBottomColor: C.borde, paddingBottom: 3 }]}>{sec.titulo || ''}</Text>
          <Text style={[s.body, { lineHeight: 1.7 }]}>{sec.contenido || ''}</Text>
        </View>
      ))}
    </Page>
  )
}

// ─── PÁGINA 9: PRÓXIMOS PASOS ─────────────────────────────────────────────────
const PaginaPasos = ({ datos, escenarios, escSelIdx, analisis, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => {
  const escSel = escenarios[escSelIdx] ?? escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const edadA  = datos.edad_actual || 60
  const mMod   = escSel?.mod40_meses || 0
  const edadFin = Math.round(edadA + mMod / 12)

  const hitos = [
    { label: `Hoy (${edadA} años)`, desc: 'Verificar semanas en portal IMSS', color: C.naranja, age: edadA },
    { label: `${edadFin} años`, desc: `Alta Mod 40: ${mxn(escSel?.costo_mensual_mod40 || 0)}/mes`, color, age: edadFin },
    { label: '65 años', desc: `Pensión vejez: ${mxn(escSel?.pension_mensual || 0)}/mes`, color: C.verde, age: 65 },
  ]
  if (edadFin < 60) hitos.splice(2, 0, { label: '60 años', desc: 'Solicitar cesantía IMSS', color, age: 60 })
  const steps = hitos.sort((a, b) => a.age - b.age).filter((s, i, arr) => i === 0 || s.age > arr[i-1].age)

  const pasosSec = analisis.find(s => s.titulo?.toLowerCase().includes('paso') || s.titulo?.toLowerCase().includes('siguiente'))

  return (
    <Page size="LETTER" style={s.page}>
      {esBorrador && <Watermark />}
      <PageHeader razonSocial={razonSocial} titulo={titulo} color={color} esBorrador={esBorrador} />
      <SectionTitle title="PRÓXIMOS PASOS" color={color} />

      <Timeline steps={steps.map(s => ({ label: s.label, desc: s.desc, color: s.color }))} />

      {pasosSec
        ? <Text style={[s.body, { lineHeight: 1.7, marginTop: 8 }]}>{pasosSec.contenido}</Text>
        : [
            '1. Confirmar los datos presentados en este diagnóstico con el asesor.',
            '2. Tramitar el alta en Modalidad 40 ante el IMSS (subdelegación o imss.gob.mx).',
            `3. Iniciar pagos mensuales de ${mxn(escSel?.costo_mensual_mod40 || 0)} durante ${mMod} meses consecutivos.`,
            '4. Al completar el período, reunir documentación y solicitar la pensión en la subdelegación IMSS.',
            '5. Verificar periódicamente el historial de semanas en el portal del IMSS: imss.gob.mx · Tel: 800 623 2323',
          ].map((p, i) => <Text key={i} style={[s.body, { marginBottom: 4 }]}>{p}</Text>)
      }
    </Page>
  )
}

// ─── PÁGINA 10: AVISO LEGAL ───────────────────────────────────────────────────
const PaginaAviso = ({ razonSocial, color, titulo, esBorrador }: Partial<PDFProps> & { color: string; titulo: string }) => (
  <Page size="LETTER" style={s.page}>
    {esBorrador && <Watermark />}
    <PageHeader razonSocial={razonSocial} titulo={titulo} color={color} esBorrador={esBorrador} />
    <SectionTitle title="AVISO LEGAL Y LIMITACIONES" color={color} />
    {[
      'Este diagnóstico pensional fue elaborado con base en la información proporcionada por el trabajador y los datos registrados en la constancia de semanas cotizadas emitida por el Instituto Mexicano del Seguro Social (IMSS).',
      'Los cálculos se realizan conforme a la Ley del Seguro Social de 1973 y sus reformas vigentes. El monto final de la pensión estará sujeto a la resolución definitiva del IMSS, quien determinará el importe de acuerdo con los salarios y semanas registrados en sus sistemas oficiales.',
      'Este documento tiene carácter informativo y no constituye una promesa de pago ni un compromiso por parte del IMSS ni del asesor. Los escenarios presentados son proyecciones basadas en los datos disponibles al momento del diagnóstico y pueden variar.',
      'Se recomienda verificar periódicamente la vigencia y exactitud de la información de semanas cotizadas en el portal oficial del IMSS: imss.gob.mx · Tel. IMSS: 800 623 2323',
    ].map((p, i) => <Text key={i} style={[s.body, { marginBottom: 8, lineHeight: 1.7 }]}>{p}</Text>)}

    {esBorrador && <AlertChip msg="BORRADOR — Este documento no ha sido autorizado por el asesor. No debe ser entregado al cliente en este estado." type="warning" />}

    <View style={{ marginTop: 16, borderTopWidth: 0.5, borderTopColor: C.borde, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 7, color: C.textoSm }}>{razonSocial || 'KSE Pensiones'}</Text>
        <Text style={{ fontSize: 7, color: C.textoSm }}>
          Generado el {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
      </View>
    </View>
  </Page>
)

// ─── DOCUMENTO PRINCIPAL ──────────────────────────────────────────────────────
export const DiagnosticoPDF = (props: PDFProps) => {
  const {
    encabezadoColor, encabezadoTitulo, razonSocial, asesorNombre,
    logoUrl, esBorrador = false,
  } = props

  const color = encabezadoColor || '#1B3A6B'
  const titulo = encabezadoTitulo || 'Diagnóstico Pensional'

  const shared = { ...props, color, titulo, razonSocial, asesorNombre, logoUrl, esBorrador }

  return (
    <Document
      title={`Diagnóstico Pensional — ${props.datos.nombre_trabajador || props.datos.nombre || 'Cliente'}`}
      author={razonSocial || 'KSE Pensiones'}
      subject="Diagnóstico de Pensión IMSS"
    >
      <PaginaPortada {...shared} />
      <PaginaResumen {...shared} />
      <PaginaDatosConservacion {...shared} />
      <PaginaSalario {...shared} />
      <PaginaMod40 {...shared} />
      <PaginaMod10 {...shared} />
      <PaginaEscenarios {...shared} />
      <PaginaAnalisis {...shared} />
      <PaginaPasos {...shared} />
      <PaginaAviso {...shared} />
    </Document>
  )
}
