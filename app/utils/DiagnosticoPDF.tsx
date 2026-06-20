// DiagnosticoPDF.tsx — KSE Pensiones
// Generador de PDF con @react-pdf/renderer
// Reemplaza pdf-generator.ts (jsPDF)

import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet, Svg, Rect,
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
// Formato fecha ISO → español
const fmtFecha = (iso?: string) => {
  if (!iso) return '—'
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const match = iso.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return iso
  const [,y,m,d] = match
  return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${y}`
}
const fmtFechaCta = (iso?: string) => {
  if (!iso) return '—'
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const match = iso.match(/(\d{4})-(\d{2})/)
  if (!match) return iso
  const [,y,m] = match
  return `${meses[parseInt(m)-1]} ${y}`
}

const mxn2 = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

// ─── Estilos globales ─────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.texto,
    paddingTop: 46,
    paddingBottom: 24,
    paddingHorizontal: 24,
    backgroundColor: C.blanco,
  },
  // Header en cada página interior
  pageHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 36,
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
    top: '38%',
    left: '8%',
    fontSize: 68,
    fontFamily: 'Helvetica-Bold',
    color: '#DC2626',
    opacity: 0.07,
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
  tableCellBold: { fontSize: 7, paddingVertical: 4, paddingHorizontal: 3, fontFamily: 'Helvetica-Bold', color: C.azul },
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

// Tapa blanca que cubre el encabezado delgado SOLO en la página 1 (ahí ya está el banner grande).
// No es fixed: al ser contenido normal, solo existe una vez — justo donde cae la página 1.
const PageHeaderMaskPagina1 = () => (
  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 36, backgroundColor: C.blanco }} />
)

// Marca de agua BORRADOR
const Watermark = () => (
  <Text
    style={s.watermark}
    fixed
    render={() => 'BORRADOR'}
  />
)

// Barra de sección
const SectionTitle = ({ title, sub, color }: { title: string; sub?: string; color: string }) => (
  <View style={[s.sectionBar, { backgroundColor: color }]} wrap={false}>
    <Text style={s.sectionBarText}>{title}</Text>
    {sub && <Text style={s.sectionBarSub}>{sub}</Text>}
  </View>
)

// Fila de KPI cards
const KpiRow = ({ items, color }: { items: { label: string; value: string; color?: string; sub?: string }[]; color: string }) => (
  <View style={s.kpiRow} wrap={false}>
    {items.map((item, i) => (
      <View key={i} style={[s.kpiCard, i === 0 ? { marginLeft: 0 } : {}, i === items.length - 1 ? { marginRight: 0 } : {}]}>
        <Text style={s.kpiLabel}>{item.label}</Text>
        <Text style={[s.kpiValue, { color: item.color || color }]}>{item.value}</Text>
        {item.sub ? <Text style={{ fontSize: 6, color: C.textoSm, textAlign: 'center', marginTop: 2 }}>{item.sub}</Text> : null}
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
  headers, rows, widths, aligns, totalRow, highlightRows,
}: {
  headers: string[]
  rows: string[][]
  widths: string[] | number[]
  aligns?: string[]
  totalRow?: string[]
  highlightRows?: boolean[]
}) => (
  <View style={{ marginBottom: 10, width: '100%' }}>
    <View style={[s.tableHeader, { width: '100%' }]}>
      {headers.map((h, i) => (
        <Text key={i} style={[s.tableHeaderCell, { width: widths[i] as any, textAlign: (aligns?.[i] || 'center') as any, flexShrink: 1 }]}>{h}</Text>
      ))}
    </View>
    {rows.map((row, ri) => (
      <View key={ri} style={[s.tableRow, ri % 2 === 1 ? s.tableRowEven : {}, highlightRows?.[ri] ? { backgroundColor: '#E1F5EE' } : {}, { width: '100%' }]} wrap={false}>
        {row.map((cell, ci) => (
          <Text key={ci} style={[s.tableCell, { width: widths[ci] as any, textAlign: (aligns?.[ci] || (ci === 0 ? 'left' : 'right')) as any, flexShrink: 1 }, highlightRows?.[ri] ? { fontFamily: 'Helvetica-Bold', color: C.azul } : {}]}>
            {String(cell ?? '')}
          </Text>
        ))}
      </View>
    ))}
    {totalRow && (
      <View style={[s.tableRow, s.tableRowTotal, { width: '100%' }]} wrap={false}>
        {totalRow.map((cell, ci) => (
          <Text key={ci} style={[s.tableCellBold, { width: widths[ci] as any, textAlign: (aligns?.[ci] || (ci === 0 ? 'left' : 'right')) as any, flexShrink: 1 }]}>
            {String(cell ?? '')}
          </Text>
        ))}
      </View>
    )}
  </View>
)

// Gráfica de barras horizontal — SVG proporcional
const BarChart = ({ escenarios, escSelIdx, maxVal, objetivo }: {
  escenarios: Escenario[]
  escSelIdx: number
  maxVal: number
  objetivo?: number
}) => {
  const barColors = ['#94a3b8', '#3b82f6', '#eab308', '#f97316', C.azul, '#7c3aed']
  const W_CHART = 470
  const LABEL_W = 140  // 22% of 470 ≈ 103, use 140 for readability
  const VAL_W   = 90   // 20%
  const BAR_W   = W_CHART - LABEL_W - VAL_W  // ~240 = 58%
  const BAR_H   = 12
  const ROW_H   = 20
  const TOTAL_H = escenarios.length * ROW_H + 30

  return (
    <View style={{ marginBottom: 10, width: '100%', maxWidth: '100%' }}>
      <Svg width={W_CHART} height={TOTAL_H} style={{ width: '100%' }}>
        {escenarios.map((esc, i) => {
          const isEl   = i === escSelIdx || (escSelIdx < 0 && !!esc.recomendado)
          const pct    = maxVal > 0 ? Math.min((esc.pension_mensual || 0) / maxVal, 1) : 0
          const barLen = Math.max(Math.round(pct * BAR_W), 2)
          const rowY   = i * ROW_H
          const color  = barColors[i] || C.azul
          const bgColor = i % 2 === 0 ? '#F8FAFC' : '#FFFFFF'
          return (
            <React.Fragment key={i}>
              {/* Row background */}
              <Rect x={0} y={rowY} width={W_CHART} height={ROW_H} fill={bgColor} />
              {/* Highlight background for selected */}
              {isEl && <Rect x={0} y={rowY} width={W_CHART} height={ROW_H} fill="#EEF7F4" />}
              {/* Bar track */}
              <Rect x={LABEL_W} y={rowY + 4} width={BAR_W} height={BAR_H} fill="#E8EDF5" rx={2} />
              {/* Filled bar */}
              <Rect x={LABEL_W} y={rowY + 4} width={barLen} height={BAR_H} fill={color} rx={2} />
              {/* Accent stripe for selected */}
              {isEl && <Rect x={LABEL_W} y={rowY + 4} width={4} height={BAR_H} fill={C.naranja} rx={2} />}
            </React.Fragment>
          )
        })}

      </Svg>
      {/* Labels and values as Text overlay */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: W_CHART }}>
        {escenarios.map((esc, i) => {
          const isEl = i === escSelIdx || (escSelIdx < 0 && !!esc.recomendado)
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', height: ROW_H }}>
              <Text style={{ width: LABEL_W, fontSize: isEl ? 8 : 7, fontFamily: isEl ? 'Helvetica-Bold' : 'Helvetica', color: isEl ? C.azul : C.gris, paddingLeft: 2 }}>
                {isEl ? '> ' : ''}{esc.label.substring(0, 28)}
              </Text>
              <View style={{ width: BAR_W }} />
              <Text style={{ width: VAL_W, fontSize: isEl ? 9 : 7.5, fontFamily: 'Helvetica-Bold', color: isEl ? C.azul : '#374151', textAlign: 'right', paddingRight: 2 }}>
                {mxn(esc.pension_mensual || 0)}/mes
              </Text>
            </View>
          )
        })}
        {/* Objetivo label */}
        {objetivo && objetivo > 0 && maxVal > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <View style={{ width: 16, height: 1.5, backgroundColor: C.rojo, marginRight: 4 }} />
            <Text style={{ fontSize: 7, color: C.rojo, fontFamily: 'Helvetica-Bold' }}>
              Objetivo: {mxn(objetivo)}/mes
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

// Timeline horizontal — View based
const Timeline = ({ steps }: { steps: { label: string; desc: string; color: string }[] }) => (
  <View style={{ marginVertical: 10 }} wrap={false}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {steps.map((step, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
          {/* Connector line */}
          <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 4 }}>
            {i > 0 && <View style={{ flex: 1, height: 1, backgroundColor: C.borde }} />}
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: step.color }} />
            {i < steps.length - 1 && <View style={{ flex: 1, height: 1, backgroundColor: C.borde }} />}
          </View>
          {/* Label */}
          <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: step.color, textAlign: 'center', paddingHorizontal: 2 }}>
            {step.label}
          </Text>
          {/* Desc */}
          <Text style={{ fontSize: 6.5, color: C.textoSm, textAlign: 'center', paddingHorizontal: 2, marginTop: 2, lineHeight: 1.4 }}>
            {step.desc}
          </Text>
        </View>
      ))}
    </View>
  </View>
)


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
  const edadFin = Math.ceil(edadA + mMod / 12)
  const tlSteps = [
    { label: `Hoy (${edadA} años)`, desc: 'Verificar semanas IMSS', color: C.naranja, age: edadA },
    { label: `${edadFin} años`, desc: `Alta Mod 40\n${mxn(escSel?.costo_mensual_mod40 || 0)}/mes`, color: color, age: edadFin },
    { label: '65 años', desc: `Pensión vejez\n${mxn(escSel?.pension_mensual || 0)}/mes`, color: C.verde, age: 65 },
  ]
  if (edadFin < 60) tlSteps.splice(2, 0, { label: '60 años', desc: 'Cesantía IMSS', color: color, age: 60 })
  const stepsOrd = tlSteps.sort((a, b) => a.age - b.age).filter((s, i, arr) => i === 0 || s.age > arr[i-1].age)

  return (
    <>
      {/* Franja del asesor — contenido normal (no fixed), por eso solo aparece una vez al inicio del documento */}
      <View style={{ backgroundColor: color, height: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, marginHorizontal: -24, marginTop: -10, marginBottom: 18 }}>
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
          {esBorrador && <Text style={{ color: C.rojo, fontSize: 7, fontFamily: 'Helvetica-Bold', marginTop: 4, backgroundColor: 'rgba(255,255,255,0.15)', padding: 2 }}>BORRADOR</Text>}
        </View>
      </View>

      <View>
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
            { label: 'Inversión requerida', value: mxn(escSel?.inversion_total || 0), color: C.gris, bg: '#F8FAFC' },
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

        {/* Semanas info bar */}
        <View style={{ flexDirection: 'row', backgroundColor: C.grisCl, borderRadius: 6, padding: 8, marginTop: 8, marginBottom: 6 }} wrap={false}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 7, color: C.textoSm, marginBottom: 2 }}>SEMANAS COTIZADAS</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: (datos.semanas_totales || 0) >= 500 ? C.verde : C.rojo }}>
              {(datos.semanas_totales || 0).toLocaleString()}
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: C.borde, marginHorizontal: 4 }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 7, color: C.textoSm, marginBottom: 2 }}>MÍNIMO REQUERIDO</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.gris }}>500</Text>
          </View>
          <View style={{ width: 1, backgroundColor: C.borde, marginHorizontal: 4 }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 7, color: C.textoSm, marginBottom: 2 }}>RÉGIMEN</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: color }}>
              Ley {datos.ley || '73'}
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: C.borde, marginHorizontal: 4 }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 7, color: C.textoSm, marginBottom: 2 }}>CONSERVACIÓN</Text>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: venc ? C.rojo : C.verde }}>
              {venc ? 'VENCIDA' : (mRest !== null ? mRest + ' meses' : 'Vigente')}
            </Text>
          </View>
        </View>

        {/* Alerta conservación */}
        {venc && <AlertChip msg="ATENCIÓN: Conservación de derechos VENCIDA — se requiere reactivación antes del trámite" type="danger" />}
        {!venc && mRest !== null && mRest < 12 && <AlertChip msg={`Conservación vigente pero próxima a vencer — ${mRest} meses restantes`} type="warning" />}

        {/* Resumen ejecutivo — KPIs con % de objetivo y recuperación de inversión (se había perdido al fusionar con la portada) */}
        <View style={{ marginTop: 14 }}>
          <SectionTitle title="RESUMEN EJECUTIVO" color={color} />
          <KpiRow color={color} items={[
            { label: 'Pensión sin acción', value: mxn(escBase?.pension_mensual || 0) + '/mes', color: C.gris },
            { label: 'Pensión con estrategia', value: mxn(escSel?.pension_mensual || 0) + '/mes', color: color },
            { label: ingresoObjetivo && ingresoObjetivo > 0 ? `% de ${mxn(ingresoObjetivo)}/mes` : '% del objetivo', value: ingresoObjetivo && ingresoObjetivo > 0 ? Math.round((escSel?.pension_mensual || 0) / ingresoObjetivo * 100) + '%' : '—', color: C.verde },
            { label: 'Recuperación inversión', value: (escSel?.roi_meses || 0) + ' meses', color: C.naranja },
          ]} />
        </View>

        {/* Resumen narrativo — antes vivía en una página aparte, ahora aprovecha el espacio sobrante de la portada */}
        <View style={{ marginTop: 10 }}>
          {[
            { title: 'Situación actual', color: C.gris, bg: '#F8FAFC', body: `${trabajador} tiene ${datos.semanas_totales || 0} semanas cotizadas bajo Ley ${datos.ley || '73'}. Sin acción, la pensión estimada sería de ${mxn(escBase?.pension_mensual || 0)}/mes.` },
            { title: 'Oportunidad detectada', color: C.verde, bg: '#f0fdf4', body: `Con la estrategia ${escSel?.label}, la pensión puede llegar a ${mxn(escSel?.pension_mensual || 0)}/mes — un incremento de ${mxn(escSel?.incremento_vs_base || 0)}/mes. La inversión se recupera en ${escSel?.roi_meses || '—'} meses.` },
            { title: 'Recomendación', color: color, bg: '#EEF2F8', body: `Iniciar Modalidad 40 a ${(escSel?.mod40_umas || 0).toFixed(1)} UMAs por ${escSel?.mod40_meses || 0} meses. Costo: ${mxn(escSel?.costo_mensual_mod40 || 0)}/mes. Inversión total: ${mxn(escSel?.inversion_total || 0)}.` },
          ].map((card, i) => (
            <View key={i} style={{ backgroundColor: card.bg, borderRadius: 7, padding: 8, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: card.color }} wrap={false}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: card.color, marginBottom: 3 }}>{card.title}</Text>
              <Text style={{ fontSize: 8, color: C.texto, lineHeight: 1.5 }}>{card.body}</Text>
            </View>
          ))}
        </View>

        {/* Footer — separate views to avoid overlap */}
        <View style={{ marginTop: 10 }}>
          <View style={{ height: 0.5, backgroundColor: C.borde, marginBottom: 6 }} />
          <Text style={{ fontSize: 7, color: C.textoSm }}>
            Documento confidencial elaborado exclusivamente para el trabajador indicado. Los cálculos son estimaciones basadas en la Ley del Seguro Social 1973.
          </Text>
          {esBorrador && (
            <View style={{ marginTop: 10, backgroundColor: '#FEE2E2', borderLeftWidth: 3, borderLeftColor: C.rojo, padding: 8, borderRadius: 3 }}>
              <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#991b1b' }}>
                BORRADOR — Pendiente de autorización oficial. No compartir con el cliente.
              </Text>
            </View>
          )}
        </View>
      </View>
    </>
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
    <>
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
        { label: 'Fecha de nacimiento', value: fmtFecha(datos.fecha_nacimiento) },
        { label: 'Última cotización', value: fmtFechaCta(datos.fecha_calculo) || 'No registrada', color: datos.fecha_calculo ? C.azul : C.gris },
        { label: 'Asignaciones familiares', value: '+' + ((datos.tiene_conyuge ? 15 : 0) + (datos.num_hijos || 0) * 10) + '%', sub: 'sobre pensión base', color: C.naranja },
      ]} />
      {(datos.semanas_totales || 0) >= 500
        ? <AlertChip msg={`✓ Semanas suficientes para pensionarse (${datos.semanas_totales} de 500 requeridas)`} type="success" />
        : <AlertChip msg={`⚠ Semanas insuficientes (${datos.semanas_totales} de 500 requeridas) — no es posible pensionarse aún`} type="danger" />
      }

      {/* Sección 2 — Conservación */}
      
      <SectionTitle title="CONSERVACIÓN DE DERECHOS" sub="Art. 183 Ley del Seguro Social 1973" color={color} />
      <KpiRow color={color} items={[
        { label: 'Semanas de conservación', value: semC + ' semanas', color },
        { label: 'Período', value: (semC / 4.33 / 12).toFixed(1) + ' años', color },
        { label: 'Estado actual', value: vigente === null ? 'Sin fecha de baja' : vigente ? 'VIGENTE ✓' : 'VENCIDO ✗', color: vigente === null ? C.gris : vigente ? C.verde : C.rojo },
        { label: vigente ? 'Meses restantes' : 'Estado', value: mRest !== null ? (vigente ? mRest + ' meses restantes' : 'Requiere\nreactivación') : 'Sin fecha\nde baja', color: vigente ? C.verde : C.rojo },
      ]} />
      {vigente === false && (
        <AlertChip msg={`⚠ Período de conservación vencido — ${mDes / 12 <= 3 ? 'reconocimiento inmediato al reingresar' : mDes / 12 <= 6 ? 'cotizar 26 semanas nuevas (Art. 151)' : 'cotizar 52 semanas nuevas (Art. 151)'}`} type="danger" />
      )}
      {vigente === true && <AlertChip msg={`✓ Conservación vigente — ${mRest} meses restantes para tramitar la pensión`} type="success" />}
      <Text style={[s.body, { marginTop: 4 }]}>
        La conservación de derechos equivale a 1/4 de las semanas cotizadas (Art. 183 LSS). Con {datos.semanas_totales} semanas, el período es de {semC} semanas (~{(semC / 4.33 / 12).toFixed(1)} años). Este cálculo es una estimación — el resultado definitivo lo determina el IMSS.
      </Text>
    </>
  )
}

// ─── PÁGINA 4: SALARIO PROMEDIO 250 SEMANAS ──────────────────────────────────
const PaginaSalario = ({ periodos, sdiPromedio, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => (
  <View style={{ marginTop: 14 }}>
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
        widths={['12%', '14%', '11%', '8%', '17%', '18%', '20%']}
        aligns={['center', 'center', 'center', 'right', 'right', 'right', 'right']}
        rows={periodos.map((p, i) => [
          (i + 1).toString(),
          fmtFechaCta(p.fecha_inicio),
          fmtFechaCta(p.fecha_fin),
          (p.semanas || 0).toString(),
          mxn2(p.sdi || 0),
          mxn((p.sdi || 0) * 30.4),
          (p.peso || 0).toFixed(1) + '%',
        ])}
        totalRow={['Promedio pond.', '', '', periodos.reduce((s, p) => s + (p.semanas || 0), 0).toString(), mxn2(sdiPromedio), mxn(sdiPromedio * 30.4), '100%']}
      />
    )}
  </View>
)

// ─── PÁGINA 5: MODALIDAD 40 ───────────────────────────────────────────────────
const PaginaMod40Mod10 = ({ escenarios, escSelIdx, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => {
  const escSel = escenarios[escSelIdx] ?? escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const escM10 = escenarios.find(e => e.id === 'e_m10')
  const tieneMod40 = !!(escSel && escSel.mod40_meses)
  if (!tieneMod40 && !escM10) return null

  const costoM  = escSel?.costo_mensual_mod40 || 0
  const sdiM40  = (escSel?.mod40_umas || 0) * 113.14
  const meses   = escSel?.mod40_meses || 0
  const showMs  = meses <= 24
    ? Array.from({ length: meses }, (_, i) => i + 1)
    : [1, 3, 6, 12, Math.floor(meses / 2), meses].filter((m, i, a) => m <= meses && a.indexOf(m) === i).sort((a, b) => a - b)

  const cuotaM40 = escSel?.costo_mensual_mod40 || 0
  const dif = (escM10?.costo_mensual_mod40 || 0) - cuotaM40

  return (
    <View style={{ marginTop: 14 }}>
      {tieneMod40 && (
        <>
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
            { label: 'Cuota Mod 40 (% SBC)', value: '14.438% sobre SBC', color: C.gris },
          ]} />

          <Text style={s.h2}>Proyección de cotización mensual</Text>
          <DataTable
            headers={['Mes', 'SDI cotizado/día', 'Cuota mensual', 'Acumulado', 'Sem. adicionales', '% del plazo']}
            widths={['8%', '18%', '18%', '20%', '20%', '16%']}
            aligns={['center', 'right', 'right', 'right', 'right', 'right']}
            rows={showMs.map((mes, i) => [
              mes.toString(),
              mxn2(sdiM40),
              mxn(costoM),
              mxn(costoM * mes),
              Math.round(mes * 4.33).toString(),
              Math.round(mes / meses * 100) + '%',
            ])}
            totalRow={['TOTALES', '—', mxn(costoM) + '/mes', mxn(escSel.inversion_total || 0), Math.round(meses * 4.33).toString() + ' sem', '100%']}
          />
        </>
      )}

      {escM10 && (
        <View style={{ marginTop: tieneMod40 ? 14 : 0 }}>
          <SectionTitle title="MODALIDAD 10 — INCORPORACIÓN VOLUNTARIA" sub="Art. 240 Ley del Seguro Social" color={color} />
          <Text style={[s.body, { marginBottom: 8 }]}>
            La Modalidad 10 permite a trabajadores independientes afiliarse al IMSS con cobertura integral: servicio médico, guarderías e Infonavit. Es más cara que Mod 40 pero ofrece beneficios adicionales significativos.
          </Text>
          <KpiRow color={color} items={[
            { label: 'Cuota mensual (22%)', value: mxn(escM10.costo_mensual_mod40), color: C.verde },
            { label: 'Inversión total', value: mxn(escM10.inversion_total), color: C.naranja },
            { label: 'Pensión estimada', value: mxn(escM10.pension_mensual) + '/mes', color: C.verde },
            { label: 'Costo extra vs Mod 40', value: mxn(dif) + '/mes más que Mod 40', color: '#f97316' },
          ]} />
          <Text style={s.h2}>Comparativa Modalidad 10 vs Modalidad 40</Text>
          <DataTable
            headers={['Concepto', 'Mod 10', 'Mod 40', 'Diferencia', 'Extra']}
            widths={['30%', '17%', '17%', '22%', '14%']}
            aligns={['left', 'right', 'right', 'right', 'center']}
            rows={[
              ['Cuota mensual', mxn(escM10.costo_mensual_mod40), mxn(cuotaM40), '+' + mxn(dif) + ' más', ''],
              ['Inversión total', mxn(escM10.inversion_total), mxn(escSel?.inversion_total || 0), mxn(escM10.inversion_total - (escSel?.inversion_total || 0)) + ' más', ''],
              ['Pensión estimada', mxn(escM10.pension_mensual) + '/mes', mxn(escSel?.pension_mensual || 0) + '/mes', 'mismo monto', ''],
              ['Servicio médico IMSS', 'Sí', 'No', '', '✓'],
              ['Guarderías', 'Sí', 'No', '', '✓'],
              ['Aportaciones Infonavit', 'Sí', 'No', '', '✓'],
              ['Requiere historial IMSS', 'No', 'Sí', '', ''],
            ]}
          />
          <Text style={{ fontSize: 7.5, color: C.textoSm, fontFamily: 'Helvetica-Oblique', marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.borde }}>
            Nota: La tasa del 22% es un estimado. El monto exacto varía por actividad y zona geográfica. Verificar en imss.gob.mx
          </Text>
        </View>
      )}
    </View>
  )
}

// ─── PÁGINA 7: COMPARATIVO DE ESCENARIOS ─────────────────────────────────────
const PaginaEscenarios = ({ escenarios, escSelIdx, ingresoObjetivo, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => {
  const escSel = escenarios[escSelIdx] ?? escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const maxVal = Math.max(...escenarios.map(e => e.pension_mensual || 0), ingresoObjetivo || 0)

  return (
    <View style={{ marginTop: 14 }}>
      <SectionTitle title="COMPARATIVO DE ESCENARIOS DE PENSIÓN" color={color} />

      {/* Tabla comparativa */}
      <DataTable
        headers={['Escenario', 'Pensión/mes', 'Incremento', 'Inversión total', 'ROI (meses)', 'Elegido']}
        widths={['32%', '16%', '15%', '17%', '13%', '7%']}
        aligns={['left', 'right', 'right', 'right', 'right', 'center']}
        rows={escenarios.map((esc, i) => {
          const isEl = i === escSelIdx || (escSelIdx < 0 && esc.recomendado)
          return [
            (isEl ? '' : '') + esc.label,
            mxn(esc.pension_mensual),
            i === 0 ? '—' : '+' + mxn(esc.incremento_vs_base),
            i === 0 ? '$0' : mxn(esc.inversion_total),
            i === 0 ? '—' : String(esc.roi_meses || '—'),
            isEl ? 'SI' : '',
          ]
        })}
        highlightRows={escenarios.map((esc, i) => i === escSelIdx || (escSelIdx < 0 && !!esc.recomendado))}
      />

      {/* Gráfica */}
      <Text style={[s.h2, { marginTop: 10 }]}>Pensión mensual estimada por escenario</Text>
      <Text style={{ fontSize: 8, color: C.textoSm, marginBottom: 8 }}>
        Las barras muestran la pensión mensual estimada. La barra en azul marino es el escenario recomendado.
      </Text>
      <BarChart escenarios={escenarios} escSelIdx={escSelIdx} maxVal={maxVal} objetivo={ingresoObjetivo} />

      {/* Chip objetivo */}
      {ingresoObjetivo && ingresoObjetivo > 0 && (() => {
        const pct = Math.round((escSel?.pension_mensual || 0) / ingresoObjetivo * 100)
        return pct >= 100
          ? <AlertChip msg={`✓ El escenario elegido alcanza el objetivo de ${mxn(ingresoObjetivo)}/mes (${pct}%)`} type="success" />
          : <AlertChip msg={`⚠ El escenario elegido cubre el ${pct}% del objetivo — faltan ${mxn(ingresoObjetivo - (escSel?.pension_mensual || 0))}/mes`} type={pct >= 70 ? 'warning' : 'danger'} />
      })()}
    </View>
  )
}

// ─── PÁGINA 8: ANÁLISIS EJECUTIVO ────────────────────────────────────────────
const PaginaAnalisisPasos = ({ datos, escenarios, escSelIdx, analisis, color, titulo, razonSocial, esBorrador }: PDFProps & { color: string; titulo: string }) => {
  const secciones = (analisis || []).filter(s => !s.titulo?.toLowerCase().includes('paso') && !s.titulo?.toLowerCase().includes('siguiente'))

  const escSel = escenarios[escSelIdx] ?? escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const edadA  = datos.edad_actual || 60
  const mMod   = escSel?.mod40_meses || 0
  const edadFin = Math.ceil(edadA + mMod / 12)

  const hitos = [
    { label: `Hoy (${edadA} años)`, desc: 'Verificar semanas en portal IMSS', color: C.naranja, age: edadA },
    { label: `${edadFin} años`, desc: `Alta Mod 40: ${mxn(escSel?.costo_mensual_mod40 || 0)}/mes`, color, age: edadFin },
    { label: '65 años', desc: `Pensión vejez: ${mxn(escSel?.pension_mensual || 0)}/mes`, color: C.verde, age: 65 },
  ]
  if (edadFin < 60) hitos.splice(2, 0, { label: '60 años', desc: 'Solicitar cesantía IMSS', color, age: 60 })
  const steps = hitos.sort((a, b) => a.age - b.age).filter((s, i, arr) => i === 0 || s.age > arr[i-1].age)

  const pasosSec = (analisis || []).find(s => s.titulo?.toLowerCase().includes('paso') || s.titulo?.toLowerCase().includes('siguiente'))

  return (
    <View style={{ marginTop: 14 }}>
      {secciones.length > 0 && (
        <>
          <SectionTitle title="ANÁLISIS EJECUTIVO DEL PROYECTO DE PENSIÓN" color={color} />
          {secciones.map((sec, i) => (
            <View key={i} style={{ marginBottom: 10 }}>
              <View style={{ backgroundColor: '#EEF2F8', borderLeftWidth: 3, borderLeftColor: color, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 5, borderRadius: 3 }}>
                <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color }}>{String(sec?.titulo || '')}</Text>
              </View>
              <Text style={[s.body, { lineHeight: 1.8, paddingHorizontal: 4 }]}>{String(sec?.contenido || '')}</Text>
            </View>
          ))}
        </>
      )}

      <View style={{ marginTop: secciones.length > 0 ? 14 : 0 }}>
        <SectionTitle title="PRÓXIMOS PASOS" color={color} />

        <Timeline steps={steps.map(s => ({ label: s.label, desc: s.desc, color: s.color }))} />

        {(() => {
          const defaultSteps = [
            'Confirmar los datos de este diagnóstico con el asesor antes de cualquier acción.',
            `Tramitar el alta en Modalidad 40 ante el IMSS. Llevar: CURP, NSS, identificación oficial y comprobante de domicilio. Portal: imss.gob.mx`,
            `Iniciar pagos mensuales de ${mxn(escSel?.costo_mensual_mod40 || 0)} durante ${mMod} meses consecutivos sin interrupción.`,
            'Al completar el período de cotización, reunir documentación y solicitar la pensión en la subdelegación IMSS correspondiente.',
            'Verificar periódicamente el historial de semanas en el portal del IMSS: imss.gob.mx · Tel: 800 623 2323',
          ]
          const rawContent = pasosSec ? String(pasosSec.contenido || '') : ''
          const steps = pasosSec && rawContent.length > 10
            ? rawContent.split(/\n|\r\n/).map((s: string) => s.replace(/^[\d]+\.\s*|^[-•]\s*/, '').trim()).filter((s: string) => s.length > 0)
            : defaultSteps
          return steps.map((paso: string, i: number) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 9, color, width: 14, marginTop: 1 }}>-</Text>
              <Text style={[s.body, { flex: 1, lineHeight: 1.8 }]}>{paso.replace(/^\d+\.\s*/, '')}</Text>
            </View>
          ))
        })()}
      </View>
    </View>
  )
}

// ─── PÁGINA 10: AVISO LEGAL ───────────────────────────────────────────────────
const PaginaAviso = ({ razonSocial, color, titulo, esBorrador }: Partial<PDFProps> & { color: string; titulo: string }) => (
  <View style={{ marginTop: 14 }}>
    <SectionTitle title="AVISO LEGAL Y LIMITACIONES" color={color} />
    {[
      'Este diagnóstico pensional fue elaborado con base en la información proporcionada por el trabajador y los datos registrados en la constancia de semanas cotizadas emitida por el Instituto Mexicano del Seguro Social (IMSS).',
      'Los cálculos se realizan conforme a la Ley del Seguro Social de 1973 y sus reformas vigentes. El monto final de la pensión estará sujeto a la resolución definitiva del IMSS, quien determinará el importe de acuerdo con los salarios y semanas registrados en sus sistemas oficiales.',
      'Este documento tiene carácter informativo y no constituye una promesa de pago ni un compromiso por parte del IMSS ni del asesor. Los escenarios presentados son proyecciones basadas en los datos disponibles al momento del diagnóstico y pueden variar.',
      'Se recomienda verificar periódicamente la vigencia y exactitud de la información de semanas cotizadas en el portal oficial del IMSS: imss.gob.mx · Tel. IMSS: 800 623 2323',
    ].map((p, i) => <Text key={i} style={[s.body, { marginBottom: 8, lineHeight: 1.7 }]}>{p}</Text>)}

    {esBorrador && <AlertChip msg="BORRADOR — Este documento es un borrador de trabajo. Debe ser revisado y aprobado por el asesor antes de entregarlo al cliente." type="warning" />}

    <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.azul, paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.azul }}>{razonSocial || 'KSE Pensiones'}</Text>
        <Text style={{ fontSize: 7, color: C.textoSm }}>
          Generado el {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
      </View>
      <Text style={{ fontSize: 8, color: C.textoSm, marginTop: 4 }}>
        imss.gob.mx · Tel. IMSS: <Text style={{ fontFamily: 'Helvetica-Bold', color: C.azul }}>800 623 2323</Text>
      </Text>
    </View>
  </View>
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
      {/* Documento continuo: una sola Page que se reparte sola en tantas páginas físicas como el contenido necesite.
          El encabezado delgado y la marca de agua son `fixed` y se repiten automáticamente en cada página. */}
      <Page size="LETTER" style={s.page} wrap>
        {esBorrador && <Watermark />}
        <PageHeader razonSocial={razonSocial} titulo={titulo} color={color} esBorrador={esBorrador} />
        <PageHeaderMaskPagina1 />

        <PaginaPortada {...shared} />
        <PaginaDatosConservacion {...shared} />
        <PaginaSalario {...shared} />
        <PaginaMod40Mod10 {...shared} />
        <PaginaEscenarios {...shared} />
        <PaginaAnalisisPasos {...shared} />
        <PaginaAviso {...shared} />
      </Page>
    </Document>
  )
}
