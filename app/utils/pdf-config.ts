// ── KSE Pensiones — Tipos y defaults del configurador de PDF ──────────────

export interface PDFSeccion {
  id: string
  label: string
  visible: boolean
  orden: number
}

export interface PDFConfig {
  secciones: PDFSeccion[]
  color_primario: string
  color_acento: string
  color_texto_header: string
  mostrar_sofia: boolean
  mostrar_logo: boolean
  mostrar_comparativa: boolean
  mostrar_watermark: boolean
  footer_texto: string
  footer_mostrar_disclaimer: boolean
  logo_size: 'pequeño' | 'mediano' | 'grande'
  header_layout: 'logo_izquierda' | 'logo_derecha' | 'solo_texto'
  kpi_por_fila: 2 | 3
  pagina_break_antes_mod40: boolean
}

export const PDF_SECCIONES_DEFAULT: PDFSeccion[] = [
  { id: 'situacion',   label: 'Situación actual',        visible: true,  orden: 1 },
  { id: 'sin_mod40',   label: 'Pensión sin Mod. 40',     visible: true,  orden: 2 },
  { id: 'con_mod40',   label: 'Con Modalidad 40',        visible: true,  orden: 3 },
  { id: 'comparativa', label: 'Comparativa de opciones', visible: true,  orden: 4 },
  { id: 'proximos',    label: 'Próximos pasos',          visible: true,  orden: 5 },
  { id: 'periodos',    label: 'Historial SDI (tabla)',   visible: false, orden: 6 },
  { id: 'financiamiento', label: 'Financiamiento',       visible: false, orden: 7 },
]

export const PDF_CONFIG_DEFAULT: PDFConfig = {
  secciones: PDF_SECCIONES_DEFAULT,
  color_primario: '#334E7B',
  color_acento: '#E8724A',
  color_texto_header: '#FFFFFF',
  mostrar_sofia: true,
  mostrar_logo: true,
  mostrar_comparativa: true,
  mostrar_watermark: true,
  footer_texto: '',
  footer_mostrar_disclaimer: true,
  logo_size: 'mediano',
  header_layout: 'logo_izquierda',
  kpi_por_fila: 3,
  pagina_break_antes_mod40: true,
}

export function mergePDFConfig(saved: Partial<PDFConfig> | null | undefined): PDFConfig {
  if (!saved) return PDF_CONFIG_DEFAULT
  return {
    ...PDF_CONFIG_DEFAULT,
    ...saved,
    secciones: saved.secciones
      ? PDF_SECCIONES_DEFAULT.map(def => {
          const saved_sec = saved.secciones!.find(s => s.id === def.id)
          return saved_sec ? { ...def, ...saved_sec } : def
        })
      : PDF_CONFIG_DEFAULT.secciones,
  }
}
