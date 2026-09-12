'use client'
import React from 'react'
import { K } from '@/lib/design-tokens'

/**
 * Estados de carga.
 *
 * La aplicación mostraba "Cargando..." en texto o nada. Un esqueleto con la
 * forma del contenido que viene reduce la sensación de espera y evita el
 * salto de layout cuando los datos llegan.
 */

const base: React.CSSProperties = {
  background: `linear-gradient(90deg, ${K.line} 25%, #EEF2F7 50%, ${K.line} 75%)`,
  backgroundSize: '200% 100%',
  animation: 'kse-brillo 1.4s ease-in-out infinite',
  borderRadius: 8,
}

export function EstilosSkeleton() {
  return (
    <style>{`
      @keyframes kse-brillo {
        0%   { background-position: 200% 0 }
        100% { background-position: -200% 0 }
      }
      @media (prefers-reduced-motion: reduce) {
        [data-skeleton] { animation: none !important }
      }
    `}</style>
  )
}

export function Linea({ ancho = '100%', alto = 14, mt = 0 }: { ancho?: string | number; alto?: number; mt?: number }) {
  return <div data-skeleton style={{ ...base, width: ancho, height: alto, marginTop: mt }} />
}

/** Esqueleto de tabla: mismas columnas y alto de fila que la tabla real. */
export function TablaSkeleton({ filas = 6, columnas = 5 }: { filas?: number; columnas?: number }) {
  return (
    <div>
      <EstilosSkeleton />
      <div style={{ display: 'flex', gap: 16, padding: '12px 16px', borderBottom: `1px solid ${K.line}` }}>
        {Array.from({ length: columnas }).map((_, i) => (
          <div key={i} style={{ flex: i === 0 ? 2 : 1 }}><Linea alto={11} ancho="70%" /></div>
        ))}
      </div>
      {Array.from({ length: filas }).map((_, f) => (
        <div key={f} style={{ display: 'flex', gap: 16, padding: '15px 16px', borderBottom: `1px solid ${K.line}`, opacity: 1 - f * 0.1 }}>
          {Array.from({ length: columnas }).map((_, c) => (
            <div key={c} style={{ flex: c === 0 ? 2 : 1 }}>
              <Linea alto={14} ancho={c === 0 ? '85%' : `${45 + ((f + c) % 4) * 12}%`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Esqueleto de tarjetas de resumen. */
export function TarjetasSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(170px, 1fr))`, gap: 14 }}>
      <EstilosSkeleton />
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: 14, padding: 18 }}>
          <Linea alto={11} ancho="60%" />
          <Linea alto={26} ancho="80%" mt={10} />
          <Linea alto={11} ancho="45%" mt={8} />
        </div>
      ))}
    </div>
  )
}
