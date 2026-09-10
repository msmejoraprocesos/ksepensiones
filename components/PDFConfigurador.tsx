'use client'
import React from 'react'
import { PDFConfig, PDFSeccion, PDF_CONFIG_DEFAULT, mergePDFConfig } from '@/app/utils/pdf-config'

const BORDE = '#E2E8F0'

interface Props {
  config: PDFConfig
  onChange: (c: PDFConfig) => void
  // Estos vienen del Perfil — se muestran como referencia, no se editan aquí
  logoUrl?: string | null
  razonSocial?: string
  asesorNombre?: string
  encabezadoColor?: string
  encabezadoTitulo?: string
  encabezadoLogoSize?: number
}

// ── Preview HTML ────────────────────────────────────────────────────────────
function PDFPreview({ config, logoUrl, razonSocial, asesorNombre, encabezadoColor, encabezadoTitulo, encabezadoLogoSize }: {
  config: PDFConfig
  logoUrl?: string | null
  razonSocial?: string
  asesorNombre?: string
  encabezadoColor?: string
  encabezadoTitulo?: string
  encabezadoLogoSize?: number
}) {
  const PRIMARY = encabezadoColor || '#334E7B'
  const ACCENT  = config.color_acento
  const LOGO_H  = encabezadoLogoSize || 28
  const hoy     = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })

  const SecLabel = ({ text, color = PRIMARY }: { text: string; color?: string }) => (
    <div style={{ fontSize: '8px', fontWeight: '700', color, textTransform: 'uppercase', letterSpacing: '0.5px', borderLeft: `3px solid ${ACCENT}`, paddingLeft: '6px', marginBottom: '8px', marginTop: '10px' }}>
      {text}
    </div>
  )

  const KPIs = ({ items }: { items: { label: string; value: string; bg?: string; color?: string }[] }) => (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
      {items.slice(0, config.kpi_por_fila).map((k, i) => (
        <div key={i} style={{ flex: 1, background: k.bg || '#F8FAFC', border: `1px solid ${BORDE}`, borderRadius: '6px', padding: '7px', textAlign: 'center' }}>
          <div style={{ fontSize: '7px', color: '#64748B', marginBottom: '2px' }}>{k.label}</div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: k.color || '#111827' }}>{k.value}</div>
        </div>
      ))}
    </div>
  )

  const SofiaBox = ({ tipo, texto }: { tipo: 'azul' | 'amarillo' | 'verde'; texto: string }) => {
    const map = {
      azul:     { bg: '#EEF2F8', border: PRIMARY,    label: '★ Sofía explica:' },
      amarillo: { bg: '#FFFBEB', border: '#F59E0B',  label: '⚠ Sofía advierte:' },
      verde:    { bg: '#F0FDF4', border: '#16A34A',  label: '✓ Sofía recomienda:' },
    }
    const m = map[tipo]
    if (!config.mostrar_sofia) return null
    return (
      <div style={{ background: m.bg, borderLeft: `3px solid ${m.border}`, borderRadius: '0 4px 4px 0', padding: '6px 8px', marginTop: '4px', fontSize: '7.5px', color: '#374151', lineHeight: 1.5 }}>
        <strong style={{ color: m.border, display: 'block', marginBottom: '2px' }}>{m.label}</strong>
        {texto}
      </div>
    )
  }

  const secciones = [...config.secciones].sort((a, b) => a.orden - b.orden).filter(s => s.visible)

  return (
    <div style={{ background: '#F4F6FB', padding: '10px', borderRadius: '8px', fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#1E293B', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', width: '100%', position: 'relative' }}>

      {config.mostrar_watermark && (
        <div style={{ position: 'absolute', top: '32%', left: '10%', fontSize: '36px', color: '#DC2626', opacity: 0.08, fontWeight: '900', transform: 'rotate(-15deg)', pointerEvents: 'none', zIndex: 0 }}>
          BORRADOR
        </div>
      )}

      {/* Header — usa datos del Perfil */}
      <div style={{ background: PRIMARY, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderRadius: '6px 6px 0 0', position: 'relative', zIndex: 1 }}>
        <div style={{ flex: 1 }}>
          {config.header_layout !== 'solo_texto' && (
            logoUrl
              ? <img src={logoUrl} alt="" style={{ height: `${LOGO_H}px`, objectFit: 'contain', marginBottom: '5px', display: 'block' }} />
              : <div style={{ height: `${Math.round(LOGO_H * 0.7)}px`, width: '72px', background: 'rgba(255,255,255,0.18)', borderRadius: '3px', marginBottom: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '6px', color: 'rgba(255,255,255,0.5)' }}>LOGO</span>
                </div>
          )}
          <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
            {encabezadoTitulo || 'Diagnóstico Pensional'}
          </div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'white', marginBottom: '2px' }}>María González López</div>
          <div style={{ fontSize: '7.5px', color: 'rgba(255,255,255,0.75)' }}>
            {asesorNombre ? `Elaborado por: ${asesorNombre}` : razonSocial || 'KSE Pensiones'} · {hoy}
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '5px', padding: '5px 9px', textAlign: 'center', marginLeft: '10px' }}>
          <div style={{ fontSize: '6px', color: 'rgba(255,255,255,0.6)', marginBottom: '2px' }}>Régimen</div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'white' }}>Ley 73</div>
        </div>
      </div>

      {/* Línea de acento */}
      <div style={{ height: '3px', background: ACCENT }} />

      {/* Cuerpo */}
      <div style={{ background: 'white', padding: '12px 16px', borderRadius: '0 0 6px 6px', position: 'relative', zIndex: 1 }}>
        {secciones.map(sec => (
          <div key={sec.id}>

            {sec.id === 'situacion' && (
              <>
                <SecLabel text="Tu situación actual" />
                <KPIs items={[
                  { label: 'Semanas cotizadas', value: '1,659' },
                  { label: 'Edad actual', value: '57 años' },
                  { label: 'SDI promedio', value: '$518.07' },
                ]} />
                <SofiaBox tipo="azul" texto="Cuenta con 1,659 semanas cotizadas bajo Ley 73, lo que le otorga derechos pensionales sólidos que vale la pena optimizar." />
              </>
            )}

            {sec.id === 'sin_mod40' && (
              <>
                <div style={{ height: '0.5px', background: BORDE, margin: '8px 0' }} />
                <SecLabel text="Tu pensión sin Modalidad 40" />
                <KPIs items={[
                  { label: 'Pensión mensual', value: '$6,240', bg: '#FEF2F2', color: '#DC2626' },
                  { label: 'Pensión anual', value: '$74,880' },
                  { label: 'Edad de retiro', value: '60 años' },
                ]} />
                <SofiaBox tipo="amarillo" texto="Esta pensión representa tu derecho adquirido hoy. Existe una estrategia legal que puede incrementarla significativamente." />
              </>
            )}

            {sec.id === 'con_mod40' && (
              <>
                <div style={{ height: '0.5px', background: BORDE, margin: '8px 0' }} />
                <SecLabel text="Con Modalidad 40 — opción recomendada" color="#16A34A" />
                <KPIs items={[
                  { label: 'Nueva pensión', value: '$11,032', bg: '#F0FDF4', color: '#16A34A' },
                  { label: 'Mejora mensual', value: '+$4,792', bg: '#EEF2F8', color: PRIMARY },
                  { label: 'Se recupera en', value: '28 meses', bg: '#FFF7ED', color: '#C2410C' },
                ]} />
                <SofiaBox tipo="verde" texto="La inversión se recupera en 28 meses y después recibirás $4,792 adicionales cada mes de por vida." />
              </>
            )}

            {sec.id === 'comparativa' && (
              <>
                <div style={{ height: '0.5px', background: BORDE, margin: '8px 0' }} />
                <SecLabel text="Comparativa de opciones" />
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7px' }}>
                  <thead>
                    <tr style={{ background: PRIMARY }}>
                      {['Escenario','Pensión','Inversión','Recupera','A 80 años'].map((h, i) => (
                        <th key={i} style={{ color: 'white', padding: '4px 5px', fontWeight: '600', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Sin Mod. 40','$6,240','—','—','—'],
                      ['★ Esc. 1 — 6 UMAs · 24 meses','$11,032','$312,480','28 meses','$2.8M'],
                    ].map((row, ri) => (
                      <tr key={ri} style={{ background: ri === 1 ? '#F0FDF4' : 'white', borderBottom: `0.5px solid ${BORDE}` }}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{ padding: '4px 5px', textAlign: ci === 0 ? 'left' : 'right', fontWeight: ci === 0 ? '600' : '400', color: ri === 1 ? '#16A34A' : '#374151' }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {sec.id === 'proximos' && (
              <>
                <div style={{ height: '0.5px', background: BORDE, margin: '8px 0' }} />
                <SecLabel text="¿Qué sigue? Próximos pasos" />
                {['Reunir documentos: constancia de semanas, AFORE e identificación.',
                  'Confirmar monto de cotización Mod. 40 (6 UMAs = $5,865/mes).',
                  'Iniciar el trámite en el IMSS — tu asesor te acompaña.']
                  .map((paso, i) => (
                    <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '5px' }}>
                      <div style={{ width: '13px', height: '13px', background: PRIMARY, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: 'white', fontSize: '6.5px', fontWeight: '700' }}>{i + 1}</span>
                      </div>
                      <span style={{ fontSize: '7.5px', color: '#374151', lineHeight: 1.4, paddingTop: '1px' }}>{paso}</span>
                    </div>
                  ))}
              </>
            )}

            {sec.id === 'periodos' && (
              <>
                <div style={{ height: '0.5px', background: BORDE, margin: '8px 0' }} />
                <SecLabel text="Historial salarial — SDI últimas 250 semanas" />
                <div style={{ fontSize: '7px', color: '#64748B', padding: '6px 8px', background: '#F8FAFC', borderRadius: '4px' }}>
                  Tabla de períodos cotizados con SDI por período y peso ponderado
                </div>
              </>
            )}

            {sec.id === 'financiamiento' && (
              <>
                <div style={{ height: '0.5px', background: BORDE, margin: '8px 0' }} />
                <SecLabel text="Esquema de financiamiento" />
                <div style={{ fontSize: '7px', color: '#64748B', padding: '6px 8px', background: '#F8FAFC', borderRadius: '4px' }}>
                  Distribución banco / AFORE / cuenta propia y cuota mensual del crédito
                </div>
              </>
            )}

          </div>
        ))}

        {/* Footer */}
        <div style={{ borderTop: `0.5px solid ${BORDE}`, marginTop: '10px', paddingTop: '7px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '6.5px', color: '#64748B' }}>
            {razonSocial || 'KSE Pensiones'}{asesorNombre ? ` · ${asesorNombre}` : ''}
          </span>
          {config.footer_mostrar_disclaimer && (
            <span style={{ fontSize: '6.5px', color: '#64748B', maxWidth: '200px', textAlign: 'right' }}>
              {config.footer_texto || 'Este diagnóstico es informativo y no constituye asesoría legal.'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Configurador ─────────────────────────────────────────────────────────────
export default function PDFConfigurador({ config, onChange, logoUrl, razonSocial, asesorNombre, encabezadoColor, encabezadoTitulo, encabezadoLogoSize }: Props) {
  const set = (partial: Partial<PDFConfig>) => onChange({ ...config, ...partial })

  const toggleSec = (id: string) => onChange({
    ...config,
    secciones: config.secciones.map(s => s.id === id ? { ...s, visible: !s.visible } : s),
  })

  const moverSec = (id: string, dir: -1 | 1) => {
    const sorted = [...config.secciones].sort((a, b) => a.orden - b.orden)
    const idx = sorted.findIndex(s => s.id === id)
    const nIdx = idx + dir
    if (nIdx < 0 || nIdx >= sorted.length) return
    const newSecs = sorted.map((s, i) => {
      if (i === idx) return { ...s, orden: sorted[nIdx].orden }
      if (i === nIdx) return { ...s, orden: sorted[idx].orden }
      return s
    })
    onChange({ ...config, secciones: newSecs })
  }

  const label: React.CSSProperties = { fontSize: '10px', fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '7px' }

  const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ background: 'white', borderRadius: '10px', border: `1px solid ${BORDE}`, overflow: 'hidden', marginBottom: '10px' }}>
      <div style={{ padding: '9px 14px', background: '#F8FAFC', borderBottom: `1px solid ${BORDE}` }}>
        <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>{title}</span>
      </div>
      <div style={{ padding: '12px 14px' }}>{children}</div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px', alignItems: 'start' }}>

      {/* ── Controles ── */}
      <div>
        {/* Heredado del Perfil — solo lectura */}
        <Panel title="📌 Datos del Perfil (heredados)">
          <p style={{ fontSize: '11px', color: '#64748B', margin: '0 0 10px', lineHeight: 1.5 }}>
            Estos valores se configuran en el tab <strong>Perfil</strong> y se aplican automáticamente al PDF.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[
              { label: 'Logo', value: logoUrl ? '✓ Subido' : 'Sin logo' },
              { label: 'Empresa', value: razonSocial || '—' },
              { label: 'Asesor', value: asesorNombre || '—' },
              { label: 'Color del header', value: encabezadoColor || '#334E7B', isColor: true },
              { label: 'Título', value: encabezadoTitulo || 'Diagnóstico Pensional' },
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: '#F8FAFC', borderRadius: '5px' }}>
                <span style={{ fontSize: '10px', color: '#64748B' }}>{f.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {(f as any).isColor && (
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: f.value, border: `1px solid ${BORDE}` }} />
                  )}
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#374151' }}>{f.value}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Color de acento */}
        <Panel title="🎨 Color de acento">
          <label style={label}>Línea, barras y KPIs destacados</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="color" value={config.color_acento} onChange={e => set({ color_acento: e.target.value })}
              style={{ width: '44px', height: '36px', border: `1px solid ${BORDE}`, borderRadius: '6px', cursor: 'pointer', padding: '2px' }} />
            <input type="text" value={config.color_acento} onChange={e => set({ color_acento: e.target.value })}
              style={{ flex: 1, height: '36px', border: `1px solid ${BORDE}`, borderRadius: '6px', padding: '0 10px', fontSize: '12px', fontFamily: 'inherit' }} />
          </div>
          <p style={{ fontSize: '10px', color: '#94A3B8', margin: '6px 0 0' }}>
            Por default naranja — complementa el azul del header
          </p>
        </Panel>

        {/* Secciones */}
        <Panel title="📋 Secciones y orden">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[...config.secciones].sort((a, b) => a.orden - b.orden).map((sec, i, arr) => (
              <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', background: sec.visible ? '#F0F7F4' : '#F8FAFC', borderRadius: '6px', border: `1px solid ${sec.visible ? '#86EFAC' : BORDE}` }}>
                <input type="checkbox" checked={sec.visible} onChange={() => toggleSec(sec.id)} style={{ cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '11px', color: sec.visible ? '#374151' : '#94A3B8', fontWeight: sec.visible ? '500' : '400' }}>{sec.label}</span>
                <div style={{ display: 'flex', gap: '2px' }}>
                  {[{ d: -1, s: '↑' }, { d: 1, s: '↓' }].map(({ d, s }) => (
                    <button key={d} onClick={() => moverSec(sec.id, d as -1|1)}
                      disabled={(d === -1 && i === 0) || (d === 1 && i === arr.length - 1)}
                      style={{ width: '20px', height: '20px', border: `1px solid ${BORDE}`, borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '10px', opacity: (d === -1 && i === 0) || (d === 1 && i === arr.length - 1) ? 0.3 : 1, fontFamily: 'inherit' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Opciones */}
        <Panel title="⚙ Opciones de contenido">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', marginBottom: '12px' }}>
            {[
              { label: 'Mostrar cajas de análisis Sofía IA', key: 'mostrar_sofia' as const },
              { label: 'Watermark "BORRADOR" en PDFs no autorizados', key: 'mostrar_watermark' as const },
              { label: 'Mostrar disclaimer legal en footer', key: 'footer_mostrar_disclaimer' as const },
              { label: 'Salto de página antes de "Con Mod. 40"', key: 'pagina_break_antes_mod40' as const },
            ].map(f => (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={config[f.key] as boolean} onChange={e => set({ [f.key]: e.target.checked })}
                  style={{ width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#374151' }}>{f.label}</span>
              </label>
            ))}
          </div>

          <label style={label}>KPIs por fila</label>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {([2, 3] as const).map(n => (
              <button key={n} onClick={() => set({ kpi_por_fila: n })}
                style={{ flex: 1, padding: '7px', border: `1.5px solid ${config.kpi_por_fila === n ? '#334E7B' : BORDE}`, borderRadius: '7px', background: config.kpi_por_fila === n ? '#334E7B' : 'white', color: config.kpi_por_fila === n ? 'white' : '#374151', cursor: 'pointer', fontSize: '12px', fontWeight: '600', fontFamily: 'inherit' }}>
                {n} por fila
              </button>
            ))}
          </div>

          <label style={label}>Posición del logo</label>
          <select value={config.header_layout} onChange={e => set({ header_layout: e.target.value as any })}
            style={{ width: '100%', height: '38px', border: `1px solid ${BORDE}`, borderRadius: '7px', padding: '0 10px', fontSize: '12px', fontFamily: 'inherit' }}>
            <option value="logo_izquierda">Logo a la izquierda (default)</option>
            <option value="logo_derecha">Logo a la derecha</option>
            <option value="solo_texto">Solo texto, sin logo</option>
          </select>
        </Panel>

        {/* Footer */}
        <Panel title="📝 Texto del footer">
          <label style={label}>Disclaimer personalizado (vacío = texto default)</label>
          <textarea value={config.footer_texto} onChange={e => set({ footer_texto: e.target.value })} rows={2}
            placeholder="Este diagnóstico es informativo y no constituye asesoría legal."
            style={{ width: '100%', border: `1px solid ${BORDE}`, borderRadius: '7px', padding: '7px 10px', fontSize: '11px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
        </Panel>
      </div>

      {/* ── Preview ── */}
      <div style={{ position: 'sticky' as const, top: '80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '10px', fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vista previa del PDF</span>
          <span style={{ background: '#F0FDF4', color: '#16A34A', padding: '2px 7px', borderRadius: '4px', fontSize: '9px', fontWeight: '600' }}>Tiempo real</span>
        </div>
        <PDFPreview
          config={config}
          logoUrl={logoUrl}
          razonSocial={razonSocial}
          asesorNombre={asesorNombre}
          encabezadoColor={encabezadoColor}
          encabezadoTitulo={encabezadoTitulo}
          encabezadoLogoSize={encabezadoLogoSize}
        />
        <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '8px', textAlign: 'center' }}>
          Vista aproximada — el PDF final puede variar ligeramente en fuentes y espaciado
        </p>
      </div>
    </div>
  )
}
