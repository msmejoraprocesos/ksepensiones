'use client'
import React from 'react'
import { K, nw, num } from '@/lib/design-tokens'

interface Props {
  pagina: number
  totalPaginas: number
  setPagina: (p: number) => void
  desde: number
  hasta: number
  total: number
  /** Qué se está listando, en plural. Ej. "clientes", "seguimientos". */
  etiqueta?: string
}

export default function Paginador({ pagina, totalPaginas, setPagina, desde, hasta, total, etiqueta = 'registros' }: Props) {
  if (total === 0) return null

  const btn = (activo: boolean): React.CSSProperties => ({
    minWidth: 40, height: 40, padding: '0 12px', borderRadius: 9,
    border: `1px solid ${activo ? K.navy800 : K.line}`,
    background: activo ? K.navy800 : K.card,
    color: activo ? 'white' : K.ink,
    fontSize: 15, fontWeight: activo ? 700 : 500,
    cursor: 'pointer', fontFamily: 'inherit',
  })

  /* Ventana de páginas alrededor de la actual: con 40 páginas no tiene
     sentido pintar 40 botones. */
  const ventana: (number | '…')[] = []
  const cerca = (p: number) => Math.abs(p - pagina) <= 1
  for (let p = 1; p <= totalPaginas; p++) {
    if (p === 1 || p === totalPaginas || cerca(p)) ventana.push(p)
    else if (ventana[ventana.length - 1] !== '…') ventana.push('…')
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap', padding: '16px 20px',
      borderTop: `1px solid ${K.line}`, background: K.card,
    }}>
      <span style={{ fontSize: 15, color: K.muted, ...nw }}>
        <strong style={{ color: K.ink, ...num }}>{desde}–{hasta}</strong> de{' '}
        <strong style={{ color: K.ink, ...num }}>{total}</strong> {etiqueta}
      </span>

      {totalPaginas > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setPagina(pagina - 1)} disabled={pagina === 1} aria-label="Anterior"
            style={{ ...btn(false), opacity: pagina === 1 ? 0.4 : 1, cursor: pagina === 1 ? 'default' : 'pointer' }}>
            ‹
          </button>
          {ventana.map((p, i) =>
            p === '…'
              ? <span key={`s${i}`} style={{ color: K.muted, padding: '0 4px' }}>…</span>
              : <button key={p} onClick={() => setPagina(p)} style={btn(p === pagina)}>{p}</button>
          )}
          <button onClick={() => setPagina(pagina + 1)} disabled={pagina === totalPaginas} aria-label="Siguiente"
            style={{ ...btn(false), opacity: pagina === totalPaginas ? 0.4 : 1, cursor: pagina === totalPaginas ? 'default' : 'pointer' }}>
            ›
          </button>
        </div>
      )}
    </div>
  )
}
