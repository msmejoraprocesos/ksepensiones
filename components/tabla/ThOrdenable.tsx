'use client'
import React from 'react'
import { K, nw } from '@/lib/design-tokens'

interface Props {
  label: string
  campo?: string
  campoActivo: string | null
  direccion: 'asc' | 'desc'
  onOrdenar: (campo: any) => void
  alinear?: 'left' | 'right' | 'center'
}

/** Encabezado de columna con indicador de orden. Sin `campo`, no es ordenable. */
export default function ThOrdenable({ label, campo, campoActivo, direccion, onOrdenar, alinear = 'left' }: Props) {
  const activo = !!campo && campo === campoActivo
  return (
    <th
      onClick={() => campo && onOrdenar(campo)}
      aria-sort={activo ? (direccion === 'asc' ? 'ascending' : 'descending') : undefined}
      style={{
        position: 'sticky' as const, top: 0, zIndex: 2, background: K.paper,
        padding: '12px 14px', textAlign: alinear, fontSize: 13, fontWeight: 600,
        color: activo ? K.ink : K.muted, boxShadow: `inset 0 -1px 0 ${K.line}`,
        cursor: campo ? 'pointer' : 'default', userSelect: 'none' as const, ...nw,
      }}
    >
      {label}
      {campo && (
        <span style={{ marginLeft: 6, color: activo ? K.orange : '#C7D0DD', fontSize: 11 }}>
          {activo ? (direccion === 'asc' ? '▲' : '▼') : '▾'}
        </span>
      )}
    </th>
  )
}
