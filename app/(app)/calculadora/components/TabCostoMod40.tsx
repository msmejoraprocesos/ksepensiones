'use client'
import React, { useState, useEffect } from 'react'
import { K, nw, num, getTermometro } from '@/lib/design-tokens'



const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)



interface Props {
  escenarios: any[]
  sys: any
  getMod40Pct: (year: number) => number
  setTab: (t: number) => void
}

export default function TabCostoMod40({ escenarios, sys, getMod40Pct, setTab }: Props) {
  const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const [anim, setAnim] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAnim(true); return }
    const t = setTimeout(() => setAnim(true), 200)
    return () => clearTimeout(t)
  }, [])

  if (!escRec || escRec.mod40_meses === 0) return (
    <div style={{ textAlign: 'center', padding: '60px', color: K.muted }}>
      <i className="ti ti-coin-off" style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} />
      <p style={{ fontSize: '15px' }}>Configura el Salario Mod. 40 para ver el costo</p>
      <button onClick={() => setTab(2)} style={{ marginTop: '14px', padding: '11px 22px', background: K.navy800, color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontSize: '15px', fontWeight: 600, fontFamily: 'inherit' }}>
        Ir a Salario Mod. 40
      </button>
    </div>
  )

  const t = getTermometro(escRec.roi)
  const pctAfore = sys?.pct_afore_mod40 ?? 19.85

  /* Desglose anio por anio, prorrateando los meses reales que caen en cada
     anio calendario. Antes se asumia 12 meses en todos, por lo que la suma
     de las filas no coincidia con el costo total del escenario. */
  const fIni = escRec.fecha_ingreso_mod40 ? new Date(escRec.fecha_ingreso_mod40) : null
  const anioInicio = fIni ? fIni.getFullYear() : parseInt(escRec.fecha_ingreso_mod40?.slice(0, 4) || '2027')
  const mesInicio = fIni ? fIni.getMonth() : 0
  const totalMeses = escRec.mod40_meses || 0
  const sdi = escRec.sdi_mod40 ?? 0

  const mapa = new Map<number, number>()
  for (let m = 0; m < totalMeses; m++) {
    const a = anioInicio + Math.floor((mesInicio + m) / 12)
    mapa.set(a, (mapa.get(a) ?? 0) + 1)
  }

  const rows = Array.from(mapa.entries()).sort((a, b) => a[0] - b[0]).map(([a, meses]) => {
    const tasa = getMod40Pct(a)
    const diasAño = a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0) ? 366 : 365
    const cuotaMens = sdi * (tasa / 100) * diasAño / 12
    return { a, meses, tasa, cuotaMens, subtotal: cuotaMens * meses }
  })

  const sumaFilas = rows.reduce((s, r) => s + r.subtotal, 0)
  const maxSub = Math.max(...rows.map(r => r.subtotal), 1)
  const cuotaPromedio = totalMeses > 0 ? escRec.costo_total / totalMeses : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <style>{`
        @media (max-width: 1000px) {
          .kse-2col { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 700px) {
          .kse-tabla-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>

      {/* ── Franja de cifras ───────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '18px', background: `linear-gradient(118deg, ${K.navy900} 0%, ${K.navy800} 60%, ${K.navy600} 100%)` }}>
        <div style={{ position: 'absolute', width: 460, height: 460, right: -150, top: -190, borderRadius: 999, pointerEvents: 'none', background: `radial-gradient(circle, ${K.orange}33 0%, transparent 68%)` }} />
        <div style={{ position: 'relative', padding: '28px 34px 22px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', margin: 0 }}>LO QUE CUESTA MODALIDAD 40</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
            <p style={{ fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 800, color: 'white', margin: 0, lineHeight: 1, letterSpacing: '-.035em', ...nw, ...num }}>
              {fmtMXN2(escRec.inversion_neta)}
            </p>
            <span style={{ fontSize: '17px', color: 'rgba(255,255,255,.7)' }}>de inversión neta</span>
          </div>

          {/* Costo total -> AFORE -> neta, a escala */}
          {escRec.costo_total > 0 && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', height: '16px', borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,.08)' }}>
                <span style={{ width: anim ? `${(escRec.inversion_neta / escRec.costo_total) * 100}%` : '0%', background: K.gold, transition: 'width 1s cubic-bezier(.22,1,.36,1)' }} />
                <span style={{ width: anim ? `${(escRec.recuperacion_afore / escRec.costo_total) * 100}%` : '0%', background: K.greenLt, transition: 'width 1s cubic-bezier(.22,1,.36,1)' }} />
              </div>
              <div style={{ display: 'flex', gap: '22px', marginTop: '10px', fontSize: '13px', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'rgba(255,255,255,.8)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: K.gold }} />Sale de su bolsillo
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', color: 'rgba(255,255,255,.8)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: K.greenLt }} />Regresa por AFORE ({pctAfore}%)
                </span>
              </div>
            </div>
          )}
        </div>

        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1px', background: 'rgba(255,255,255,.11)' }}>
          {[
            { label: 'Costo total de Mod. 40', value: fmtMXN2(escRec.costo_total), sub: `${totalMeses} meses de cuotas`, color: 'white' },
            { label: `Recuperación AFORE (${pctAfore}%)`, value: '- ' + fmtMXN2(escRec.recuperacion_afore), sub: 'se devuelve al resolver', color: K.greenLt },
            { label: 'Cuota mensual promedio', value: fmtMXN2(cuotaPromedio), sub: 'varía cada año', color: K.gold },
            { label: 'Se recupera en', value: `${escRec.roi} meses`, sub: t.label, color: K.greenLt },
          ].map((k, i) => (
            <div key={i} style={{ background: K.navy900, padding: '18px 24px' }}>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.56)', margin: 0 }}>{k.label}</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: k.color, margin: '3px 0 0', ...nw, ...num }}>{k.value}</p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.44)', margin: '2px 0 0' }}>{k.sub}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="kse-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.6fr) minmax(280px, 1fr)', gap: '20px' }}>

        {/* ── Desglose anio por anio ─────────────────────────────── */}
        <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 4px' }}>Cuánto se paga cada año</p>
          <p style={{ fontSize: '13px', color: K.muted, margin: '0 0 18px' }}>
            La tasa sube cada año por decreto, así que la cuota también
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${K.line}` }}>
                {['Año', 'Meses', 'Tasa', 'Cuota mensual', 'Subtotal'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 12px', fontSize: '13px', color: K.muted, fontWeight: 500, textAlign: i ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${K.line}` }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: K.ink, ...num }}>{r.a}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: K.muted, ...num }}>{r.meses}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: K.muted, ...num }}>{r.tasa.toFixed(3)}%</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600, color: K.ink, ...nw, ...num }}>{fmtMXN2(r.cuotaMens)}</td>
                  <td style={{ padding: '12px', textAlign: 'right', ...nw }}>
                    <span style={{ fontWeight: 700, color: K.navy600, ...num }}>{fmtMXN2(r.subtotal)}</span>
                    <span style={{ display: 'block', height: '5px', background: K.paper, borderRadius: 3, marginTop: '5px', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: anim ? `${(r.subtotal / maxSub) * 100}%` : '0%', background: K.navy600, borderRadius: 3, transition: 'width .9s cubic-bezier(.22,1,.36,1)' }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', background: K.navy900, borderRadius: '10px', padding: '16px 20px' }}>
            <span style={{ fontSize: '17px', color: 'rgba(255,255,255,.78)' }}>Total de {totalMeses} meses</span>
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'white', ...nw, ...num }}>{fmtMXN2(escRec.costo_total)}</span>
          </div>

          {Math.abs(sumaFilas - escRec.costo_total) > 1 && (
            <p style={{ fontSize: '13px', color: K.muted, margin: '10px 0 0' }}>
              La suma por anio difiere en {fmtMXN(Math.abs(sumaFilas - escRec.costo_total))} del total por el redondeo de dias en cada anio.
            </p>
          )}
        </div>

        {/* ── Paneles laterales ──────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
            <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 14px' }}>Flujo de caja</p>
            {[
              { label: 'Costo total de Mod. 40', value: fmtMXN2(escRec.costo_total), color: K.ink },
              { label: `Menos AFORE recuperable (${pctAfore}%)`, value: '- ' + fmtMXN2(escRec.recuperacion_afore), color: K.green },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '12px 0', borderTop: i ? `1px solid ${K.line}` : 'none' }}>
                <span style={{ fontSize: '15px', color: K.muted }}>{r.label}</span>
                <span style={{ fontSize: '17px', fontWeight: 700, color: r.color, ...nw, ...num }}>{r.value}</span>
              </div>
            ))}
            <div style={{ marginTop: '10px', background: K.orangeSoft, borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ fontSize: '15px', color: K.ink, fontWeight: 600 }}>Inversión neta final</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: K.orange, ...nw, ...num }}>{fmtMXN2(escRec.inversion_neta)}</span>
            </div>
          </div>

          <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
            <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 14px' }}>Rentabilidad</p>
            {[
              { label: 'Ganancia acumulada a los 80 años', value: fmtMXN(escRec.ganancia_a80), color: K.green, fuerte: true },
              { label: 'Retorno sobre lo invertido', value: `${((escRec.tasa_rendimiento ?? 0) / 100).toFixed(1)} veces`, color: K.green, fuerte: true },
              { label: 'Meses para recuperar', value: `${escRec.roi} meses`, color: K.ink },
              { label: 'Meses de cobro hasta los 80', value: `${Math.round((80 - (escRec.edad_retiro ?? 60)) * 12)}`, color: K.ink },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '12px 0', borderTop: i ? `1px solid ${K.line}` : 'none' }}>
                <span style={{ fontSize: '15px', color: K.muted }}>{r.label}</span>
                <span style={{ fontSize: r.fuerte ? '19px' : '17px', fontWeight: 700, color: r.color, ...nw, ...num }}>{r.value}</span>
              </div>
            ))}
            <div style={{ marginTop: '14px', background: t.bg, borderRadius: '10px', padding: '14px 16px' }}>
              <p style={{ fontSize: '15px', fontWeight: 700, color: t.color, margin: 0 }}>{t.label}</p>
              <p style={{ fontSize: '15px', color: K.ink, margin: '4px 0 0', lineHeight: 1.55 }}>{t.explica}</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(5)}
          style={{ padding: '13px 24px', background: K.orange, color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '17px', fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 3px 10px rgba(232,98,44,0.34)' }}>
          Importe de pensión <i className="ti ti-arrow-right" style={{ fontSize: '16px' }} />
        </button>
      </div>
    </div>
  )
}
