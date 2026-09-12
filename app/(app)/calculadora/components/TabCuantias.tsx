'use client'
import React, { useState, useEffect } from 'react'
import { K, nw, num } from '@/lib/design-tokens'



const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const EDADES = [60, 61, 62, 63, 64, 65]
const factorPorEdad = (e: number) => (e >= 65 ? 1.0 : 0.75 + (e - 60) * 0.05)

const CSS = `
@media (max-width: 1000px) { .kse-2col { grid-template-columns: 1fr !important; } }
@media (max-width: 700px) { .kse-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; } }
`

interface Props {
  res: any
  sdiPromedio: number
  datos: any
  setTab: (t: number) => void
  Tip: (props: { id: string }) => React.ReactElement | null
}

export default function TabCuantias({ res, sdiPromedio, datos, setTab, Tip }: Props) {
  const [anim, setAnim] = useState(false)
  const [edadSel, setEdadSel] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAnim(true); return }
    const t = setTimeout(() => setAnim(true), 200)
    return () => clearTimeout(t)
  }, [])

  if (sdiPromedio <= 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: K.muted }}>
      <i className="ti ti-file-alert" style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} />
      <p style={{ fontSize: '15px' }}>Carga la constancia IMSS para ver la pensión actual</p>
    </div>
  )

  const totalAnual = res.pensionAnual || 1
  const componentes = [
    { label: 'Cuantía básica', val: res.cuantiaBasicaAnual, color: K.navy600, nota: 'Art. 167 LSS 1973' },
    { label: 'Incrementos anuales', val: res.incrementosAnual, color: K.green, nota: `${res.numIncrementos?.toFixed(1) ?? '—'} años cotizados` },
    { label: 'Asignaciones familiares', val: res.asignacionesAnual, color: K.orange, nota: 'Art. 164 LSS' },
    { label: 'Ayuda asistencial', val: res.ayudaAsistencialAnual, color: K.purple, nota: 'Art. 166 LSS' },
  ].filter(c => c.val > 0)

  const edadBase = Math.floor(datos.edad_min_pension || 60)
  const edadVer = edadSel ?? edadBase
  const pension100 = res.factorEdad ? res.pensionMensual / res.factorEdad : res.pensionMensual

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <style>{CSS}</style>

      {/* ── Franja: la pension de hoy ──────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '18px', background: `linear-gradient(118deg, ${K.navy900} 0%, ${K.navy800} 60%, ${K.navy600} 100%)` }}>
        <div style={{ position: 'absolute', width: 440, height: 440, right: -150, top: -190, borderRadius: 999, pointerEvents: 'none', background: `radial-gradient(circle, ${K.orange}33 0%, transparent 68%)` }} />
        <div style={{ position: 'relative', padding: '28px 34px 22px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', margin: 0 }}>
            SU PENSIÓN SI SE RETIRA HOY, SIN MODALIDAD 40
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
            <p style={{ fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 800, color: 'white', margin: 0, lineHeight: 1, letterSpacing: '-.035em', ...nw, ...num }}>
              {fmtMXN2(res.pensionMensual)}
            </p>
            {res.pmg_aplica && (
              <span style={{ background: 'rgba(255,255,255,.13)', color: K.gold, fontSize: '15px', fontWeight: 700, padding: '9px 16px', borderRadius: 999, border: `1px solid ${K.gold}55`, ...nw }}>
                Pensión mínima garantizada
              </span>
            )}
          </div>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,.68)', margin: '10px 0 0' }}>
            {res.pmg_aplica
              ? `El cálculo da ${fmtMXN2(res.pensionSinPMG ?? 0)}/mes, por debajo del mínimo de ley. Se otorga la PMG.`
              : `Calculada conforme al Art. 167 LSS 1973 sobre un SDI promedio de ${fmtMXN2(sdiPromedio)} diarios.`}
          </p>
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1px', background: 'rgba(255,255,255,.11)' }}>
          {[
            ['Pensión anual', fmtMXN2(res.pensionAnual), '12 mensualidades', 'white'],
            ['Aguinaldo anual', fmtMXN2(res.aguinaldoAnual), 'Art. 218-A LSS', K.gold],
            ['SDI promedio 250 sem.', fmtMXN2(sdiPromedio), 'base real del cálculo', 'white'],
            ['Factor por edad', `${(res.factorEdad * 100).toFixed(0)}%`, `a los ${edadBase} anios`, K.greenLt],
          ].map((k, i) => (
            <div key={i} style={{ background: K.navy900, padding: '18px 24px' }}>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.56)', margin: 0 }}>{k[0]}</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: k[3], margin: '3px 0 0', ...nw, ...num }}>{k[1]}</p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.44)', margin: '2px 0 0' }}>{k[2]}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="kse-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1.15fr) minmax(280px, 1fr)', gap: '20px' }}>

        {/* ── Desglose ──────────────────────────────────────────── */}
        <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 18px' }}>De qué se compone la pensión anual</p>

          <div style={{ display: 'flex', height: '42px', borderRadius: '9px', overflow: 'hidden', marginBottom: '20px' }}>
            {componentes.map((c, i) => {
              const pct = (c.val / totalAnual) * 100
              return (
                <div key={i} style={{ width: anim ? `${pct}%` : '0%', background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width .9s cubic-bezier(.22,1,.36,1)' }}>
                  {pct > 8 && <span style={{ color: 'white', fontWeight: 700, fontSize: '15px', ...num }}>{pct.toFixed(1)}%</span>}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {componentes.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: K.paper, borderRadius: '10px', padding: '14px 16px' }}>
                <span style={{ width: 5, height: 34, background: c.color, borderRadius: 3, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '17px', color: K.ink, fontWeight: 600, margin: 0 }}>{c.label}</p>
                  <p style={{ fontSize: '13px', color: K.muted, margin: '2px 0 0' }}>{c.nota}</p>
                </div>
                <span style={{ fontSize: '17px', fontWeight: 700, color: K.ink, ...nw, ...num }}>{fmtMXN2(c.val)}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', background: K.navy900, borderRadius: '10px', padding: '16px 20px' }}>
            <span style={{ fontSize: '17px', color: 'rgba(255,255,255,.78)' }}>Total anual</span>
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'white', ...nw, ...num }}>{fmtMXN2(res.pensionAnual)}</span>
          </div>
        </div>

        {/* ── Factores ──────────────────────────────────────────── */}
        <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 14px' }}>Factores del cálculo</p>
          {[
            ['SDI promedio 250 sem.', fmtMXN2(sdiPromedio)],
            ['Salario en veces UMA', `${res.vecesUMA?.toFixed(4) ?? '—'} veces`],
            ['Porcentaje de cuantía básica', `${(res.pctBasica * 100).toFixed(4)}%`],
            ['Incremento anual', `${(res.pctIncremento * 100).toFixed(5)}%`],
            ['Años de incremento', `${res.numIncrementos?.toFixed(1) ?? '—'} anios`],
            [`Factor de edad (${edadBase} anios)`, `${(res.factorEdad * 100).toFixed(0)}%`],
            ['Factor decreto', '1.11'],
          ].map(([l, v], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '12px 0', borderTop: i ? `1px solid ${K.line}` : 'none' }}>
              <span style={{ fontSize: '15px', color: K.muted }}>{l}</span>
              <span style={{ fontSize: '17px', fontWeight: 700, color: K.ink, ...nw, ...num }}>{v}</span>
            </div>
          ))}

          {res.pmg_aplica ? (
            <div style={{ marginTop: '16px', background: K.redSoft, border: `1px solid ${K.red}44`, borderRadius: '10px', padding: '14px 16px' }}>
              <p style={{ fontSize: '15px', color: K.ink, margin: 0, lineHeight: 1.6 }}>
                El cálculo arroja {fmtMXN2(res.pensionSinPMG ?? 0)}/mes, por debajo del minimo de ley.
                Se otorga la <span style={{ color: K.red, fontWeight: 700 }}>pensión mínima garantizada</span> de {fmtMXN2(res.pmgMensual ?? 0)}/mes.
              </p>
            </div>
          ) : (
            <div style={{ marginTop: '16px', background: K.orangeSoft, borderRadius: '10px', padding: '14px 16px' }}>
              <p style={{ fontSize: '15px', color: K.ink, margin: 0, lineHeight: 1.6 }}>
                Las asignaciones familiares no se reducen por el factor de edad.{' '}
                <span style={{ color: K.orange, fontWeight: 700 }}>Art. 164 LSS.</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabla por edad, con curva ──────────────────────────── */}
      <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
        <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 4px' }}>
          Pensión por edad de retiro <Tip id="factorEdad" />
        </p>
        <p style={{ fontSize: '13px', color: K.muted, margin: '0 0 14px' }}>Toque un año para comparar</p>

        {(() => {
          const w = 880, h = 170, pad = 48
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
                <linearGradient id="grCuantias" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={K.navy600} stopOpacity=".24" />
                  <stop offset="100%" stopColor={K.navy600} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${linea} L${pts[pts.length - 1][0]},${h - 26} L${pts[0][0]},${h - 26} Z`} fill="url(#grCuantias)" />
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

        <div className="kse-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px', marginTop: '12px' }}>
            <thead>
              <tr style={{ borderTop: `1px solid ${K.line}`, borderBottom: `1px solid ${K.line}` }}>
                {['Edad', 'Tipo', 'Factor', 'Mensual', 'Anual', 'Aguinaldo'].map((hd, i) => (
                  <th key={hd} style={{ padding: '11px 14px', fontSize: '13px', color: K.muted, fontWeight: 500, textAlign: i < 2 ? 'left' : 'right', ...nw }}>{hd}</th>
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
                    <td style={{ padding: '12px 14px', fontWeight: on ? 700 : 500, color: K.ink, ...nw, ...num }}>
                      {edad === edadBase ? '\u25B6 ' : ''}{edad} anios
                    </td>
                    <td style={{ padding: '12px 14px', color: K.muted, ...nw }}>{edad >= 65 ? 'Vejez' : 'Cesantía E.A.'}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: on ? K.orange : K.ink, ...num }}>{(pct * 100).toFixed(0)}%</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: on ? 700 : 500, color: K.ink, ...nw, ...num }}>{fmtMXN2(penMens)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: K.muted, ...nw, ...num }}>{fmtMXN2(penMens * 12)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: K.muted, ...nw, ...num }}>{fmtMXN2(penMens)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(2)}
          style={{ padding: '13px 24px', background: K.orange, color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '17px', fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 3px 10px rgba(232,98,44,0.34)' }}>
          Salario Mod. 40 <i className="ti ti-arrow-right" style={{ fontSize: '16px' }} />
        </button>
      </div>
    </div>
  )
}
