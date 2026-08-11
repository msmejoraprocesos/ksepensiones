// DiagnosticoPDF.tsx — KSE Pensiones v2
// Diseño continuo — fluye como un reporte, sin saltos de página forzados

import React from 'react'
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface DatosTrabajador {
  nombre?: string; nombre_trabajador?: string; nss?: string; ley?: string
  edad_actual?: number; semanas_totales?: number; fecha_calculo?: string
  fecha_nacimiento?: string; tiene_conyuge?: boolean; num_hijos?: number; num_padres?: number
}
interface Escenario {
  id: string; label: string; descripcion?: string; pension_base?: number
  pension_mensual: number; costo_total: number; inversion_neta?: number
  recuperacion_afore?: number; costo_mensual_mod40: number; incremento_vs_base: number
  roi_meses: number; mod40_meses: number; mod40_umas: number
  cuantia_basica_anual?: number; incrementos_anual?: number; asignaciones_anual?: number
  ayuda_asistencial_anual?: number; recomendado?: boolean; ganancia_a80?: number
  tasa_rendimiento?: number; aguinaldo_anual?: number; fecha_ingreso_mod40?: string
  fecha_baja_mod40?: string; edad_retiro?: number; pension_inmediata?: number
  pension_al_liquidar?: number; descuento_mensual?: number; roi_financiado?: number
  ganancia_a80_financiado?: number; tasa_rendimiento_financiado?: number
  semanas_mod40?: number; actualizaciones?: number; recargos?: number
  duracion_tramite_meses?: number; plazo_segundo_fondeo?: number
  costo_financiamiento_banco?: number; monto_maximo_pago?: number
}
interface Periodo { fecha_inicio?: string; fecha_fin?: string; semanas?: number; sdi?: number; peso?: number }
interface SeccionAnalisis { titulo: string; contenido: string }
interface PDFProps {
  datos: DatosTrabajador; periodos: Periodo[]; sdiPromedio: number; escenarios: Escenario[]
  escSelIdx: number; analisis: SeccionAnalisis[]; ingresoObjetivo?: number
  logoUrl?: string; razonSocial?: string; asesorNombre?: string
  encabezadoColor?: string; encabezadoTitulo?: string; esBorrador?: boolean; umaDiaria?: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const C = { azul: '#1B3A6B', naranja: '#F05B21', verde: '#16A34A', rojo: '#DC2626',
  gris: '#64748b', grisCl: '#F4F6FB', blanco: '#FFFFFF', texto: '#1e293b',
  textoSm: '#64748b', borde: '#e2e8f0', amarillo: '#FFF7ED', azulCl: '#EEF2F8' }

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.texto, paddingTop: 0, paddingBottom: 32, paddingHorizontal: 0, backgroundColor: '#F4F6FB' },
  watermark: { position: 'absolute', top: '38%', left: '8%', fontSize: 68, fontFamily: 'Helvetica-Bold', color: '#DC2626', opacity: 0.07 },
  // Header azul
  header: { backgroundColor: C.azul, paddingVertical: 20, paddingHorizontal: 28, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flex: 1 },
  headerLabel: { fontSize: 7, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  headerName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.blanco, marginBottom: 3 },
  headerSub: { fontSize: 9, color: 'rgba(255,255,255,0.75)' },
  headerBadge: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  headerBadgeLabel: { fontSize: 7, color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  headerBadgeValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.blanco },
  // Naranja divider
  dividerNaranja: { height: 3, backgroundColor: C.naranja },
  // Body container
  body: { paddingHorizontal: 24, paddingTop: 20 },
  // Sección
  seccionLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.azul, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: C.naranja },
  seccionLabelVerde: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.verde, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: C.verde },
  divider: { height: 0.5, backgroundColor: C.borde, marginVertical: 16 },
  // KPI cards
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  kpiCard: { flex: 1, backgroundColor: C.blanco, borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: C.borde },
  kpiCardRojo: { flex: 1, backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: '#FCA5A5' },
  kpiCardVerde: { flex: 1, backgroundColor: '#F0FDF4', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: '#86EFAC', borderTopWidth: 3, borderTopColor: C.verde },
  kpiCardAzul: { flex: 1, backgroundColor: C.azulCl, borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: '#B5D4F4', borderTopWidth: 3, borderTopColor: C.azul },
  kpiCardNaranja: { flex: 1, backgroundColor: '#FFF7ED', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 0.5, borderColor: '#FED7AA', borderTopWidth: 3, borderTopColor: C.naranja },
  kpiLabel: { fontSize: 7, color: C.textoSm, marginBottom: 3, textAlign: 'center' },
  kpiLabelRojo: { fontSize: 7, color: C.rojo, marginBottom: 3, textAlign: 'center' },
  kpiLabelVerde: { fontSize: 7, color: C.verde, marginBottom: 3, textAlign: 'center' },
  kpiLabelAzul: { fontSize: 7, color: C.azul, marginBottom: 3, textAlign: 'center' },
  kpiLabelNaranja: { fontSize: 7, color: '#C2410C', marginBottom: 3, textAlign: 'center' },
  kpiValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.texto, textAlign: 'center' },
  kpiValueRojo: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.rojo, textAlign: 'center' },
  kpiValueVerde: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.verde, textAlign: 'center' },
  kpiValueAzul: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.azul, textAlign: 'center' },
  kpiValueNaranja: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#C2410C', textAlign: 'center' },
  kpiSub: { fontSize: 7, color: C.textoSm, textAlign: 'center', marginTop: 2 },
  // Info row
  infoRow: { flexDirection: 'row', backgroundColor: C.blanco, borderRadius: 6, padding: 8, marginBottom: 8, borderWidth: 0.5, borderColor: C.borde },
  infoCell: { flex: 1 },
  infoLabel: { fontSize: 6.5, color: C.textoSm, textTransform: 'uppercase', marginBottom: 2 },
  infoValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.texto },
  // Caja Sofia
  sofiaBox: { borderRadius: 6, padding: 10, marginTop: 8, marginBottom: 2, flexDirection: 'row', gap: 6 },
  sofiaBoxAzul: { backgroundColor: C.azulCl, borderLeftWidth: 3, borderLeftColor: C.azul },
  sofiaBoxAmarillo: { backgroundColor: '#FFFBEB', borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  sofiaBoxVerde: { backgroundColor: '#F0FDF4', borderLeftWidth: 3, borderLeftColor: C.verde },
  sofiaLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.azul, marginBottom: 3 },
  sofiaLabelAmarillo: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400E', marginBottom: 3 },
  sofiaLabelVerde: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#15803D', marginBottom: 3 },
  sofiaText: { fontSize: 8.5, color: C.texto, lineHeight: 1.6 },
  // Paso numerado
  pasoRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  pasoBadge: { backgroundColor: C.azul, borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pasoBadgeText: { color: C.blanco, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  pasoText: { flex: 1, fontSize: 9, color: C.texto, lineHeight: 1.5, paddingTop: 2 },
  // Tabla escenarios
  tableHeader: { flexDirection: 'row', backgroundColor: C.azul, borderRadius: 4, marginBottom: 0 },
  tableHeaderCell: { color: C.blanco, fontSize: 7, fontFamily: 'Helvetica-Bold', paddingVertical: 6, paddingHorizontal: 6, textAlign: 'center' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.borde, backgroundColor: C.blanco },
  tableRowEven: { backgroundColor: C.grisCl },
  tableCell: { fontSize: 8, paddingVertical: 5, paddingHorizontal: 6, color: C.texto },
  tableCellBold: { fontSize: 8, paddingVertical: 5, paddingHorizontal: 6, fontFamily: 'Helvetica-Bold', color: C.azul },
  // Footer
  footer: { paddingHorizontal: 24, paddingTop: 16, borderTopWidth: 0.5, borderTopColor: C.borde, flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  footerText: { fontSize: 7, color: C.textoSm },
})

// ─── Helper: sección Sofia ─────────────────────────────────────────────────
const SofiaBox = ({ tipo, texto }: { tipo: 'azul' | 'amarillo' | 'verde', texto: string }) => {
  const boxStyle = tipo === 'azul' ? s.sofiaBoxAzul : tipo === 'amarillo' ? s.sofiaBoxAmarillo : s.sofiaBoxVerde
  const labelStyle = tipo === 'azul' ? s.sofiaLabel : tipo === 'amarillo' ? s.sofiaLabelAmarillo : s.sofiaLabelVerde
  const labelText = tipo === 'azul' ? '★ Sofía explica:' : tipo === 'amarillo' ? '⚠ Sofía advierte:' : '✓ Sofía recomienda:'
  return (
    <View style={[s.sofiaBox, boxStyle]}>
      <View style={{ flex: 1 }}>
        <Text style={labelStyle}>{labelText}</Text>
        <Text style={s.sofiaText}>{texto}</Text>
      </View>
    </View>
  )
}

// ─── Documento principal ───────────────────────────────────────────────────
export const DiagnosticoPDF = ({
  datos, periodos, sdiPromedio, escenarios, escSelIdx, analisis,
  ingresoObjetivo, logoUrl, razonSocial, asesorNombre, encabezadoColor,
  encabezadoTitulo, esBorrador, umaDiaria,
}: PDFProps) => {
  const COLOR = encabezadoColor ?? C.azul
  const esc0 = escenarios[0]
  const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escSelIdx] ?? escenarios[escenarios.length - 1]
  const nombre = datos.nombre_trabajador || datos.nombre || 'Cliente'
  const hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
  const semanasBase = datos.semanas_totales || 0
  const edadAnios = Math.floor(datos.edad_actual || 0)

  // Buscar secciones de análisis de Sofía
  const getAnalisis = (key: string) => {
    const map: Record<string, string[]> = {
      contexto: ['Contexto', 'contexto'],
      diagnostico: ['Diagnóstico', 'diagnostico', 'Diagnóstico actual'],
      opciones: ['Opciones', 'opciones', 'Opciones disponibles'],
      recomendacion: ['Recomendación', 'recomendacion', 'Recomendación'],
      proximos: ['Próximos pasos', 'proximos_pasos', 'Próximos pasos'],
    }
    const keys = map[key] || [key]
    const sec = analisis.find(a => keys.some(k => a.titulo?.toLowerCase().includes(k.toLowerCase())))
    return sec?.contenido || ''
  }

  const contexto = getAnalisis('contexto')
  const diagnosticoIA = getAnalisis('diagnostico')
  const opcionesIA = getAnalisis('opciones')
  const recomendacionIA = getAnalisis('recomendacion')
  const proximosIA = getAnalisis('proximos')

  const tieneIA = analisis.length > 0
  const mejora = escRec && esc0 ? escRec.pension_mensual - esc0.pension_mensual : 0
  const tieneMod40 = escRec && escRec.mod40_meses > 0

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {esBorrador && <Text style={s.watermark}>BORRADOR</Text>}

        {/* ── ENCABEZADO ─────────────────────────────────────────── */}
        <View style={[s.header, { backgroundColor: COLOR }]}>
          <View style={s.headerLeft}>
            {logoUrl && <Image src={logoUrl} style={{ width: 80, height: 24, objectFit: 'contain', marginBottom: 8 }} />}
            <Text style={s.headerLabel}>{encabezadoTitulo || 'Diagnóstico Pensional'}</Text>
            <Text style={s.headerName}>{nombre}</Text>
            <Text style={s.headerSub}>
              {asesorNombre ? `Elaborado por: ${asesorNombre}` : razonSocial || ''}{' '}· {hoy}
            </Text>
          </View>
          <View style={{ gap: 6, alignItems: 'flex-end' }}>
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeLabel}>Régimen</Text>
              <Text style={s.headerBadgeValue}>{datos.ley || 'Ley 73'}</Text>
            </View>
            {esBorrador && (
              <View style={[s.headerBadge, { backgroundColor: 'rgba(220,38,38,0.3)' }]}>
                <Text style={[s.headerBadgeValue, { fontSize: 8 }]}>BORRADOR</Text>
              </View>
            )}
          </View>
        </View>
        <View style={s.dividerNaranja} />

        {/* ── CUERPO ─────────────────────────────────────────────── */}
        <View style={s.body}>

          {/* ── BLOQUE 1: Tu situación actual ── */}
          <Text style={s.seccionLabel}>Tu situación actual</Text>
          <View style={s.kpiRow}>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Semanas cotizadas</Text>
              <Text style={s.kpiValue}>{semanasBase.toLocaleString('es-MX')}</Text>
              <Text style={s.kpiSub}>{Math.round(semanasBase / 52)} años de cotización</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Edad actual</Text>
              <Text style={s.kpiValue}>{edadAnios}</Text>
              <Text style={s.kpiSub}>años</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>SDI diario prom. 250 sem.</Text>
              <Text style={s.kpiValue}>{mxn(sdiPromedio)}</Text>
              <Text style={s.kpiSub}>últimas 250 semanas</Text>
            </View>
          </View>
          {tieneIA && contexto ? (
            <SofiaBox tipo="azul" texto={contexto} />
          ) : (
            <View style={[s.sofiaBox, s.sofiaBoxAzul]}>
              <View style={{ flex: 1 }}>
                <Text style={s.sofiaText}>
                  Cuenta con {semanasBase.toLocaleString('es-MX')} semanas cotizadas al IMSS
                  ({Math.round(semanasBase / 52)} años de historia laboral) bajo {datos.ley || 'Ley 73'},
                  lo que le otorga derechos pensionales sólidos que vale la pena optimizar.
                </Text>
              </View>
            </View>
          )}

          <View style={s.divider} />

          {/* ── BLOQUE 2: Tu pensión sin hacer nada ── */}
          <Text style={s.seccionLabel}>Tu pensión si te pensionas hoy (sin Modalidad 40)</Text>
          <View style={s.kpiRow}>
            <View style={s.kpiCardRojo}>
              <Text style={s.kpiLabelRojo}>Pensión mensual estimada</Text>
              <Text style={s.kpiValueRojo}>{mxn(esc0?.pension_mensual || 0)}</Text>
              <Text style={s.kpiSub}>por mes de 30 días</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Pensión anual</Text>
              <Text style={s.kpiValue}>{mxn((esc0?.pension_mensual || 0) * 12)}</Text>
              <Text style={s.kpiSub}>al año</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Edad de retiro</Text>
              <Text style={s.kpiValue}>{esc0?.edad_retiro?.toFixed(0) || edadAnios}</Text>
              <Text style={s.kpiSub}>años</Text>
            </View>
          </View>
          {tieneIA && diagnosticoIA ? (
            <SofiaBox tipo="amarillo" texto={diagnosticoIA} />
          ) : (
            <View style={[s.sofiaBox, s.sofiaBoxAmarillo]}>
              <View style={{ flex: 1 }}>
                <Text style={s.sofiaText}>
                  Esta pensión representa tu derecho adquirido hoy. Sin embargo, existe una estrategia legal
                  que puede incrementarla significativamente: la Modalidad 40 del IMSS.
                </Text>
              </View>
            </View>
          )}

          {/* ── BLOQUE 3: Con Modalidad 40 (si aplica) ── */}
          {tieneMod40 && (
            <>
              <View style={s.divider} />
              <Text style={s.seccionLabelVerde}>Con Modalidad 40 — opción recomendada</Text>
              <View style={s.kpiRow}>
                <View style={s.kpiCardVerde}>
                  <Text style={s.kpiLabelVerde}>Nueva pensión mensual</Text>
                  <Text style={s.kpiValueVerde}>{mxn(escRec?.pension_mensual || 0)}</Text>
                  <Text style={s.kpiSub}>por mes de 30 días</Text>
                </View>
                <View style={s.kpiCardAzul}>
                  <Text style={s.kpiLabelAzul}>Mejora mensual</Text>
                  <Text style={s.kpiValueAzul}>+{mxn(mejora)}</Text>
                  <Text style={s.kpiSub}>más cada mes</Text>
                </View>
                <View style={s.kpiCardNaranja}>
                  <Text style={s.kpiLabelNaranja}>Se recupera en</Text>
                  <Text style={s.kpiValueNaranja}>{Math.round(escRec?.roi_meses || 0)}</Text>
                  <Text style={s.kpiSub}>meses</Text>
                </View>
              </View>

              {/* Detalle inversión */}
              <View style={[s.infoRow, { marginBottom: 10 }]}>
                {[
                  { label: 'Cotización en Mod. 40', val: `${escRec?.mod40_umas} UMAs · ${Math.round(escRec?.mod40_meses || 0)} meses` },
                  { label: 'Inversión total', val: mxn(escRec?.costo_total || 0) },
                  { label: 'Recuperación AFORE', val: mxn(escRec?.recuperacion_afore || 0) },
                  { label: 'Costo real neto', val: mxn(escRec?.inversion_neta || 0) },
                ].map((item, i) => (
                  <View key={i} style={s.infoCell}>
                    <Text style={s.infoLabel}>{item.label}</Text>
                    <Text style={s.infoValue}>{item.val}</Text>
                  </View>
                ))}
              </View>

              {tieneIA && recomendacionIA ? (
                <SofiaBox tipo="verde" texto={recomendacionIA} />
              ) : (
                <View style={[s.sofiaBox, s.sofiaBoxVerde]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sofiaText}>
                      La Modalidad 40 es la estrategia más eficiente para mejorar tu pensión.
                      La inversión se recupera en {Math.round(escRec?.roi_meses || 0)} meses y
                      después recibirás {mxn(mejora)} adicionales cada mes de por vida.
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}

          {/* ── BLOQUE 4: Comparativa de escenarios ── */}
          {escenarios.length > 1 && (
            <>
              <View style={s.divider} />
              <Text style={s.seccionLabel}>Comparativa de opciones disponibles</Text>
              {tieneIA && opcionesIA && <SofiaBox tipo="azul" texto={opcionesIA} />}
              <View style={{ marginTop: 8 }}>
                <View style={s.tableHeader}>
                  {['Escenario', 'Pensión mensual', 'Inversión total', 'Se recupera en', 'Pensión hasta los 80'].map((h, i) => (
                    <Text key={i} style={[s.tableHeaderCell, { flex: i === 0 ? 2 : 1 }]}>{h}</Text>
                  ))}
                </View>
                {escenarios.filter(e => e.id !== 'e0' || true).slice(0, 6).map((e, i) => (
                  <View key={e.id} style={[s.tableRow, i % 2 !== 0 ? s.tableRowEven : {}, e.recomendado ? { backgroundColor: '#F0FDF4' } : {}]}>
                    <Text style={[s.tableCellBold, { flex: 2 }]}>{e.recomendado ? '★ ' : ''}{e.label}</Text>
                    <Text style={[s.tableCell, { flex: 1, textAlign: 'right' }]}>{mxn(e.pension_mensual)}</Text>
                    <Text style={[s.tableCell, { flex: 1, textAlign: 'right' }]}>{e.costo_total > 0 ? mxn(e.costo_total) : '—'}</Text>
                    <Text style={[s.tableCell, { flex: 1, textAlign: 'center' }]}>{e.roi_meses > 0 ? `${Math.round(e.roi_meses)} meses` : '—'}</Text>
                    <Text style={[s.tableCell, { flex: 1, textAlign: 'right' }]}>{e.ganancia_a80 ? mxn(e.ganancia_a80) : '—'}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── BLOQUE 5: Próximos pasos ── */}
          <View style={s.divider} />
          <Text style={s.seccionLabel}>¿Qué sigue? Próximos pasos</Text>
          {tieneIA && proximosIA ? (
            <>
              <SofiaBox tipo="verde" texto={proximosIA} />
            </>
          ) : (
            <>
              {[
                'Reunir documentos: constancia de semanas (SISEC), estado de cuenta AFORE, identificación oficial vigente y CURP.',
                tieneMod40 ? `Confirmar el monto de cotización en Modalidad 40 (${escRec?.mod40_umas} UMAs = ${mxn(escRec?.costo_mensual_mod40 || 0)}/mes) según tu capacidad de pago.` : 'Analizar con tu asesor la mejor estrategia para maximizar tu pensión.',
                'Iniciar el trámite en el IMSS — tu asesor te acompaña en todo el proceso.',
              ].map((paso, i) => (
                <View key={i} style={s.pasoRow}>
                  <View style={s.pasoBadge}><Text style={s.pasoBadgeText}>{i + 1}</Text></View>
                  <Text style={s.pasoText}>{paso}</Text>
                </View>
              ))}
            </>
          )}

          {/* ── FOOTER ── */}
          <View style={s.footer}>
            <Text style={s.footerText}>
              {razonSocial || 'KSE Pensiones'}{asesorNombre ? ` · ${asesorNombre}` : ''}
            </Text>
            <Text style={s.footerText}>
              Este diagnóstico es informativo y no constituye asesoría legal o garantía de montos.
            </Text>
          </View>

        </View>
      </Page>
    </Document>
  )
}

export default DiagnosticoPDF
