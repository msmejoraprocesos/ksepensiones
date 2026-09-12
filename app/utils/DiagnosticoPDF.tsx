// DiagnosticoPDF.tsx — KSE Pensiones v3
// Bloques configurables + gráficas SVG + narrativa de Sofía IA

import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet,
  Svg, Rect, Line, Path, Circle, G, Defs,
  LinearGradient as PdfLinearGradient, Stop as PdfStop
} from '@react-pdf/renderer'
import { mergePDFConfig } from '@/app/utils/pdf-config'
import type { PDFConfig } from '@/app/utils/pdf-config'

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface DatosTrabajador {
  nombre?: string; nombre_trabajador?: string; nss?: string; ley?: string
  edad_actual?: number; semanas_totales?: number; fecha_calculo?: string
  fecha_nacimiento?: string; tiene_conyuge?: boolean; num_hijos?: number
  num_padres?: number; edad_min_pension?: number; fecha_ingreso_mod40?: string
  fecha_baja_mod40?: string
}
interface Escenario {
  id: string; label: string; pension_base?: number; pension_mensual: number
  costo_total: number; inversion_neta?: number; recuperacion_afore?: number
  costo_mensual_mod40: number; incremento_vs_base: number; roi_meses: number
  roi?: number; mod40_meses: number; mod40_umas: number; recomendado?: boolean
  ganancia_a80?: number; tasa_rendimiento?: number; aguinaldo_anual?: number
  fecha_ingreso_mod40?: string; fecha_baja_mod40?: string; edad_retiro?: number
  pension_inmediata?: number; pension_al_liquidar?: number; descuento_mensual?: number
  cuantia_basica_anual?: number; incrementos_anual?: number; asignaciones_anual?: number
  aportacion_banco?: number; aportacion_segundo_fondeo?: number
}
interface Periodo { fecha_inicio?: string; fecha_fin?: string; semanas?: number; sdi?: number; peso?: number }
interface SofiaOutput {
  apertura?: string
  bloques?: {
    situacion?: { texto?: string }
    sin_mod40?: { texto?: string }
    con_mod40?: { texto_antes?: string; texto_despues?: string }
    gauge?: { texto?: string }
    timeline?: { texto?: string }
    area_flujos?: { texto?: string }
    comparativa?: { texto?: string }
    cuantias?: { texto?: string }
    sdi?: { texto?: string }
    financiamiento?: { texto_antes?: string; texto_despues?: string }
    proximos_pasos?: { texto?: string; pasos?: string[] }
  }
  recomendacion_final?: string
}
interface PDFProps {
  datos: DatosTrabajador; periodos: Periodo[]; sdiPromedio: number
  escenarios: Escenario[]; escSelIdx: number
  logoUrl?: string; razonSocial?: string; asesorNombre?: string
  encabezadoColor?: string; encabezadoTitulo?: string
  esBorrador?: boolean; umaDiaria?: number; pdfConfig?: any
  sofiaOutput?: SofiaOutput   // ← nueva prop: narrativa de Sofía
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const mxn  = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const mxn2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
/**
 * Paleta del PDF alineada al sistema de diseño de la aplicación
 * (docs/rediseno/SISTEMA-DISENO.md).
 *
 * Antes divergía: el acento era #F05B21 contra el #E8622C de la calculadora,
 * y los grises venían de otra escala. El asesor mostraba una pantalla y
 * entregaba un documento que no se parecía, lo que resta a la percepción de
 * que ambos salieron del mismo sistema.
 */
const C = {
  azul: '#14375F', naranja: '#E8622C', verde: '#12855C', rojo: '#B91C1C',
  gris: '#66738A', grisCl: '#F5F7FA', blanco: '#FFFFFF', texto: '#132135',
  textoSm: '#66738A', borde: '#E1E7F0',
}

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.texto, paddingBottom: 32, paddingHorizontal: 0, backgroundColor: C.grisCl },
  wm: { position: 'absolute', top: '38%', left: '8%', fontSize: 68, fontFamily: 'Helvetica-Bold', color: C.rojo, opacity: 0.07 },
  header: { paddingVertical: 18, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLabel: { fontSize: 7, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  headerName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.blanco, marginBottom: 2 },
  headerSub: { fontSize: 8.5, color: 'rgba(255,255,255,0.75)' },
  headerBadge: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 5, paddingVertical: 5, paddingHorizontal: 10, alignItems: 'center' },
  body: { paddingHorizontal: 22, paddingTop: 16 },
  secLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.azul, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7, paddingLeft: 7, borderLeftWidth: 2.5 },
  sofiaBox: { borderRadius: 5, padding: 9, marginVertical: 6, flexDirection: 'row' },
  sofiaText: { fontSize: 8.5, color: C.texto, lineHeight: 1.6, flex: 1 },
  sofiaLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  kpiRow: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  kpi: { flex: 1, backgroundColor: C.blanco, borderRadius: 7, padding: 9, alignItems: 'center', borderWidth: 0.5, borderColor: C.borde },
  kpiLbl: { fontSize: 7, color: C.textoSm, marginBottom: 2, textAlign: 'center' },
  kpiVal: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.texto, textAlign: 'center' },
  kpiSub: { fontSize: 6.5, color: C.textoSm, marginTop: 1, textAlign: 'center' },
  infoRow: { flexDirection: 'row', backgroundColor: C.blanco, borderRadius: 5, padding: 7, marginBottom: 6, borderWidth: 0.5, borderColor: C.borde },
  infoLbl: { fontSize: 6.5, color: C.textoSm, textTransform: 'uppercase', marginBottom: 1.5 },
  infoVal: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.texto },
  divider: { height: 0.5, backgroundColor: C.borde, marginVertical: 14 },
  tblHeader: { flexDirection: 'row', borderRadius: 3, marginBottom: 0 },
  tblHeaderCell: { color: C.blanco, fontSize: 7, fontFamily: 'Helvetica-Bold', paddingVertical: 5, paddingHorizontal: 5, textAlign: 'center' },
  tblRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.borde, backgroundColor: C.blanco },
  tblRowAlt: { backgroundColor: C.grisCl },
  tblRowRec: { backgroundColor: '#E6F4EE' },
  tblCell: { fontSize: 7.5, paddingVertical: 4, paddingHorizontal: 5, color: C.texto },
  tblCellBold: { fontSize: 7.5, paddingVertical: 4, paddingHorizontal: 5, fontFamily: 'Helvetica-Bold', color: C.azul },
  pasoRow: { flexDirection: 'row', gap: 7, marginBottom: 7, alignItems: 'flex-start' },
  pasoBadge: { borderRadius: 9, width: 16, height: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pasoText: { flex: 1, fontSize: 8.5, color: C.texto, lineHeight: 1.5, paddingTop: 1.5 },
  footer: { paddingHorizontal: 22, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: C.borde, flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  footerText: { fontSize: 6.5, color: C.textoSm },
})

