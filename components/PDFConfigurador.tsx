'use client'
import React, { useState } from 'react'
import { PDFConfig, PDFSeccion, PDF_CONFIG_DEFAULT, mergePDFConfig } from '@/app/utils/pdf-config'

const BORDE = '#E2E8F0'

interface Props {
  config: PDFConfig
  onChange: (c: PDFConfig) => void
  logoUrl?: string | null
  asesorNombre?: string
  razonSocial?: string
}

// ── Preview HTML del PDF ───────────────────────────────────────────────────────
function PDFPreview({ config, logoUrl, asesorNombre, razonSocial }: {
  config: PDFConfig; logoUrl?: string | null; asesorNombre?: string; razonSocial?: string
}) {
  const PRIMARY = config.color_primario
  const ACCENT  = config.color_acento
  const HEADER_TEXT = config.color_texto_header
  const nombre  = 'María González López'
  const hoy     = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
  const LOGO_H  = config.logo_size === 'pequeño' ? 20 : config.logo_size === 'grande' ? 36 : 28
  const secVisible = (id: string) => config.secciones.find(s => s.id === id)?.visible !== false

  const SecLabel = ({ text, color = PRIMARY }: { text: string; color?: string }) => (
    <div style={{ fontSize: '8px', fontWeight: '700', color, textTransform: 'uppercase', letterSpacing: '0.5px', borderLeft: `3px solid ${ACCENT}`, paddingLeft: '6px', marginBottom: '8px', marginTop: '10px' }}>
      {text}
    </div>
  )

  const KPI = ({ label, value, bg = '#F8FAFC', color = '#111827', border = BORDE }: any) => (
    <div style={{ flex: 1, background: bg, border: `1px solid ${border}`, borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
      <div style={{ fontSize: '7px', color: '#64748B', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '13px', fontWeight: '700', color }}>{value}</div>
    </div>
  )

  const SofiaBox = ({ tipo, texto }: { tipo: 'azul' | 'amarillo' | 'verde'; texto: string }) => {
    const bgMap = { azul: '#EEF2F8', amarillo: '#FFFBEB', verde: '#F0FDF4' }
    const borderMap = { azul: PRIMARY, amarillo: '#F59E0B', verde: '#16A34A' }
    const labelMap = { azul: '★ Sofía explica:', amarillo: '⚠ Sofía advierte:', verde: '✓ Sofía recomienda:' }
    return (
      <div style={{ background: bgMap[tipo], borderLeft: `3px solid ${borderMap[tipo]}`, borderRadius: '0 4px 4px 0', padding: '7px 9px', marginTop: '5px', fontSize: '8px', color: '#374151', lineHeight: '1.5' }}>
        <strong style={{ color: borderMap[tipo], display: 'block', marginBottom: '2px' }}>{labelMap[tipo]}</strong>
        {texto}
      </div>
    )
  }

  return (
    <div style={{ background: '#F4F6FB', padding: '12px', borderRadius: '8px', fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#1E293B', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', width: '100%', maxWidth: '500px' }}>

      {/* Watermark */}
      {config.mostrar_watermark && (
        <div style={{ position: 'absolute', top: '35%', left: '15%', fontSize: '40px', color: '#DC2626', opacity: 0.07, fontWeight: '900', pointerEvents: 'none', transform: 'rotate(-15deg)' }}>
          BORRADOR
        </div>
      )}

      {/* Header */}
      <div style={{ background: PRIMARY, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderRadius: '6px 6px 0 0' }}>
        <div style={{ flex: 1 }}>
          {config.mostrar_logo && logoUrl && config.header_layout !== 'solo_texto' && (
            <img src={logoUrl} alt="Logo" style={{ height: `${LOGO_H}px`, objectFit: 'contain', marginBottom: '6px', display: 'block' }} />
          )}
          {!logoUrl && config.mostrar_logo && (
            <div style={{ height: `${LOGO_H}px`, width: '80px', background: 'rgba(255,255,255,0.2)', borderRadius: '4px', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.6)' }}>LOGO</span>
            </div>
          )}
          <div style={{ fontSize: '7px', color: `${HEADER_TEXT}99`, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
            Diagnóstico Pensional
          </div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: HEADER_TEXT, marginBottom: '2px' }}>{nombre}</div>
          <div style={{ fontSize: '8px', color: `${HEADER_TEXT}BB` }}>
            {asesorNombre ? `Elaborado por: ${asesorNombre}` : razonSocial || 'KSE Pensiones'} · {hoy}
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '6px 10px', textAlign: 'center', marginLeft: '12px' }}>
          <div style={{ fontSize: '7px', color: `${HEADER_TEXT}99`, marginBottom: '2px' }}>Régimen</div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: HEADER_TEXT }}>Ley 73</div>
        </div>
      </div>

      {/* Acento */}
      <div style={{ height: '3px', background: ACCENT }} />

      {/* Cuerpo */}
      <div style={{ background: 'white', padding: '14px 18px', borderRadius: '0 0 6px 6px' }}>

        {/* Secciones ordenadas */}
        {[...config.secciones].sort((a, b) => a.orden - b.orden).filter(s => s.visible).map(sec => (
          <div key={sec.id}>
            {sec.id === 'situacion' && (
              <>
                <SecLabel text="Tu situación actual" />
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <KPI label="Semanas cotizadas" value="1,659" border={BORDE} />
                  <KPI label="Edad actual" value="57" border={BORDE} />
                  {config.kpi_por_fila >= 3 && <KPI label="SDI promedio" value="$518.07" border={BORDE} />}
                </div>
                {config.mostrar_sofia && <SofiaBox tipo="azul" texto="Cuenta con 1,659 semanas cotizadas bajo Ley 73, lo que le otorga derechos pensionales sólidos que vale la pena optimizar." />}
              </>
            )}
            {sec.id === 'sin_mod40' && (
              <>
                <div style={{ height: '0.5px', background: BORDE, margin: '10px 0' }} />
                <SecLabel text="Tu pensión sin hacer nada (sin Modalidad 40)" />
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <KPI label="Pensión mensual" value="$6,240" bg="#FEF2F2" border="#FCA5A5" color="#DC2626" />
                  <KPI label="Pensión anual" value="$74,880" border={BORDE} />
                  {config.kpi_por_fila >= 3 && <KPI label="Edad de retiro" value="60" border={BORDE} />}
                </div>
                {config.mostrar_sofia && <SofiaBox tipo="amarillo" texto="Esta pensión representa tu derecho adquirido hoy. Existe una estrategia legal que puede incrementarla significativamente." />}
              </>
            )}
            {sec.id === 'con_mod40' && (
              <>
                <div style={{ height: '0.5px', background: BORDE, margin: '10px 0' }} />
                <SecLabel text="Con Modalidad 40 — opción recomendada" color="#16A34A" />
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <KPI label="Nueva pensión" value="$11,032" bg="#F0FDF4" border="#86EFAC" color="#16A34A" />
                  <KPI label="Mejora mensual" value="+$4,792" bg="#EEF2F8" border={PRIMARY} color={PRIMARY} />
                  {config.kpi_por_fila >= 3 && <KPI label="Se recupera en" value="28 meses" bg="#FFF7ED" border={ACCENT} color="#C2410C" />}
                </div>
                {config.mostrar_sofia && <SofiaBox tipo="verde" texto="La inversión se recupera en 28 meses y después recibirás $4,792 adicionales cada mes de por vida." />}
              </>
            )}
            {sec.id === 'comparativa' && config.mostrar_comparativa && (
              <>
                <div style={{ height: '0.5px', background: BORDE, margin: '10px 0' }} />
                <SecLabel text="Comparativa de opciones disponibles" />
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5px', marginTop: '4px' }}>
                  <thead>
                    <tr style={{ background: PRIMARY }}>
                      {['Escenario','Pensión','Inversión','Recupera en','A los 80 años'].map((h, i) => (
                        <th key={i} style={{ color: 'white', padding: '4px 5px', fontWeight: '600', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Sin Mod. 40', '$6,240', '—', '—', '—'],
                      ['★ Esc. 1 — 6 UMAs · 24 meses', '$11,032', '$312,480', '28 meses', '$2,847,600'],
                      ['Esc. 2 — 8 UMAs · 36 meses', '$13,218', '$562,464', '33 meses', '$3,841,428'],
                    ].map((row, ri) => (
                      <tr key={ri} style={{ background: ri === 1 ? '#F0FDF4' : ri % 2 === 0 ? 'white' : '#F8FAFC', borderBottom: `0.5px solid ${BORDE}` }}>
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
                <div style={{ height: '0.5px', background: BORDE, margin: '10px 0' }} />
                <SecLabel text="¿Qué sigue? Próximos pasos" />
                {[
                  'Reunir documentos: constancia de semanas, AFORE, identificación y CURP.',
                  'Confirmar el monto de cotización en Modalidad 40 (6 UMAs = $5,865/mes).',
                  'Iniciar el trámite en el IMSS — tu asesor te acompaña en todo el proceso.',
                ].map((paso, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '5px', alignItems: 'flex-start' }}>
                    <div style={{ width: '14px', height: '14px', background: PRIMARY, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: 'white', fontSize: '7px', fontWeight: '700' }}>{i + 1}</span>
                    </div>
                    <span style={{ fontSize: '8px', color: '#374151', lineHeight: '1.4', paddingTop: '1px' }}>{paso}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        ))}

        {/* Footer */}
        <div style={{ borderTop: `0.5px solid ${BORDE}`, marginTop: '12px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '7px', color: '#64748B' }}>{razonSocial || 'KSE Pensiones'}{asesorNombre ? ` · ${asesorNombre}` : ''}</span>
          {config.footer_mostrar_disclaimer && (
            <span style={{ fontSize: '7px', color: '#64748B', maxWidth: '220px', textAlign: 'right' }}>
              {config.footer_texto || 'Este diagnóstico es informativo y no constituye asesoría legal.'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Configurador ───────────────────────────────────────────────────────────────
export default function PDFConfigurador({ config, onChange, logoUrl, asesorNombre, razonSocial }: Props) {
  const set = (partial: Partial<PDFConfig>) => onChange({ ...config, ...partial })

  const toggleSeccion = (id: string) => {
    onChange({
      ...config,
      secciones: config.secciones.map(s => s.id === id ? { ...s, visible: !s.visible } : s),
    })
  }

  const moverSeccion = (id: string, dir: -1 | 1) => {
    const secs = [...config.secciones].sort((a, b) => a.orden - b.orden)
    const idx = secs.findIndex(s => s.id === id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= secs.length) return
    const newSecs = secs.map((s, i) => {
      if (i === idx) return { ...s, orden: secs[newIdx].orden }
      if (i === newIdx) return { ...s, orden: secs[idx].orden }
      return s
    })
    onChange({ ...config, secciones: newSecs })
  }

  const sLabel: React.CSSProperties = {
    fontSize: '10px', fontWeight: '600', color: '#64748B',
    textTransform: 'uppercase', letterSpacing: '0.5px',
    display: 'block', marginBottom: '8px',
  }

  const row: React.CSSProperties = { marginBottom: '16px' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px', alignItems: 'start' }}>

      {/* ── Panel izquierdo: controles ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

        {/* Colores */}
        <div style={{ background: 'white', borderRadius: '10px', border: `1px solid ${BORDE}`, overflow: 'hidden', marginBottom: '10px' }}>
          <div style={{ padding: '10px 14px', background: '#F8FAFC', borderBottom: `1px solid ${BORDE}` }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>🎨 Colores</span>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: 'Color primario (header)', key: 'color_primario' as const },
              { label: 'Color acento (línea)', key: 'color_acento' as const },
              { label: 'Texto del header', key: 'color_texto_header' as const },
            ].map(f => (
              <div key={f.key}>
                <label style={sLabel}>{f.label}</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="color" value={config[f.key]} onChange={e => set({ [f.key]: e.target.value })}
                    style={{ width: '40px', height: '32px', border: `1px solid ${BORDE}`, borderRadius: '6px', cursor: 'pointer', padding: '2px' }} />
                  <input type="text" value={config[f.key]} onChange={e => set({ [f.key]: e.target.value })}
                    style={{ flex: 1, height: '32px', border: `1px solid ${BORDE}`, borderRadius: '6px', padding: '0 8px', fontSize: '12px', fontFamily: 'inherit' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Secciones */}
        <div style={{ background: 'white', borderRadius: '10px', border: `1px solid ${BORDE}`, overflow: 'hidden', marginBottom: '10px' }}>
          <div style={{ padding: '10px 14px', background: '#F8FAFC', borderBottom: `1px solid ${BORDE}` }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>📋 Secciones y orden</span>
          </div>
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[...config.secciones].sort((a, b) => a.orden - b.orden).map((sec, i, arr) => (
              <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', background: sec.visible ? '#F0F7F4' : '#F8FAFC', borderRadius: '6px', border: `1px solid ${sec.visible ? '#86EFAC' : BORDE}` }}>
                <input type="checkbox" checked={sec.visible} onChange={() => toggleSeccion(sec.id)}
                  style={{ cursor: 'pointer', width: '14px', height: '14px' }} />
                <span style={{ flex: 1, fontSize: '11px', color: sec.visible ? '#374151' : '#94A3B8', fontWeight: sec.visible ? '500' : '400' }}>{sec.label}</span>
                <div style={{ display: 'flex', gap: '2px' }}>
                  <button onClick={() => moverSeccion(sec.id, -1)} disabled={i === 0}
                    style={{ width: '20px', height: '20px', border: `1px solid ${BORDE}`, borderRadius: '4px', background: 'white', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, fontSize: '10px' }}>↑</button>
                  <button onClick={() => moverSeccion(sec.id, 1)} disabled={i === arr.length - 1}
                    style={{ width: '20px', height: '20px', border: `1px solid ${BORDE}`, borderRadius: '4px', background: 'white', cursor: i === arr.length - 1 ? 'default' : 'pointer', opacity: i === arr.length - 1 ? 0.3 : 1, fontSize: '10px' }}>↓</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Opciones */}
        <div style={{ background: 'white', borderRadius: '10px', border: `1px solid ${BORDE}`, overflow: 'hidden', marginBottom: '10px' }}>
          <div style={{ padding: '10px 14px', background: '#F8FAFC', borderBottom: `1px solid ${BORDE}` }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>⚙ Opciones</span>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: 'Mostrar cajas de Sofía IA', key: 'mostrar_sofia' as const },
              { label: 'Mostrar logo en header', key: 'mostrar_logo' as const },
              { label: 'Watermark "BORRADOR"', key: 'mostrar_watermark' as const },
              { label: 'Disclaimer en footer', key: 'footer_mostrar_disclaimer' as const },
              { label: 'Salto de pág. antes de Mod. 40', key: 'pagina_break_antes_mod40' as const },
            ].map(f => (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={config[f.key] as boolean} onChange={e => set({ [f.key]: e.target.checked })}
                  style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                <span style={{ fontSize: '12px', color: '#374151' }}>{f.label}</span>
              </label>
            ))}

            <div style={{ borderTop: `1px solid ${BORDE}`, paddingTop: '10px' }}>
              <label style={sLabel}>KPIs por fila</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {([2, 3] as const).map(n => (
                  <button key={n} onClick={() => set({ kpi_por_fila: n })}
                    style={{ flex: 1, padding: '6px', border: `1.5px solid ${config.kpi_por_fila === n ? config.color_primario : BORDE}`, borderRadius: '6px', background: config.kpi_por_fila === n ? config.color_primario : 'white', color: config.kpi_por_fila === n ? 'white' : '#374151', cursor: 'pointer', fontSize: '12px', fontWeight: '600', fontFamily: 'inherit' }}>
                    {n} KPIs
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={sLabel}>Posición del logo</label>
              <select value={config.header_layout} onChange={e => set({ header_layout: e.target.value as any })}
                style={{ width: '100%', height: '36px', border: `1px solid ${BORDE}`, borderRadius: '6px', padding: '0 8px', fontSize: '12px', fontFamily: 'inherit' }}>
                <option value="logo_izquierda">Logo a la izquierda</option>
                <option value="logo_derecha">Logo a la derecha</option>
                <option value="solo_texto">Solo texto (sin logo)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer texto */}
        <div style={{ background: 'white', borderRadius: '10px', border: `1px solid ${BORDE}`, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#F8FAFC', borderBottom: `1px solid ${BORDE}` }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: '#374151' }}>📝 Footer personalizado</span>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <label style={sLabel}>Texto del disclaimer (vacío = default)</label>
            <textarea value={config.footer_texto} onChange={e => set({ footer_texto: e.target.value })} rows={2}
              placeholder="Este diagnóstico es informativo y no constituye asesoría legal."
              style={{ width: '100%', border: `1px solid ${BORDE}`, borderRadius: '6px', padding: '6px 8px', fontSize: '11px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      {/* ── Panel derecho: preview ── */}
      <div style={{ position: 'sticky' as const, top: '80px' }}>
        <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Vista previa del PDF</span>
          <span style={{ background: '#F0FDF4', color: '#16A34A', padding: '2px 6px', borderRadius: '4px', fontSize: '9px' }}>Se actualiza en tiempo real</span>
        </div>
        <div style={{ position: 'relative' }}>
          <PDFPreview config={config} logoUrl={logoUrl} asesorNombre={asesorNombre} razonSocial={razonSocial} />
        </div>
        <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '8px', textAlign: 'center' }}>
          Vista aproximada — el PDF final puede variar ligeramente en fuentes y espaciado
        </p>
      </div>
    </div>
  )
}
