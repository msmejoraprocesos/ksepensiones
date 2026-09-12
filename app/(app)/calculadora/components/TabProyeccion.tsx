'use client'
import React, { useState, useEffect } from 'react'

/* Tokens — docs/rediseno/SISTEMA-DISENO.md */
const K = {
  navy900: '#0D2440', navy800: '#14375F', navy600: '#245287',
  orange: '#E8622C', orangeSoft: '#FDF0E9', gold: '#F2B544',
  green: '#12855C', greenLt: '#1FA873', greenSoft: '#E6F4EE',
  red: '#DC2626',
  paper: '#F5F7FA', card: '#FFFFFF',
  ink: '#132135', muted: '#66738A', line: '#E1E7F0',
}

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const nw = { whiteSpace: 'nowrap' as const }
const num = { fontVariantNumeric: 'tabular-nums' as const }

/* Umbrales sobre el RETORNO COMO MULTIPLO (ganancia / inversion neta).
   Antes se comparaba contra tasa_rendimiento, que viene x100, por lo que
   cualquier escenario caia siempre en "Excelente". */
const termometroRetorno = (multiplo: number) =>
  multiplo >= 25 ? { label: 'Excelente', color: '#15803D', bg: '#F0FDF4' }
  : multiplo >= 18 ? { label: 'Buena inversión', color: '#0369A1', bg: '#F0F9FF' }
  : multiplo >= 12 ? { label: 'Moderada', color: '#B45309', bg: '#FFFBEB' }
  : { label: 'Riesgo moderado', color: '#B91C1C', bg: '#FEF2F2' }

interface Props {
  escenarios: any[]
  sys: any
  setTab: (t: number) => void
}