// ─── Sofia box helper ──────────────────────────────────────────────────────────
const SofiaBox = ({ tipo, texto, COLOR }: { tipo: 'azul' | 'amarillo' | 'verde'; texto: string; COLOR: string }) => {
  if (!texto) return null
  const map: any = {
    azul:     { bg: '#EEF2F8', border: COLOR,      label: '★ Sofía explica:',     lColor: COLOR },
    amarillo: { bg: '#FFFBEB', border: '#F59E0B',   label: '⚠ Sofía advierte:',   lColor: '#92400E' },
    verde:    { bg: '#E6F4EE', border: C.verde,   label: '✓ Sofía recomienda:', lColor: '#15803D' },
  }
  const m = map[tipo]
  return (
    <View style={[s.sofiaBox, { backgroundColor: m.bg, borderLeftWidth: 2.5, borderLeftColor: m.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.sofiaLabel, { color: m.lColor }]}>{m.label}</Text>
        <Text style={s.sofiaText}>{texto}</Text>
      </View>
    </View>
  )
}

// ─── GRÁFICAS SVG ─────────────────────────────────────────────────────────────

const ChartBarras = ({ escenarios, COLOR, ACCENT }: { escenarios: Escenario[]; COLOR: string; ACCENT: string }) => {
  const items = [
    { label: 'Sin Mod.40', val: escenarios[0]?.pension_mensual || 0, color: C.gris, rec: false },
    ...escenarios.filter(e => e.mod40_meses > 0).slice(0, 3).map((e, i) => ({
      label: `Esc.${i + 1}`,
      val: e.pension_mensual,
      color: [COLOR, '#2E7D5A', ACCENT][i] || COLOR,
      rec: !!e.recomendado,
    }))
  ]
  const maxVal = Math.max(...items.map(it => it.val))
  const W = 340, H = 100, barW = Math.min(60, (W - 20) / items.length - 10)
  const gap = (W - 20 - barW * items.length) / (items.length - 1 || 1)

  return (
    <Svg width={W} height={H + 30} style={{ marginBottom: 6 }}>
      {items.map((it, i) => {
        const barH = maxVal > 0 ? (it.val / maxVal) * H : 0
        const x = 10 + i * (barW + gap)
        const y = H - barH
        return (
          <G key={i}>
            <Rect x={x} y={y} width={barW} height={barH} rx={3} fill={it.color} />
            {it.rec && <Rect x={x - 1} y={y - 1} width={barW + 2} height={barH + 1} rx={3} fill="none" stroke="#16A34A" strokeWidth={1.5} />}
            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', fill: it.color, textAlign: 'center' }} x={x + barW / 2} y={y - 3}>{mxn(it.val)}</Text>
            <Text style={{ fontSize: 6.5, fill: C.textoSm, textAlign: 'center' }} x={x + barW / 2} y={H + 10}>{it.label}</Text>
            {it.rec && <Text style={{ fontSize: 6, fill: C.verde, textAlign: 'center' }} x={x + barW / 2} y={H + 18}>★</Text>}
          </G>
        )
      })}
      <Line x1={10} y1={H} x2={W - 10} y2={H} stroke={C.borde} strokeWidth={0.5} />
    </Svg>
  )
}

const ChartGauge = ({ meses, ACCENT }: { meses: number; ACCENT: string }) => {
  const getColor = (m: number) => m <= 16 ? '#059669' : m <= 24 ? C.verde : m <= 36 ? '#CA8A04' : m <= 48 ? '#D97706' : C.rojo
  const getLabel = (m: number) => m <= 16 ? 'Excelente' : m <= 24 ? 'Muy buena' : m <= 36 ? 'Aceptable' : m <= 48 ? 'Moderada' : 'Alto'
  const color = getColor(meses)
  const pct = Math.min(meses, 60) / 60
  const r = 50, cx = 80, cy = 65
  const startAngle = Math.PI
  const endAngle = startAngle + pct * Math.PI
  const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle)
  const x1b = cx + (r - 12) * Math.cos(startAngle), y1b = cy + (r - 12) * Math.sin(startAngle)
  const x2b = cx + (r - 12) * Math.cos(endAngle), y2b = cy + (r - 12) * Math.sin(endAngle)
  const large = pct > 0.5 ? 1 : 0

  return (
    <Svg width={200} height={90}>
      {/* Track */}
      <Path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#F3F4F6" strokeWidth={12} strokeLinecap="round" />
      {/* Fill */}
      <Path d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x2b} ${y2b} A ${r - 12} ${r - 12} 0 ${large} 0 ${x1b} ${y1b} Z`} fill={color} />
      {/* Center text */}
      <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', fill: color, textAlign: 'center' }} x={cx} y={cy - 4}>{meses}</Text>
      <Text style={{ fontSize: 7, fill: C.textoSm, textAlign: 'center' }} x={cx} y={cy + 8}>meses</Text>
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', fill: color, textAlign: 'center' }} x={cx} y={cy + 22}>{getLabel(meses)}</Text>
      {/* Scale labels */}
      <Text style={{ fontSize: 6, fill: C.gris }} x={22} y={cy + 6}>0</Text>
      <Text style={{ fontSize: 6, fill: C.gris }} x={cx} y={cy - r - 4}>30</Text>
      <Text style={{ fontSize: 6, fill: C.gris }} x={cx + r - 8} y={cy + 6}>60</Text>
    </Svg>
  )
}

const ChartTimeline = ({ datos, escRec, COLOR }: { datos: DatosTrabajador; escRec: Escenario | undefined; COLOR: string }) => {
  const hoy = new Date().toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })
  const events = [
    { label: 'Hoy', sub: hoy, color: C.textoSm },
    { label: 'Ingreso Mod.40', sub: escRec?.fecha_ingreso_mod40?.slice(0, 7) || '—', color: COLOR },
    { label: 'Baja Mod.40', sub: escRec?.fecha_baja_mod40?.slice(0, 7) || '—', color: C.verde },
    { label: 'Trámite', sub: datos?.fecha_nacimiento ? (() => { const d = new Date(datos.fecha_nacimiento); d.setFullYear(d.getFullYear() + (datos.edad_min_pension || 60)); return d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }) })() : '—', color: '#7C3AED' },
  ]
  const W = 340, spacing = (W - 40) / (events.length - 1)

  return (
    <Svg width={W} height={60} style={{ marginBottom: 4 }}>
      <Line x1={20} y1={28} x2={W - 20} y2={28} stroke="#E2E8F0" strokeWidth={2} />
      {events.map((ev, i) => {
        const x = 20 + i * spacing
        return (
          <G key={i}>
            <Circle cx={x} cy={28} r={6} fill={ev.color} />
            <Text style={{ fontSize: 6.5, fontFamily: 'Helvetica-Bold', fill: ev.color, textAlign: 'center' }} x={x} y={14}>{ev.label}</Text>
            <Text style={{ fontSize: 6, fill: C.gris, textAlign: 'center' }} x={x} y={42}>{ev.sub}</Text>
          </G>
        )
      })}
      {escRec && (
        <Rect x={20 + spacing} y={24} width={spacing} height={8} rx={2} fill={COLOR} opacity={0.15} />
      )}
    </Svg>
  )
}

const ChartAreaFlujos = ({ escRec, escBase, COLOR }: { escRec: Escenario | undefined; escBase: Escenario | undefined; COLOR: string }) => {
  const edadRet = escRec?.edad_retiro || 62
  const years = Math.max(0, 80 - Math.floor(edadRet))
  if (years === 0 || !escRec || !escBase) return null

  const W = 340, H = 80
  const penCon = escRec.pension_mensual
  const penSin = escBase.pension_mensual
  const FACTOR = 1.54
  const pts = Array.from({ length: years + 1 }, (_, i) => {
    const ratio = i / years
    return { x: (ratio * (W - 40)) + 20, yCon: H - (penCon * (i + 1) * 12 * FACTOR / (penCon * years * 12 * FACTOR)) * H, ySin: H - (penSin * (i + 1) * 12 * FACTOR / (penCon * years * 12 * FACTOR)) * H }
  })
  const pathCon = `M ${pts[0].x} ${H} ` + pts.map(p => `L ${p.x} ${p.yCon}`).join(' ') + ` L ${pts[pts.length - 1].x} ${H} Z`
  const pathSin = `M ${pts[0].x} ${H} ` + pts.map(p => `L ${p.x} ${p.ySin}`).join(' ') + ` L ${pts[pts.length - 1].x} ${H} Z`

  return (
    <Svg width={W} height={H + 20} style={{ marginBottom: 6 }}>
      <Path d={pathSin} fill="#94A3B8" opacity={0.2} />
      <Path d={pathCon} fill={COLOR} opacity={0.25} />
      {/* Lines */}
      <Path d={`M ${pts.map(p => `${p.x} ${p.ySin}`).join(' L ')}`} fill="none" stroke="#94A3B8" strokeWidth={1} strokeDasharray="3 2" />
      <Path d={`M ${pts.map(p => `${p.x} ${p.yCon}`).join(' L ')}`} fill="none" stroke={COLOR} strokeWidth={1.5} />
      {/* Labels */}
      <Text style={{ fontSize: 6.5, fill: COLOR, fontFamily: 'Helvetica-Bold' }} x={W - 38} y={pts[pts.length - 1].yCon - 4}>Con</Text>
      <Text style={{ fontSize: 6.5, fill: C.textoSm }} x={W - 38} y={pts[pts.length - 1].ySin - 4}>Sin</Text>
      {/* Axis */}
      <Line x1={20} y1={H} x2={W - 20} y2={H} stroke={C.borde} strokeWidth={0.5} />
      <Text style={{ fontSize: 6, fill: C.gris }} x={20} y={H + 10}>{Math.floor(edadRet)}</Text>
      <Text style={{ fontSize: 6, fill: C.gris, textAlign: 'center' }} x={W / 2} y={H + 10}>{Math.floor(edadRet + years / 2)}</Text>
      <Text style={{ fontSize: 6, fill: C.gris }} x={W - 40} y={H + 10}>80 años</Text>
    </Svg>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────
export const DiagnosticoPDF = ({
  datos, periodos, sdiPromedio, escenarios, escSelIdx,
  logoUrl, razonSocial, asesorNombre, encabezadoColor,
  encabezadoTitulo, esBorrador, umaDiaria, pdfConfig, sofiaOutput
}: PDFProps) => {
  const cfg = mergePDFConfig(pdfConfig)
  const COLOR = encabezadoColor || C.azul
  const ACCENT = cfg.color_acento || C.naranja
  const sf = sofiaOutput?.bloques || {}
  const footerTexto = cfg.footer_texto || 'Este diagnóstico es informativo y no constituye asesoría legal o garantía de montos.'

  const escBase = escenarios[0]
  const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escSelIdx] ?? escenarios[escenarios.length - 1]
  const nombre = datos.nombre_trabajador || datos.nombre || 'Cliente'
  const hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
  const mejora = escRec && escBase ? escRec.pension_mensual - escBase.pension_mensual : 0
  const tieneMod40 = escRec && escRec.mod40_meses > 0
  const escsMod40 = escenarios.filter(e => e.mod40_meses > 0)

  // Qué secciones mostrar y en qué orden
  const secciones = [...cfg.secciones].sort((a, b) => a.orden - b.orden).filter(s => s.visible)
  const secVisible = (id: string) => secciones.some(s => s.id === id)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {(esBorrador && cfg.mostrar_watermark) && <Text style={s.wm}>BORRADOR</Text>}

        {/* Header */}
        <View style={[s.header, { backgroundColor: COLOR }]}>
          <View style={{ flex: 1 }}>
            {logoUrl && <Image src={logoUrl} style={{ width: 72, height: 20, objectFit: 'contain', marginBottom: 6 }} />}
            <Text style={s.headerLabel}>{encabezadoTitulo || 'Diagnóstico Pensional'}</Text>
            <Text style={s.headerName}>{nombre}</Text>
            <Text style={s.headerSub}>
              {asesorNombre ? `Elaborado por: ${asesorNombre}` : razonSocial || ''} · {hoy}
            </Text>
          </View>
          <View style={{ gap: 5, alignItems: 'flex-end' }}>
            <View style={s.headerBadge}>
              <Text style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.6)', marginBottom: 1 }}>Régimen</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.blanco }}>{datos.ley || 'Ley 73'}</Text>
            </View>
            {esBorrador && (
              <View style={[s.headerBadge, { backgroundColor: 'rgba(220,38,38,0.3)' }]}>
                <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.blanco }}>BORRADOR</Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ height: 3, backgroundColor: ACCENT }} />

        {/* Apertura Sofía */}
        {sofiaOutput?.apertura && (
          <View style={[s.body, { paddingTop: 12 }]}>
            <SofiaBox tipo="azul" texto={sofiaOutput.apertura} COLOR={COLOR} />
          </View>
        )}

        <View style={s.body}>

          {/* ── SITUACIÓN ACTUAL ── */}
          {secVisible('situacion') && (
            <>
              <Text style={[s.secLabel, { borderLeftColor: ACCENT }]}>Tu situación actual</Text>
              <View style={s.kpiRow}>
                <View style={s.kpi}>
                  <Text style={s.kpiLbl}>Semanas cotizadas</Text>
                  <Text style={s.kpiVal}>{(datos.semanas_totales || 0).toLocaleString('es-MX')}</Text>
                  <Text style={s.kpiSub}>{Math.round((datos.semanas_totales || 0) / 52)} años de cotización</Text>
                </View>
                <View style={s.kpi}>
                  <Text style={s.kpiLbl}>SDI promedio 250 sem.</Text>
                  <Text style={s.kpiVal}>{mxn2(sdiPromedio)}</Text>
                  <Text style={s.kpiSub}>por día</Text>
                </View>
                {cfg.kpi_por_fila >= 3 && (
                  <View style={s.kpi}>
                    <Text style={s.kpiLbl}>Edad actual</Text>
                    <Text style={s.kpiVal}>{datos.edad_actual?.toFixed(0) || '—'}</Text>
                    <Text style={s.kpiSub}>años</Text>
                  </View>
                )}
              </View>
              {sf.situacion?.texto && <SofiaBox tipo="azul" texto={sf.situacion.texto} COLOR={COLOR} />}
            </>
          )}

          {/* ── PENSIÓN SIN MOD40 ── */}
          {secVisible('sin_mod40') && (
            <>
              <View style={s.divider} />
              <Text style={[s.secLabel, { borderLeftColor: ACCENT }]}>Tu pensión si te pensionas hoy (sin Modalidad 40)</Text>
              <View style={s.kpiRow}>
                <View style={[s.kpi, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                  <Text style={[s.kpiLbl, { color: C.rojo }]}>Pensión mensual</Text>
                  <Text style={[s.kpiVal, { color: C.rojo }]}>{mxn(escBase?.pension_mensual || 0)}</Text>
                </View>
                <View style={s.kpi}>
                  <Text style={s.kpiLbl}>Pensión anual</Text>
                  <Text style={s.kpiVal}>{mxn((escBase?.pension_mensual || 0) * 12)}</Text>
                </View>
                {cfg.kpi_por_fila >= 3 && (
                  <View style={s.kpi}>
                    <Text style={s.kpiLbl}>Edad de retiro</Text>
                    <Text style={s.kpiVal}>{escBase?.edad_retiro?.toFixed(0) || datos.edad_min_pension || 60}</Text>
                    <Text style={s.kpiSub}>años</Text>
                  </View>
                )}
              </View>
              {sf.sin_mod40?.texto && <SofiaBox tipo="amarillo" texto={sf.sin_mod40.texto} COLOR={COLOR} />}
            </>
          )}

          {/* ── GRÁFICA BARRAS ── */}
          {secVisible('bar_pension') && escsMod40.length > 0 && (
            <>
              <View style={s.divider} />
              <Text style={[s.secLabel, { borderLeftColor: ACCENT }]}>Comparativa visual de pensión por escenario</Text>
              {sf.con_mod40?.texto_antes && <SofiaBox tipo="azul" texto={sf.con_mod40.texto_antes} COLOR={COLOR} />}
              <ChartBarras escenarios={escenarios} COLOR={COLOR} ACCENT={ACCENT} />
              {sf.con_mod40?.texto_despues && <SofiaBox tipo="verde" texto={sf.con_mod40.texto_despues} COLOR={COLOR} />}
            </>
          )}

          {/* ── CON MOD40 (sin gráfica de barras) ── */}
          {secVisible('con_mod40') && !secVisible('bar_pension') && tieneMod40 && (
            <>
              {cfg.pagina_break_antes_mod40 && <View break />}
              <Text style={[s.secLabel, { borderLeftColor: C.verde, color: C.verde }]}>Con Modalidad 40 — opción recomendada</Text>
              <View style={s.kpiRow}>
                <View style={[s.kpi, { backgroundColor: '#E6F4EE', borderColor: '#86EFAC', borderTopWidth: 2.5, borderTopColor: C.verde }]}>
                  <Text style={[s.kpiLbl, { color: C.verde }]}>Nueva pensión mensual</Text>
                  <Text style={[s.kpiVal, { color: C.verde }]}>{mxn(escRec?.pension_mensual || 0)}</Text>
                </View>
                <View style={[s.kpi, { borderTopWidth: 2.5, borderTopColor: COLOR }]}>
                  <Text style={s.kpiLbl}>Mejora mensual</Text>
                  <Text style={[s.kpiVal, { color: COLOR }]}>+{mxn(mejora)}</Text>
                </View>
                {cfg.kpi_por_fila >= 3 && (
                  <View style={[s.kpi, { backgroundColor: '#FFF7ED', borderTopWidth: 2.5, borderTopColor: ACCENT }]}>
                    <Text style={[s.kpiLbl, { color: '#C2410C' }]}>Se recupera en</Text>
                    <Text style={[s.kpiVal, { color: '#C2410C' }]}>{escRec?.roi || escRec?.roi_meses || 0}</Text>
                    <Text style={s.kpiSub}>meses</Text>
                  </View>
                )}
              </View>
              {sf.con_mod40?.texto_antes && <SofiaBox tipo="verde" texto={sf.con_mod40.texto_antes} COLOR={COLOR} />}
            </>
          )}

          {/* ── TERMÓMETRO ROI ── */}
          {secVisible('gauge') && escRec && (
            <>
              <View style={s.divider} />
              <Text style={[s.secLabel, { borderLeftColor: ACCENT }]}>Termómetro de recuperación de inversión</Text>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <ChartGauge meses={escRec.roi || escRec.roi_meses || 0} ACCENT={ACCENT} />
                <View style={{ flex: 1, gap: 5 }}>
                  {[
                    { label: 'Inversión neta', val: mxn(escRec.inversion_neta || 0), color: '#B45309' },
                    { label: 'Ganancia a 80 años', val: mxn(escRec.ganancia_a80 || 0), color: COLOR },
                    { label: 'Rendimiento', val: `${escRec.tasa_rendimiento?.toFixed(1) || 0}%`, color: C.verde },
                  ].map((r, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 5, backgroundColor: C.grisCl, borderRadius: 4, borderLeftWidth: 2, borderLeftColor: r.color }}>
                      <Text style={{ fontSize: 7.5, color: C.textoSm }}>{r.label}</Text>
                      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: r.color }}>{r.val}</Text>
                    </View>
                  ))}
                </View>
              </View>
              {sf.gauge?.texto && <SofiaBox tipo="azul" texto={sf.gauge.texto} COLOR={COLOR} />}
            </>
          )}

          {/* ── LÍNEA DE TIEMPO ── */}
          {secVisible('timeline') && (
            <>
              <View style={s.divider} />
              <Text style={[s.secLabel, { borderLeftColor: ACCENT }]}>Cronograma de la estrategia</Text>
              <ChartTimeline datos={datos} escRec={escRec} COLOR={COLOR} />
              {sf.timeline?.texto && <SofiaBox tipo="azul" texto={sf.timeline.texto} COLOR={COLOR} />}
            </>
          )}

          {/* ── ÁREA FLUJOS ── */}
          {secVisible('area_flujos') && tieneMod40 && (
            <>
              <View style={s.divider} />
              <Text style={[s.secLabel, { borderLeftColor: ACCENT }]}>Proyección de flujos acumulados a los 80 años</Text>
              <ChartAreaFlujos escRec={escRec} escBase={escBase} COLOR={COLOR} />
              {sf.area_flujos?.texto && <SofiaBox tipo="verde" texto={sf.area_flujos.texto} COLOR={COLOR} />}
            </>
          )}

          {/* ── TABLA ESCENARIOS ── */}
          {(secVisible('comparativa') || secVisible('table_escenarios')) && escsMod40.length > 0 && (
            <>
              <View style={s.divider} />
              <Text style={[s.secLabel, { borderLeftColor: ACCENT }]}>Comparativa de opciones disponibles</Text>
              {sf.comparativa?.texto && <SofiaBox tipo="azul" texto={sf.comparativa.texto} COLOR={COLOR} />}
              <View style={{ marginTop: 6 }}>
                <View style={[s.tblHeader, { backgroundColor: COLOR }]}>
                  {['Escenario', 'Pensión/mes', 'Inversión', 'Se recupera en', 'Ganancia a 80 años'].map((h, i) => (
                    <Text key={i} style={[s.tblHeaderCell, { flex: i === 0 ? 2 : 1 }]}>{h}</Text>
                  ))}
                </View>
                {[escBase, ...escsMod40].slice(0, 5).map((e, i) => (
                  <View key={e.id} style={[s.tblRow, i % 2 !== 0 ? s.tblRowAlt : {}, e.recomendado ? s.tblRowRec : {}]}>
                    <Text style={[s.tblCellBold, { flex: 2 }]}>{e.recomendado ? '★ ' : ''}{e.label}</Text>
                    <Text style={[s.tblCell, { flex: 1, textAlign: 'right' }]}>{mxn(e.pension_mensual)}</Text>
                    <Text style={[s.tblCell, { flex: 1, textAlign: 'right' }]}>{e.costo_total > 0 ? mxn(e.costo_total) : '—'}</Text>
                    <Text style={[s.tblCell, { flex: 1, textAlign: 'center' }]}>{e.roi_meses > 0 ? `${e.roi_meses} m` : '—'}</Text>
                    <Text style={[s.tblCell, { flex: 1, textAlign: 'right' }]}>{e.ganancia_a80 ? mxn(e.ganancia_a80) : '—'}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── TABLA CUANTÍAS ── */}
          {secVisible('table_cuantias') && escRec && (
            <>
              <View style={s.divider} />
              <Text style={[s.secLabel, { borderLeftColor: ACCENT }]}>Desglose del cálculo de pensión</Text>
              {sf.cuantias?.texto && <SofiaBox tipo="azul" texto={sf.cuantias.texto} COLOR={COLOR} />}
              <View>
                <View style={[s.tblHeader, { backgroundColor: COLOR }]}>
                  {['Concepto', 'Anual', 'Mensual'].map((h, i) => (
                    <Text key={i} style={[s.tblHeaderCell, { flex: i === 0 ? 2 : 1 }]}>{h}</Text>
                  ))}
                </View>
                {[
                  ['Cuantía básica', escRec.cuantia_basica_anual || 0],
                  ['Incrementos anuales', escRec.incrementos_anual || 0],
                  ['Asignaciones familiares', escRec.asignaciones_anual || 0],
                  ['Pensión anual total', escRec.pension_mensual * 12],
                ].filter(([, v]) => (v as number) > 0).map(([label, val], i) => (
                  <View key={i} style={[s.tblRow, i % 2 !== 0 ? s.tblRowAlt : {}]}>
                    <Text style={[i === 3 ? s.tblCellBold : s.tblCell, { flex: 2 }]}>{label as string}</Text>
                    <Text style={[i === 3 ? s.tblCellBold : s.tblCell, { flex: 1, textAlign: 'right' }]}>{mxn(val as number)}</Text>
                    <Text style={[i === 3 ? s.tblCellBold : s.tblCell, { flex: 1, textAlign: 'right' }]}>{mxn((val as number) / 12)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── TABLA SDI ── */}
          {secVisible('table_sdi') && periodos.length > 0 && (
            <>
              <View style={s.divider} />
              <Text style={[s.secLabel, { borderLeftColor: ACCENT }]}>Historial SDI — últimas 250 semanas</Text>
              {sf.sdi?.texto && <SofiaBox tipo="azul" texto={sf.sdi.texto} COLOR={COLOR} />}
              <View>
                <View style={[s.tblHeader, { backgroundColor: '#B45309' }]}>
                  {['Período', 'Semanas', 'SDI diario', 'Peso'].map((h, i) => (
                    <Text key={i} style={[s.tblHeaderCell, { flex: i === 0 ? 2 : 1 }]}>{h}</Text>
                  ))}
                </View>
                {periodos.map((p, i) => (
                  <View key={i} style={[s.tblRow, i % 2 !== 0 ? s.tblRowAlt : {}]}>
                    <Text style={[s.tblCell, { flex: 2 }]}>{p.fecha_inicio?.slice(0, 7)} → {p.fecha_fin?.slice(0, 7)}</Text>
                    <Text style={[s.tblCell, { flex: 1, textAlign: 'right' }]}>{p.semanas}</Text>
                    <Text style={[s.tblCellBold, { flex: 1, textAlign: 'right', color: '#B45309' }]}>{mxn2(p.sdi || 0)}</Text>
                    <Text style={[s.tblCell, { flex: 1, textAlign: 'right' }]}>{p.peso?.toFixed(1)}%</Text>
                  </View>
                ))}
                <View style={[s.tblRow, { backgroundColor: COLOR }]}>
                  <Text style={[s.tblHeaderCell, { flex: 2, textAlign: 'left' }]}>Promedio ponderado</Text>
                  <Text style={[s.tblHeaderCell, { flex: 1 }]}>{periodos.reduce((s, p) => s + (p.semanas || 0), 0)}</Text>
                  <Text style={[s.tblHeaderCell, { flex: 1, fontSize: 9 }]}>{mxn2(sdiPromedio)}</Text>
                  <Text style={[s.tblHeaderCell, { flex: 1 }]}>100%</Text>
                </View>
              </View>
            </>
          )}

          {/* ── FINANCIAMIENTO ── */}
          {secVisible('financiamiento') && escRec && escRec.aportacion_banco && (
            <>
              <View style={s.divider} />
              <Text style={[s.secLabel, { borderLeftColor: ACCENT }]}>Esquema de financiamiento</Text>
              {sf.financiamiento?.texto_antes && <SofiaBox tipo="azul" texto={sf.financiamiento.texto_antes} COLOR={COLOR} />}
              <View style={s.kpiRow}>
                <View style={[s.kpi, { borderTopWidth: 2, borderTopColor: COLOR }]}>
                  <Text style={s.kpiLbl}>Banco regulado</Text>
                  <Text style={[s.kpiVal, { color: COLOR }]}>{mxn(escRec.aportacion_banco)}</Text>
                </View>
                <View style={[s.kpi, { borderTopWidth: 2, borderTopColor: C.verde }]}>
                  <Text style={s.kpiLbl}>AFORE recuperable</Text>
                  <Text style={[s.kpiVal, { color: C.verde }]}>{mxn(escRec.recuperacion_afore || 0)}</Text>
                </View>
                {cfg.kpi_por_fila >= 3 && (
                  <View style={[s.kpi, { borderTopWidth: 2, borderTopColor: ACCENT }]}>
                    <Text style={s.kpiLbl}>Tu aportación</Text>
                    <Text style={[s.kpiVal, { color: '#B45309' }]}>{mxn(escRec.aportacion_segundo_fondeo || 0)}</Text>
                  </View>
                )}
              </View>
              {sf.financiamiento?.texto_despues && <SofiaBox tipo="verde" texto={sf.financiamiento.texto_despues} COLOR={COLOR} />}
            </>
          )}

          {/* ── PRÓXIMOS PASOS ── */}
          {secVisible('proximos') && (
            <>
              <View style={s.divider} />
              <Text style={[s.secLabel, { borderLeftColor: ACCENT }]}>¿Qué sigue? Próximos pasos</Text>
              {sf.proximos_pasos?.texto && (
                <Text style={{ fontSize: 8.5, color: C.textoSm, marginBottom: 8 }}>{sf.proximos_pasos.texto}</Text>
              )}
              {(sf.proximos_pasos?.pasos || [
                'Reunir documentos: constancia de semanas (SISEC), estado de cuenta AFORE, identificación oficial y CURP.',
                tieneMod40 ? `Confirmar el monto de cotización en Modalidad 40 (${escRec?.mod40_umas} UMAs = ${mxn(escRec?.costo_mensual_mod40 || 0)}/mes).` : 'Analizar con tu asesor la mejor estrategia.',
                'Iniciar el trámite en el IMSS — tu asesor te acompaña en todo el proceso.',
              ]).map((paso: string, i: number) => (
                <View key={i} style={s.pasoRow}>
                  <View style={[s.pasoBadge, { backgroundColor: COLOR }]}>
                    <Text style={{ color: C.blanco, fontSize: 7.5, fontFamily: 'Helvetica-Bold' }}>{i + 1}</Text>
                  </View>
                  <Text style={s.pasoText}>{paso}</Text>
                </View>
              ))}
            </>
          )}

          {/* Recomendación final Sofía */}
          {sofiaOutput?.recomendacion_final && (
            <>
              <View style={s.divider} />
              <SofiaBox tipo="verde" texto={sofiaOutput.recomendacion_final} COLOR={COLOR} />
            </>
          )}

          {/* Footer */}
          <View style={s.footer}>
            <Text style={s.footerText}>{razonSocial || 'KSE Pensiones'}{asesorNombre ? ` · ${asesorNombre}` : ''}</Text>
            {cfg.footer_mostrar_disclaimer && <Text style={[s.footerText, { maxWidth: 260, textAlign: 'right' }]}>{footerTexto}</Text>}
          </View>

        </View>
      </Page>
    </Document>
  )
}

export default DiagnosticoPDF
