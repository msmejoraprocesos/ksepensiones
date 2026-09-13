'use client'
import React, { useEffect, useState } from 'react'

/**
 * Control de densidad.
 *
 * Ajustar la escala a ciegas no funciona: lo que se ve correcto en un monitor
 * a 100% de zoom se ve enorme en otro a 150%, o en una pantalla con escalado
 * del sistema. Y esas condiciones no son visibles desde el código.
 *
 * En lugar de seguir adivinando, el usuario ajusta. Se aplica con `zoom` sobre
 * el contenido, que escala todo en bloque conservando proporciones.
 *
 * La preferencia vive en el propio documento (atributo en <html>) y se
 * persiste en el servidor a través del perfil, no en almacenamiento del
 * navegador, que no está disponible en este entorno.
 */

export const NIVELES = [
  { id: 'compacta', label: 'Compacta', zoom: 0.8,  desc: 'Más información por pantalla' },
  { id: 'normal',   label: 'Normal',   zoom: 0.9,  desc: 'Equilibrio entre densidad y lectura' },
  { id: 'amplia',   label: 'Amplia',   zoom: 1.0,  desc: 'Texto y controles más grandes' },
] as const

export type NivelDensidad = typeof NIVELES[number]['id']

export function aplicarDensidad(nivel: NivelDensidad) {
  if (typeof document === 'undefined') return
  const n = NIVELES.find(x => x.id === nivel) ?? NIVELES[1]
  document.documentElement.style.setProperty('--kse-zoom', String(n.zoom))
  document.documentElement.setAttribute('data-densidad', nivel)
}

/** Selector de tres opciones. Se monta en Configuración. */
export default function SelectorDensidad({
  valor, onCambio,
}: { valor: NivelDensidad; onCambio: (v: NivelDensidad) => void }) {
  const [actual, setActual] = useState<NivelDensidad>(valor)

  useEffect(() => { aplicarDensidad(actual) }, [actual])

  return (
    <div>
      <p style={{ fontSize: '14px', fontWeight: 700, color: '#132135', margin: '0 0 4px' }}>
        Densidad de la interfaz
      </p>
      <p style={{ fontSize: '12.5px', color: '#66738A', margin: '0 0 12px', lineHeight: 1.5 }}>
        Ajusta el tamaño general de textos y controles. Si tu navegador o tu sistema
        tienen escalado, esta opción lo compensa.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {NIVELES.map(n => {
          const on = n.id === actual
          return (
            <button
              key={n.id}
              onClick={() => { setActual(n.id); onCambio(n.id) }}
              style={{
                flex: '1 1 150px', textAlign: 'left', padding: '11px 14px',
                borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: on ? '2px solid #E8622C' : '1px solid #E1E7F0',
                background: on ? '#FDF0E9' : 'white',
              }}
            >
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: on ? '#E8622C' : '#132135' }}>
                {n.label}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: '#66738A', marginTop: 2, lineHeight: 1.4 }}>
                {n.desc}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
