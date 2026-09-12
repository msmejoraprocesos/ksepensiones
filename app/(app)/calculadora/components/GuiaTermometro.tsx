'use client'
import React, { useState, useRef, useEffect } from 'react'
import { K, nw, num, TERMOMETRO_RECUPERACION, HORIZONTE_MESES, getTermometro } from '@/lib/design-tokens'

/**
 * Guía de interpretación del termómetro de recuperación.
 *
 * La etiqueta sola ("Excelente") no le dice al asesor de dónde sale ni qué
 * tan lejos está del siguiente tramo. Esta guía muestra la escala completa
 * con el caso actual resaltado, para que pueda explicarla frente al cliente
 * en lugar de pedir que se le crea.
 */

interface Props {
  /** Meses de recuperación del escenario que se está mostrando. */
  meses: number
  /** Tamaño del disparador. 'sm' para pies de tarjeta, 'md' para encabezados. */
  tam?: 'sm' | 'md'
}

export default function GuiaTermometro({ meses, tam = 'sm' }: Props) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const actual = getTermometro(meses)
  const d = tam === 'md' ? 20 : 17

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        aria-label="Cómo se interpreta"
        aria-expanded={abierto}
        style={{
          width: d, height: d, borderRadius: 999, flexShrink: 0, padding: 0,
          border: `1px solid ${abierto ? K.navy600 : K.line}`,
          background: abierto ? K.navy600 : 'transparent',
          color: abierto ? 'white' : K.muted,
          fontSize: d === 20 ? 12 : 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ?
      </button>

      {abierto && (
        <span
          role="dialog"
          style={{
            position: 'absolute', bottom: `calc(100% + 10px)`, right: 0, zIndex: 40,
            width: 340, maxWidth: '86vw', background: K.card, borderRadius: 14,
            border: `1px solid ${K.line}`, boxShadow: '0 12px 36px rgba(13,36,64,.20)',
            padding: '18px 20px', textAlign: 'left', display: 'block', cursor: 'default',
          }}
        >
          <p style={{ fontSize: 17, fontWeight: 700, color: K.ink, margin: 0 }}>
            Cómo se interpreta
          </p>
          <p style={{ fontSize: 13, color: K.muted, margin: '5px 0 14px', lineHeight: 1.55 }}>
            Meses que tarda la pensión mejorada en devolver lo invertido, sobre
            un horizonte de cobro de {HORIZONTE_MESES} meses (60 a 80 años).
          </p>

          {TERMOMETRO_RECUPERACION.map((t, i) => {
            const on = t.label === actual.label
            const desde = i === 0 ? 0 : TERMOMETRO_RECUPERACION[i - 1].max + 1
            const rango = t.max === Infinity
              ? `más de ${TERMOMETRO_RECUPERACION[i - 1].max} meses`
              : desde === 0 ? `hasta ${t.max} meses` : `${desde} a ${t.max} meses`
            return (
              <span key={t.label} style={{
                display: 'flex', alignItems: 'flex-start', gap: 11,
                padding: '9px 11px', borderRadius: 9, marginBottom: 3,
                background: on ? t.bg : 'transparent',
              }}>
                <span style={{
                  width: 9, height: 9, borderRadius: 3, flexShrink: 0,
                  background: t.color, marginTop: 5,
                  outline: on ? `2px solid ${t.color}55` : 'none', outlineOffset: 2,
                }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: on ? 700 : 500, color: on ? t.color : K.ink }}>
                      {t.label}
                    </span>
                    <span style={{ fontSize: 13, color: K.muted, ...nw, ...num }}>{rango}</span>
                  </span>
                  {on && (
                    <span style={{ display: 'block', fontSize: 13, color: K.ink, marginTop: 3, lineHeight: 1.5 }}>
                      {t.explica}
                    </span>
                  )}
                </span>
              </span>
            )
          })}

          <span style={{
            display: 'block', marginTop: 12, paddingTop: 12,
            borderTop: `1px solid ${K.line}`, fontSize: 13, color: K.muted, lineHeight: 1.55,
          }}>
            Este escenario recupera en{' '}
            <strong style={{ color: K.ink, ...num }}>{meses} meses</strong>
            {meses < HORIZONTE_MESES && (
              <> y deja <strong style={{ color: K.green, ...num }}>{HORIZONTE_MESES - meses} meses</strong> de ganancia neta</>
            )}.
          </span>
        </span>
      )}
    </span>
  )
}
