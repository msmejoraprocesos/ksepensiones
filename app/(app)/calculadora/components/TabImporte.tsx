'use client'
import React, { useState, useEffect } from 'react'

/* Tokens — docs/rediseno/SISTEMA-DISENO.md */
const K = {
  navy900: '#0D2440', navy800: '#14375F', navy600: '#245287',
  orange: '#E8622C', orangeSoft: '#FDF0E9', gold: '#F2B544',
  green: '#12855C', greenLt: '#1FA873', greenSoft: '#E6F4EE',
  paper: '#F5F7FA', card: '#FFFFFF',
  ink: '#132135', muted: '#66738A', line: '#E1E7F0',
}

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const nw = { whiteSpace: 'nowrap' as const }
const num = { fontVariantNumeric: 'tabular-nums' as const }

const EDADES = [60, 61, 62, 63, 64, 65]
const factorPorEdad = (edad: number) => (edad >= 65 ? 1.0 : 0.75 + (edad - 60) * 0.05)

interface Props {
  escenarios: any[]
  datos: any
  setTab: (t: number) => void
  Tip: (props: { id: string }) => React.ReactElement | null
}

export default function TabImporte({ escenarios, datos, setTab, Tip }: Props) {
  const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const [anim, setAnim] = useState(false)
  const [edadSel, setEdadSel] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAnim(true); return }
    const t = setTimeout(() => setAnim(true), 200)
    return () => clearTimeout(t)
  }, [])

  if (!escRec || escRec.mod40_meses === 0) return (
    <div style={{ textAlign: 'center', padding: '60px', color: K.muted }}>
      <i className="ti ti-coin-off" style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} />
      <p style={{ fontSize: '15px' }}>Completa los datos y el salario Mod. 40 para ver el importe</p>
      <button onClick={() => setTab(2)} style={{ marginTop: '14px', padding: '11px 22px', background: K.navy800, color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontSize: '15px', fontWeight: 600, fontFamily: 'inherit' }}>
        Ir a Salario Mod. 40
      </button>
    </div>
  )

  const pensionActual = escenarios[0]?.pension_base ?? 0
  const incremento = escRec.pension_mensual - pensionActual
  const pctMejora = pensionActual > 0 ? (incremento / pensionActual) * 100 : 0
  const multiplo = pensionActual > 0 ? escRec.pension_mensual / pensionActual : 0
  const edadRet = Math.floor(escRec.edad_retiro || 62)
  const pension100 = escRec.pension_mensual / factorPorEdad(edadRet)
  const edadVer = edadSel ?? edadRet
  const pctHoy = escRec.pension_mensual > 0 ? (pensionActual / escRec.pension_mensual) * 100 : 0

  const DESGLOSE = [
    { label: 'Cuantia basica anual', value: escRec.cuantia_basica_anual ?? 0, color: K.navy600 },
    { label: 'Incrementos anuales', value: escRec.incrementos_anual ?? 0, color: K.green },
    { label: 'Asignaciones familiares', value: escRec.asignaciones_anual ?? 0, color: K.orange },
  ]
  const totalDesglose = DESGLOSE.reduce((s, d) => s + d.value, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Hero: hoy -> palanca -> resultado ──────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '18px', background: `linear-gradient(118deg, ${K.navy900} 0%, ${K.navy800} 54%, ${K.navy600} 100%)` }}>
        <div style={{ position: 'absolute', width: 520, height: 520, right: -160, top: -210, borderRadius: 999, pointerEvents: 'none', background: `radial-gradient(circle, ${K.orange}3D 0%, transparent 68%)` }} />

        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(210px,.85fr) 120px minmax(300px,1.6fr)', alignItems: 'stretch', padding: '34px 34px 26px', gap: '4px' }}>

          <div style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.13)', borderRadius: '14px', padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.5)' }}>HOY</span>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,.78)', margin: '8px 0 0', ...nw }}>Su pension sin Modalidad 40</p>
            <p style={{ fontSize: '40px', fontWeight: 700, color: 'white', margin: '8px 0 0', lineHeight: 1, letterSpacing: '-.025em', ...nw, ...num }}>{fmtMXN(pensionActual)}</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.5)', margin: '10px 0 0', ...nw, ...num }}>{fmtMXN(pensionActual * 12)} al anio</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 2, flex: 1, background: `linear-gradient(180deg, transparent, ${K.gold}88)` }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0' }}>
              <span style={{ width: 44, height: 44, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: K.gold, boxShadow: `0 0 0 8px ${K.gold}22` }}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 10 H14 M10 5 L15 10 L10 15" stroke={K.navy900} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: K.gold, marginTop: '10px', ...nw }}>Modalidad 40</span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,.55)', marginTop: '3px', ...nw }}>{escRec.mod40_umas} UMAs &middot; {escRec.mod40_meses} meses</span>
            </div>
            <div style={{ width: 2, flex: 1, background: `linear-gradient(180deg, ${K.gold}88, transparent)` }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: '30px', minWidth: 0 }}>
            <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.08em', color: K.gold }}>CON MODALIDAD 40</span>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,.8)', margin: '8px 0 0' }}>Su pension mensual, de por vida</p>
            <p style={{ fontSize: 'clamp(46px, 5.6vw, 78px)', fontWeight: 800, color: 'white', letterSpacing: '-.038em', margin: '6px 0 0', lineHeight: 1, ...nw, ...num }}>
              {fmtMXN2(escRec.pension_mensual)}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '18px' }}>
              <span style={{ background: K.green, color: 'white', fontSize: '17px', fontWeight: 700, padding: '10px 17px', borderRadius: 999, ...nw, ...num }}>
                +{fmtMXN2(incremento)} cada mes
              </span>
              <span style={{ background: 'transparent', color: 'white', fontSize: '15px', fontWeight: 600, padding: '10px 17px', borderRadius: 999, border: '1px solid rgba(255,255,255,.26)', ...nw }}>
                {multiplo.toFixed(1)}x su pension actual
              </span>
              <span style={{ background: 'transparent', color: 'white', fontSize: '15px', fontWeight: 600, padding: '10px 17px', borderRadius: 999, border: '1px solid rgba(255,255,255,.26)', ...nw }}>
                +{pctMejora.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Barra de proporcion */}
        <div style={{ position: 'relative', padding: '0 34px 30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '9px', fontSize: '13px' }}>
            <span style={{ color: 'rgba(255,255,255,.62)' }}>Proporcion real entre ambas pensiones</span>
            <span style={{ color: K.gold, fontWeight: 700 }}>Modalidad 40 aporta {(100 - pctHoy).toFixed(0)}% del total</span>
          </div>
          <div style={{ display: 'flex', height: '16px', borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,.08)' }}>
            <span style={{ width: anim ? `${pctHoy}%` : '0%', background: 'rgba(255,255,255,.42)', transition: 'width 1.1s cubic-bezier(.22,1,.36,1)' }} />
            <span style={{ width: anim ? `${100 - pctHoy}%` : '0%', background: `linear-gradient(90deg, ${K.green}, ${K.greenLt})`, transition: 'width 1.1s cubic-bezier(.22,1,.36,1)' }} />
          </div>
          <div style={{ display: 'flex', gap: '22px', marginTop: '10px', fontSize: '13px', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'rgba(255,255,255,.62)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: 'rgba(255,255,255,.42)' }} />Lo que ya tiene
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'white' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: K.greenLt }} />Lo que suma Modalidad 40
            </span>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.15fr) minmax(300px, 1fr)', gap: '20px' }}>

        {/* ── Desglose ──────────────────────────────────────────── */}
        <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 18px' }}>Como se arma la pension</p>

          {totalDesglose > 0 && (
            <div style={{ display: 'flex', height: '42px', borderRadius: '9px', overflow: 'hidden', marginBottom: '20px' }}>
              {DESGLOSE.map((d, i) => {
                const pct = (d.value / totalDesglose) * 100
                return (
                  <div key={i} style={{ width: `${pct}%`, background: d.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {pct > 8 && <span style={{ color: 'white', fontWeight: 700, fontSize: '15px', ...num }}>{pct.toFixed(1)}%</span>}
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {DESGLOSE.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: K.paper, borderRadius: '10px', padding: '14px 16px' }}>
                <span style={{ width: 5, height: 32, background: d.color, borderRadius: 3, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '17px', color: K.ink, fontWeight: 600 }}>{d.label}</span>
                <span style={{ fontSize: '17px', fontWeight: 700, color: K.ink, ...nw, ...num }}>{fmtMXN2(d.value)}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', background: K.navy900, borderRadius: '10px', padding: '16px 20px' }}>
            <span style={{ fontSize: '17px', color: 'rgba(255,255,255,.78)' }}>Pension anual total</span>
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'white', ...nw, ...num }}>{fmtMXN2(escRec.pension_mensual * 12)}</span>
          </div>

          <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '150px', background: K.greenSoft, borderRadius: '10px', padding: '14px 16px' }}>
              <p style={{ fontSize: '13px', color: K.muted, margin: 0 }}>Pension mensual</p>
              <p style={{ fontSize: '22px', fontWeight: 700, color: K.green, margin: '2px 0 0', ...nw, ...num }}>{fmtMXN2(escRec.pension_mensual)}</p>
            </div>
            <div style={{ flex: 1, minWidth: '150px', background: K.orangeSoft, borderRadius: '10px', padding: '14px 16px' }}>
              <p style={{ fontSize: '13px', color: K.muted, margin: 0 }}>Aguinaldo anual</p>
              <p style={{ fontSize: '22px', fontWeight: 700, color: K.orange, margin: '2px 0 0', ...nw, ...num }}>{fmtMXN2(escRec.aguinaldo_anual ?? 0)}</p>
            </div>
          </div>
        </div>

        {/* ── Factor por edad, con curva ────────────────────────── */}
        <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 4px' }}>
            Si se pensiona mas tarde <Tip id="factorEdad" />
          </p>
          <p style={{ fontSize: '13px', color: K.muted, margin: '0 0 14px' }}>Toque un anio para comparar</p>

          {(() => {
            const w = 560, h = 170, pad = 42
            const vals = EDADES.map(e => pension100 * factorPorEdad(e))
            const min = Math.min(...vals) * 0.97, max = Math.max(...vals) * 1.03
            const pts = vals.map((v, i) => [
              pad + (i * (w - pad * 2)) / (EDADES.length - 1),
              h - 38 - ((v - min) / (max - min || 1)) * (h - 80),
            ])
            const linea = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
            return (
              <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: '170px', display: 'block' }}>
                <defs>
                  <linearGradient id="grImporte" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={K.navy600} stopOpacity=".24" />
                    <stop offset="100%" stopColor={K.navy600} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${linea} L${pts[pts.length - 1][0]},${h - 26} L${pts[0][0]},${h - 26} Z`} fill="url(#grImporte)" />
                <path d={linea} fill="none" stroke={K.navy600} strokeWidth="3" strokeLinecap="round" />
                {EDADES.map((edad, i) => {
                  const [x, y] = pts[i]
                  const on = edad === edadVer
                  return (
                    <g key={edad} onClick={() => setEdadSel(edad)} style={{ cursor: 'pointer' }}>
                      {on && <circle cx={x} cy={y} r="12" fill={K.orange} opacity=".18" />}
                      <circle cx={x} cy={y} r={on ? 6.5 : 4} fill={on ? K.orange : 'white'} stroke={on ? K.orange : K.navy600} strokeWidth="3" />
                      <text x={x} y={y - 16} textAnchor="middle" style={{ fontSize: '13px', fontWeight: 700, fill: on ? K.orange : K.muted }}>{fmtMXN(vals[i])}</text>
                      <text x={x} y={h - 6} textAnchor="middle" style={{ fontSize: '13px', fontWeight: on ? 700 : 500, fill: on ? K.ink : K.muted }}>{edad}</text>
                    </g>
                  )
                })}
              </svg>
            )
          })()}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px', marginTop: '12px' }}>
            <thead>
              <tr style={{ borderTop: `1px solid ${K.line}`, borderBottom: `1px solid ${K.line}` }}>
                {['Edad', 'Factor', 'Mensual', 'Anual'].map((hd, i) => (
                  <th key={hd} style={{ padding: '10px 12px', fontSize: '13px', color: K.muted, fontWeight: 500, textAlign: i ? 'right' : 'left' }}>{hd}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EDADES.map(edad => {
                const pct = factorPorEdad(edad)
                const penMens = pension100 * pct
                const on = edad === edadVer
                return (
                  <tr key={edad} onClick={() => setEdadSel(edad)} style={{ background: on ? K.orangeSoft : 'transparent', borderBottom: `1px solid ${K.line}`, cursor: 'pointer' }}>
                    <td style={{ padding: '11px 12px', fontWeight: on ? 700 : 500, color: K.ink, ...num }}>
                      {edad === edadRet ? '\u25B6 ' : ''}{edad} anios
                    </td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700, color: on ? K.orange : K.ink, ...num }}>{(pct * 100).toFixed(0)}%</td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: on ? 700 : 500, color: K.ink, ...nw, ...num }}>{fmtMXN2(penMens)}</td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', color: K.muted, ...nw, ...num }}>{fmtMXN(penMens * 12)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(8)}
          style={{ padding: '13px 24px', background: K.orange, color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '17px', fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 3px 10px rgba(232,98,44,0.34)' }}>
          Escenarios <i className="ti ti-arrow-right" style={{ fontSize: '16px' }} />
        </button>
      </div>
    </div>
  )
}
