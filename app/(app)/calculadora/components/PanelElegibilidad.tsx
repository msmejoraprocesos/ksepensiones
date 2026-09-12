'use client'
import React from 'react'
import { K, nw } from '@/lib/design-tokens'
import { evaluarElegibilidad, type Hallazgo } from '@/lib/elegibilidad'

/**
 * Compuerta de elegibilidad — se evalúa tras capturar la constancia.
 *
 * La calculadora permitía recorrer el flujo completo y emitir un PDF para un
 * cliente que legalmente no puede ejecutar Modalidad 40: el Art. 219 LSS
 * extingue el derecho a los 5 años de la baja, y el Art. 218 exige 52 semanas
 * en el régimen obligatorio dentro de los últimos 5 años. Un diagnóstico
 * impecable sobre una vía inviable es peor que no tener diagnóstico.
 */

const COLOR: Record<Hallazgo['severidad'], { fg: string; bg: string; borde: string; titulo: string }> = {
  bloqueo:     { fg: K.red,   bg: K.redSoft,    borde: `${K.red}33`,   titulo: 'No procede' },
  advertencia: { fg: K.amber, bg: K.amberSoft,  borde: `${K.amber}33`, titulo: 'Verificar' },
  info:        { fg: K.cyan,  bg: '#ECFEFF',    borde: `${K.cyan}33`,  titulo: 'Nota' },
}

const ORDEN: Hallazgo['severidad'][] = ['bloqueo', 'advertencia', 'info']

interface Props {
  datos: any
  setDatos: (fn: (p: any) => any) => void
  semanasNetas: number
}

export default function PanelElegibilidad({ datos, setDatos, semanasNetas }: Props) {
  const r = evaluarElegibilidad({
    semanas_netas: semanasNetas,
    cotizando_actualmente: !!datos.sigue_cotizando,
    fecha_baja: datos.fecha_baja_imss || null,
    semanas_ultimos_5_anios: datos.semanas_ultimos_5_anios ?? null,
    regimen: datos.ley === '97' ? 'ley97' : 'ley73',
    edad_actual: datos.edad_actual ?? 60,
  })

  const hallazgos = [...r.hallazgos].sort(
    (a, b) => ORDEN.indexOf(a.severidad) - ORDEN.indexOf(b.severidad)
  )
  const bloqueos = hallazgos.filter(h => h.severidad === 'bloqueo').length

  const campo: React.CSSProperties = {
    width: '100%', height: '48px', border: `1px solid ${K.line}`,
    borderRadius: '10px', padding: '0 14px', fontSize: '17px',
    fontFamily: 'inherit', boxSizing: 'border-box', background: K.card,
    color: K.ink, fontWeight: 600, outline: 'none',
  }

  return (
    <div style={{ background: K.card, borderRadius: '14px', border: `1px solid ${K.line}`, boxShadow: '0 1px 3px rgba(19,33,53,0.06)', overflow: 'hidden' }}>

      {/* Veredicto */}
      <div style={{ padding: '20px 24px', background: r.mod40_viable ? K.greenSoft : K.redSoft, borderBottom: `1px solid ${K.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: r.mod40_viable ? K.green : K.red, color: 'white', fontSize: 15, fontWeight: 700 }}>
            {r.mod40_viable ? '✓' : '!'}
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: 0 }}>
              {r.mod40_viable ? 'Puede acceder a Modalidad 40' : 'No puede acceder a Modalidad 40'}
            </p>
            <p style={{ fontSize: '13px', color: K.muted, margin: '3px 0 0' }}>
              {r.mod40_viable
                ? 'Cumple los requisitos de los artículos 218 y 219 LSS con los datos capturados.'
                : `${bloqueos} ${bloqueos === 1 ? 'requisito no se cumple' : 'requisitos no se cumplen'}. El diagnóstico puede generarse, pero el trámite no procedería.`}
            </p>
          </div>
          {r.mod10_recomendada && (
            <span style={{ marginLeft: 'auto', background: K.cyan, color: 'white', fontSize: '13px', fontWeight: 700, padding: '7px 13px', borderRadius: 999, ...nw }}>
              Revisar Modalidad 10
            </span>
          )}
        </div>
      </div>

      {/* Captura de los dos datos que la constancia trae y el formulario no pedía */}
      <div style={{ padding: '20px 24px', borderBottom: `1px solid ${K.line}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '15px', color: K.muted, marginBottom: '6px' }}>
              Fecha de baja del IMSS
            </label>
            <input
              type="date"
              value={datos.fecha_baja_imss || ''}
              onChange={e => setDatos(p => ({ ...p, fecha_baja_imss: e.target.value }))}
              style={campo}
            />
            <p style={{ fontSize: '13px', color: K.muted, margin: '5px 0 0' }}>
              Del régimen obligatorio. Define el plazo de 5 años del Art. 219.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '15px', color: K.muted, marginBottom: '6px' }}>
              Semanas en los últimos 5 años
            </label>
            <input
              type="number"
              min={0}
              value={datos.semanas_ultimos_5_anios || ''}
              onChange={e => setDatos(p => ({ ...p, semanas_ultimos_5_anios: Number(e.target.value) }))}
              placeholder="Ej. 120"
              style={campo}
            />
            <p style={{ fontSize: '13px', color: K.muted, margin: '5px 0 0' }}>
              Mínimo 52 antes de la baja, conforme al Art. 218.
            </p>
          </div>
        </div>
      </div>

      {/* Hallazgos */}
      <div style={{ padding: '18px 24px 22px' }}>
        {hallazgos.map((h, i) => {
          const c = COLOR[h.severidad]
          return (
            <div key={i} style={{ display: 'flex', gap: '13px', padding: '14px 16px', marginBottom: '8px', background: c.bg, border: `1px solid ${c.borde}`, borderRadius: '10px' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: c.fg, flexShrink: 0, marginTop: 8 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '17px', fontWeight: 600, color: K.ink }}>{h.titulo}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: c.fg, ...nw }}>{c.titulo}</span>
                  {h.fundamento && (
                    <span style={{ marginLeft: 'auto', fontSize: '13px', color: K.muted, ...nw }}>{h.fundamento}</span>
                  )}
                </div>
                <p style={{ fontSize: '15px', color: K.ink, margin: '4px 0 0', lineHeight: 1.6 }}>{h.detalle}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