export default function TabProyeccion({ escenarios, sys, setTab }: Props) {
  const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const [sel, setSel] = useState<number | null>(null)
  const [anim, setAnim] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAnim(true); return }
    const t = setTimeout(() => setAnim(true), 200)
    return () => clearTimeout(t)
  }, [])

  if (!escRec || escRec.mod40_meses === 0) return (
    <div style={{ textAlign: 'center', padding: '60px', color: K.muted }}>
      <i className="ti ti-chart-line" style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} />
      <p style={{ fontSize: '15px' }}>Completa las pestañas anteriores para continuar</p>
    </div>
  )

  const inflacion = (sys?.inflacion_pension ?? sys?.inflacion_uma ?? 4.5) / 100
  const multiplo = escRec.inversion_neta > 0 ? escRec.ganancia_a80 / escRec.inversion_neta : 0
  const termRec = termometroRetorno(multiplo)
  const incr = (escRec.pension_mensual ?? 0) - (escRec.pension_base ?? 0)
  const edadInicio = Math.floor(escRec.edad_retiro || 62)

  const filas: any[] = []
  let ganAcum = 0
  for (let i = 1; i <= Math.max(20, 80 - edadInicio + 1); i++) {
    const edad = edadInicio + i
    const penSin = escRec.pension_base * Math.pow(1 + inflacion, i)
    const penCon = escRec.pension_mensual * Math.pow(1 + inflacion, i)
    const desc = i <= 5 && escRec.descuento_mensual > 0 ? -escRec.descuento_mensual : 0
    const penInm = penCon + desc
    const ganAño = (penInm - penSin) * 12
    ganAcum += ganAño
    filas.push({ anio: i, edad, penSin, penCon, desc, penInm, ganAño, ganAcum })
    if (edad >= 81) break
  }

  const filaSel = sel != null ? filas.find(f => f.anio === sel) : null
  const maxCon = Math.max(...filas.map(f => f.penCon))
  const hayDescuento = filas.some(f => f.desc < 0)

  /* Curva: pension disponible con Mod. 40 contra pension sin Mod. 40 */
  const w = 900, h = 240, padX = 48, padY = 26
  const px = (i: number) => padX + (i * (w - padX * 2)) / (filas.length - 1)
  const py = (v: number) => h - padY - (v / maxCon) * (h - padY * 2)
  const pathDe = (key: string) => filas.map((f, i) => `${i ? 'L' : 'M'}${px(i)},${py(f[key])}`).join(' ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <style>{`
        @media (max-width: 1000px) {
          .kse-2col { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 700px) {
          .kse-tabla-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
        /* En pantallas bajas una grafica fija se comeria la vista entera */
        @media (max-height: 700px), (max-width: 700px) {
          .kse-curva-sticky { position: static !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .kse-curva-sticky { position: static !important; }
        }
      `}</style>

      {/* ── Franja de cifras ───────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '18px', background: `linear-gradient(118deg, ${K.navy900} 0%, ${K.navy800} 60%, ${K.navy600} 100%)` }}>
        <div style={{ position: 'absolute', width: 460, height: 460, right: -150, top: -190, borderRadius: 999, pointerEvents: 'none', background: `radial-gradient(circle, ${K.orange}33 0%, transparent 68%)` }} />
        <div style={{ position: 'relative', padding: '28px 34px 22px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', margin: 0 }}>
            LO QUE ACUMULA HASTA LOS 80 AÑOS
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
            <p style={{ fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 800, color: 'white', margin: 0, lineHeight: 1, letterSpacing: '-.035em', ...nw, ...num }}>
              {fmtMXN(escRec.ganancia_a80)}
            </p>
            <span style={{ background: K.green, color: 'white', fontSize: '17px', fontWeight: 700, padding: '9px 16px', borderRadius: 999, ...nw, ...num }}>
              {multiplo.toFixed(1)} veces lo invertido
            </span>
          </div>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,.68)', margin: '10px 0 0' }}>
            Sobre una inversión neta de {fmtMXN(escRec.inversion_neta)}, recuperada en {escRec.roi} meses.
          </p>
        </div>

        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1px', background: 'rgba(255,255,255,.11)' }}>
          {[
            { label: 'Incremento de pensión', value: fmtMXN2(incr), sub: 'mensual adicional', color: K.greenLt },
            { label: 'Inversión neta', value: fmtMXN2(escRec.inversion_neta), sub: 'descontando AFORE', color: K.gold },
            { label: 'Recuperación', value: `${escRec.roi} meses`, sub: termRec.label, color: 'white' },
            { label: 'Actualización anual', value: `${(inflacion * 100).toFixed(1)}%`, sub: 'INPC, Art. 214 LSS', color: 'white' },
          ].map((k, i) => (
            <div key={i} style={{ background: K.navy900, padding: '18px 24px' }}>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.56)', margin: 0 }}>{k.label}</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: k.color, margin: '3px 0 0', ...nw, ...num }}>{k.value}</p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.44)', margin: '2px 0 0' }}>{k.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── La curva ───────────────────────────────────────────────
           Queda fija al desplazarse: la tabla tiene 20 filas y, sin esto,
           seleccionar una fila mueve la linea fuera del campo de vision.
           El usuario tenia que bajar, tocar, subir a ver el efecto y volver
           a bajar — lo que en la practica cancela la exploracion.          */}
      <div className="kse-curva-sticky" style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '6px' }}>
          <div>
            <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: 0 }}>Cómo evoluciona su pensión</p>
            <p style={{ fontSize: '13px', color: K.muted, margin: '4px 0 0' }}>Toque un año para ver el detalle</p>
          </div>
          <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px', color: K.muted }}>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: '#9AA7B8' }} />Sin Mod. 40
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px', color: K.ink, fontWeight: 600 }}>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: K.navy600 }} />Con Mod. 40
            </span>
            {hayDescuento && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '7px', color: K.orange, fontWeight: 600 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: K.orange }} />Disponible durante el crédito
              </span>
            )}
          </div>
        </div>

        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '240px', display: 'block' }}>
          <defs>
            <linearGradient id="grProy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={K.green} stopOpacity=".22" />
              <stop offset="100%" stopColor={K.green} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Area entre ambas curvas = la ganancia */}
          <path d={`${pathDe('penCon')} L${px(filas.length - 1)},${py(filas[filas.length - 1].penSin)} ${filas.slice().reverse().map((f, i) => `L${px(filas.length - 1 - i)},${py(f.penSin)}`).join(' ')} Z`} fill="url(#grProy)" />

          <path d={pathDe('penSin')} fill="none" stroke="#9AA7B8" strokeWidth="2.5" strokeDasharray="6 5" />
          <path d={pathDe('penCon')} fill="none" stroke={K.navy600} strokeWidth="3" strokeLinecap="round" />
          {hayDescuento && <path d={pathDe('penInm')} fill="none" stroke={K.orange} strokeWidth="2.5" strokeLinecap="round" />}

          {filas.map((f, i) => {
            const on = sel === f.anio
            if (i % 2 !== 0 && !on) return null
            return (
              <g key={f.anio} onClick={() => setSel(on ? null : f.anio)} style={{ cursor: 'pointer' }}>
                <rect x={px(i) - 14} y={0} width={28} height={h} fill="transparent" />
                {on && <line x1={px(i)} y1={padY - 10} x2={px(i)} y2={h - padY} stroke={K.orange} strokeWidth="1.5" strokeDasharray="4 4" />}
                <circle cx={px(i)} cy={py(f.penCon)} r={on ? 6 : 3.5} fill={on ? K.orange : 'white'} stroke={on ? K.orange : K.navy600} strokeWidth="2.5" />
                {i % 4 === 0 && (
                  <text x={px(i)} y={h - 6} textAnchor="middle" style={{ fontSize: '12px', fill: K.muted }}>{f.edad}</text>
                )}
              </g>
            )
          })}
        </svg>

        {filaSel && (
          <div style={{ marginTop: '10px', background: K.orangeSoft, borderRadius: '10px', padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
            {[
              ['Año / edad', `${filaSel.anio} / ${filaSel.edad} anios`],
              ['Sin Mod. 40', fmtMXN2(filaSel.penSin)],
              ['Con Mod. 40', fmtMXN2(filaSel.penCon)],
              ...(filaSel.desc < 0 ? [['Descuento crédito', fmtMXN2(filaSel.desc)] as [string, string]] : []),
              ['Disponible', fmtMXN2(filaSel.penInm)],
              ['Ganancia acumulada', fmtMXN(filaSel.ganAcum)],
            ].map(([k, v]) => (
              <div key={k}>
                <p style={{ fontSize: '13px', color: K.muted, margin: 0 }}>{k}</p>
                <p style={{ fontSize: '17px', fontWeight: 700, color: K.ink, margin: '2px 0 0', ...nw, ...num }}>{v}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tabla completa ─────────────────────────────────────── */}
      <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${K.line}` }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: 0 }}>Proyección de flujos año por año</p>
          <p style={{ fontSize: '13px', color: K.muted, margin: '4px 0 0' }}>
            Pensiones actualizadas {(inflacion * 100).toFixed(1)}% cada año conforme al INPC
          </p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
            <thead>
              <tr style={{ background: K.navy900 }}>
                {['Año', 'Edad', 'Sin Mod. 40', 'Con Mod. 40', 'Desc. crédito', 'Disponible', 'Ganancia año', 'Ganancia acum.'].map((hd, i) => (
                  <th key={hd} style={{ padding: '12px 14px', color: 'white', fontWeight: 600, textAlign: i < 2 ? 'center' : 'right', fontSize: '13px', ...nw }}>{hd}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const on = sel === f.anio
                return (
                  <tr key={i} onClick={() => setSel(on ? null : f.anio)}
                    style={{ background: on ? K.orangeSoft : f.edad === 80 ? '#EEF2F8' : i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: `1px solid ${K.line}`, cursor: 'pointer' }}>
                    <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: on ? K.orange : K.navy600, borderLeft: `3px solid ${on ? K.orange : 'transparent'}`, ...num }}>{f.anio}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'center', color: K.ink, ...num }}>{f.edad}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: K.muted, ...nw, ...num }}>{fmtMXN2(f.penSin)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: K.navy600, fontWeight: 600, ...nw, ...num }}>{fmtMXN2(f.penCon)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: f.desc < 0 ? K.red : K.muted, ...nw, ...num }}>{f.desc < 0 ? fmtMXN2(f.desc) : '\u2014'}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: K.green, fontWeight: 700, ...nw, ...num }}>{fmtMXN2(f.penInm)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: f.ganAño >= 0 ? K.green : K.red, ...nw, ...num }}>{fmtMXN(f.ganAño)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: f.ganAcum >= 0 ? K.green : K.red, fontWeight: 700, ...nw, ...num }}>{fmtMXN(f.ganAcum)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(10)}
          style={{ padding: '13px 24px', background: K.orange, color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '17px', fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 3px 10px rgba(232,98,44,0.34)' }}>
          Financiamiento <i className="ti ti-arrow-right" style={{ fontSize: '16px' }} />
        </button>
      </div>
    </div>
  )
}
