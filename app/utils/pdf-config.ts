// ── KSE Pensiones — Configurador de PDF ──────────────────────────────────
//
// DIVISIÓN DE RESPONSABILIDADES:
//
// ▸ PERFIL del asesor (tab "Perfil" en /configuracion):
//     logo_url, razon_social, nombre, encabezado_color, encabezado_titulo,
//     encabezado_logo_size, encabezado_font_size
//   → El PDF los usa directamente. No se duplican aquí.
//
// ▸ PDF CONFIG (tab "PDF" en /configuracion) — solo lo que NO existe en Perfil:
//     color_acento, secciones, opciones de contenido, footer, saltos de pág.

export interface PDFSeccion {
  id: string
  label: string
  visible: boolean
  orden: number
}

export interface PDFConfig {
  // Color de acento (línea naranja, barras de KPI) — no está en Perfil
  color_acento: string
  // Secciones: visibilidad y orden
  secciones: PDFSeccion[]
  // Opciones de contenido
  mostrar_sofia: boolean
  mostrar_watermark: boolean
  kpi_por_fila: 2 | 3
  pagina_break_antes_mod40: boolean
  // Header layout
  header_layout: 'logo_izquierda' | 'logo_derecha' | 'solo_texto'
  // Footer
  footer_texto: string
  footer_mostrar_disclaimer: boolean
}

export const PDF_SECCIONES_DEFAULT: PDFSeccion[] = [
  { id: 'situacion',      label: 'Situación actual',        visible: true,  orden: 1 },
  { id: 'sin_mod40',      label: 'Pensión sin Mod. 40',     visible: true,  orden: 2 },
  { id: 'con_mod40',      label: 'Con Modalidad 40',        visible: true,  orden: 3 },
  { id: 'comparativa',    label: 'Comparativa de opciones', visible: true,  orden: 4 },
  { id: 'proximos',       label: 'Próximos pasos',          visible: true,  orden: 5 },
  { id: 'periodos',       label: 'Historial SDI (tabla)',   visible: false, orden: 6 },
  { id: 'financiamiento', label: 'Financiamiento',          visible: false, orden: 7 },
]

export const PDF_CONFIG_DEFAULT: PDFConfig = {
  color_acento:              '#E8622C',   // acento del sistema de diseño
  secciones:                 PDF_SECCIONES_DEFAULT,
  mostrar_sofia:             true,
  mostrar_watermark:         true,
  kpi_por_fila:              3,
  pagina_break_antes_mod40:  true,
  header_layout:             'logo_izquierda',
  footer_texto:              '',
  footer_mostrar_disclaimer: true,
}

export function mergePDFConfig(saved: Partial<PDFConfig> | null | undefined): PDFConfig {
  if (!saved) return PDF_CONFIG_DEFAULT
  return {
    ...PDF_CONFIG_DEFAULT,
    ...saved,
    secciones: saved.secciones
      ? PDF_SECCIONES_DEFAULT.map(def => {
          const found = saved.secciones!.find(s => s.id === def.id)
          return found ? { ...def, ...found } : def
        })
      : PDF_CONFIG_DEFAULT.secciones,
  }
}
