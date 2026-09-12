'use client'
import React, { useState, useEffect } from 'react'
import { esEscenarioMod40 } from '@/app/utils/formulas'
import { K, nw, num, COLORES_SERIE as COLORES, getTermometro, HORIZONTE_MESES } from '@/lib/design-tokens'
import GuiaTermometro from './GuiaTermometro'



const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)




interface Props {
  escenarios: any[]
  setTab: (t: number) => void
  fmtMXN: (n: number) => string
}

export default function TabEscenarios({ escenarios, setTab }: Props) {
  const [vista, setVista] = useState<'cards' | 'tabla'>('cards')
  const [sel, setSel] = useState(0)
  const [anim, setAnim] = useState(false)

  const escsConMod40 = escenarios.filter(esEscenarioMod40)
  const pensionBase = escenarios[0]?.pension_base ?? 0

  useEffect(() => {
    const idx = escsConMod40.findIndex(e => e.recomendado)
    if (idx >= 0) setSel(idx)
  }, [escenarios.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAnim(true); return }
    const t = setTimeout(() => setAnim(true), 200)
    return () => clearTimeout(t)
  }, [])

  if (escsConMod40.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px', color: K.muted }}>
      <i className="ti ti-chart-bar-off" style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} />
      <p style={{ fontSize: '15px' }}>Completa el Salario Mod. 40 para generar escenarios comparativos</p>
      <button onClick={() => setTab(2)} style={{ marginTop: '14px', padding: '11px 22px', background: K.navy800, color: 'white', border: 'none', borderRadius: '9px', cursor: 'pointer', fontSize: '15px', fontWeight: 600, fontFamily: 'inherit' }}>
        Ir a Salario Mod. 40
      </button>
    </div>
  )

  const maxPension = Math.max(...escsConMod40.map(e => e.pension_mensual))
  const idxSel = Math.min(sel, escsConMod40.length - 1)
  const escSel = escsConMod40[idxSel]
  const colorSel = COLORES[idxSel] || K.navy600

  const CAMPOS = (e: any) => [
    { label: 'Duración Mod. 40', value: `${e.mod40_meses} meses (${(e.mod40_meses / 12).toFixed(1)} anios)` },
    { label: 'UMAs registradas', value: String(e.mod40_umas) },
    { label: 'Costo total de Mod. 40', value: fmtMXN2(e.costo_total) },
    { label: 'Menos recuperación AFORE', value: '- ' + fmtMXN2(e.recuperacion_afore) },
    { label: 'Inversión neta', value: fmtMXN2(e.inversion_neta), fuerte: true },
    { label: 'Ganancia acumulada a los 80 años', value: fmtMXN2(e.ganancia_a80), fuerte: true },
    { label: 'Retorno sobre lo invertido', value: `${((e.tasa_rendimiento ?? 0) / 100).toFixed(1)} veces`, fuerte: true },
    { label: 'Aguinaldo anual', value: fmtMXN2(e.aguinaldo_anual) },
  ]

  const t = getTermometro(escSel.roi)
  const pctRec = Math.min(100, (escSel.roi / HORIZONTE_MESES) * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <style>{`
        @media (max-width: 1000px) {
          .kse-2col { grid-template-columns: 1fr !important; }
          /* Apilado, el detalle quedaba debajo de la grafica: tocar una
             tarjeta dejaba el resultado dos pantallas abajo. Sube a quedar
             pegado a las tarjetas, que es desde donde se selecciona. */
          .kse-2col > .kse-detalle { order: -1; }
        }
        @media (max-width: 860px) {
          .kse-hero3 { grid-template-columns: 1fr !important; gap: 16px !important; padding: 26px 22px !important; }
          .kse-hero3 > div:nth-child(2) { flex-direction: row !important; height: 56px; }
          .kse-hero3 > div:nth-child(2) > div:first-child,
          .kse-hero3 > div:nth-child(2) > div:last-child { width: 100% !important; height: 2px !important; flex: 1; }
          .kse-hero3 > div:last-child { padding-left: 0 !important; }
        }
        @media (max-width: 700px) {
          .kse-tabla-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: K.ink, margin: 0, letterSpacing: '-0.015em' }}>
            Comparativa de escenarios
          </h2>
          <p style={{ fontSize: '15px', color: K.muted, margin: '4px 0 0' }}>
            Base actual: <strong style={{ color: K.ink, ...num }}>{fmtMXN2(pensionBase)}</strong>/mes sin Mod. 40
          </p>
        </div>
        <div style={{ display: 'flex', gap: '2px', background: K.card, borderRadius: '10px', padding: '3px', border: `1px solid ${K.line}` }}>
          {(['cards', 'tabla'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '15px', fontWeight: 600, background: vista === v ? K.navy800 : 'transparent', color: vista === v ? 'white' : K.muted, ...nw }}>
              {v === 'cards' ? 'Tarjetas' : 'Tabla'}
            </button>
          ))}
        </div>
      </div>

      {vista === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          {escsConMod40.slice(0, 6).map((esc, i) => {
            const on = i === idxSel
            const c = COLORES[i] || K.navy600
            return (
              <button key={i} onClick={() => setSel(i)}
                style={{ textAlign: 'left', cursor: 'pointer', borderRadius: '13px', padding: '18px', background: K.card, fontFamily: 'inherit', border: on ? `2px solid ${c}` : `1px solid ${K.line}`, boxShadow: on ? `0 4px 16px ${c}26` : '0 1px 3px rgba(19,33,53,0.06)', transform: on ? 'translateY(-2px)' : 'none', transition: 'all .2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: c, ...nw }}>
                    {esc.recomendado && '* '}Escenario {i + 1}
                  </span>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: c, flexShrink: 0, opacity: on ? 1 : 0.35 }} />
                </div>
                <p style={{ fontSize: '25px', fontWeight: 800, color: K.ink, margin: '7px 0 0', letterSpacing: '-0.025em', ...nw, ...num }}>
                  {fmtMXN(esc.pension_mensual)}
                </p>
                <p style={{ fontSize: '13px', color: K.green, fontWeight: 700, margin: '3px 0 0', ...nw, ...num }}>
                  +{fmtMXN(esc.pension_mensual - pensionBase)}/mes
                </p>
                <p style={{ fontSize: '12px', color: K.muted, margin: '8px 0 0', ...nw }}>
                  {esc.mod40_umas} UMAs &middot; {esc.mod40_meses} meses
                </p>
                <p style={{ fontSize: '12px', color: K.muted, margin: '2px 0 0', ...nw, ...num }}>
                  Inversión neta {fmtMXN(esc.inversion_neta)}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {vista === 'cards' && (
        <div className="kse-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.35fr) minmax(280px, 1fr)', gap: '20px' }}>

          <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
            <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 4px' }}>Comparativo visual de pensión mensual</p>
            <p style={{ fontSize: '13px', color: K.muted, margin: '0 0 18px' }}>Toque una barra para ver el escenario en detalle</p>

            {[{ label: 'Sin Mod. 40', value: pensionBase, color: '#9AA7B8', idx: -1, rec: false },
              ...escsConMod40.slice(0, 6).map((e, i) => ({
                label: `Esc. ${i + 1} - ${e.mod40_umas} UMAs`,
                value: e.pension_mensual, color: COLORES[i] || K.navy600, idx: i, rec: !!e.recomendado,
              }))].map((f, i) => {
              const on = f.idx === idxSel
              const pct = maxPension > 0 ? (f.value / maxPension) * 100 : 0
              return (
                <button key={i} onClick={() => { if (f.idx >= 0) setSel(f.idx) }}
                  style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: '7px 0', cursor: f.idx >= 0 ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ width: '168px', flexShrink: 0, fontSize: '13px', color: on ? K.ink : K.muted, fontWeight: on || f.rec ? 700 : 500, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', ...nw }}>
                      {f.rec && '* '}{f.label}
                    </span>
                    <span style={{ flex: 1, height: '30px', background: K.paper, borderRadius: '6px', position: 'relative', overflow: 'hidden' }}>
                      <span style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: anim ? `${pct}%` : '0%', background: f.color, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '10px', opacity: f.idx >= 0 && !on ? 0.45 : 1, transition: 'width .9s cubic-bezier(.22,1,.36,1), opacity .25s' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'white', ...nw, ...num }}>{fmtMXN2(f.value)}</span>
                      </span>
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="kse-detalle" style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', overflow: 'hidden', alignSelf: 'start' }}>
            <div style={{ background: colorSel, padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.85)', ...nw }}>
                  {escSel.recomendado && '* '}Escenario {idxSel + 1}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'white', background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: 999, ...nw }}>
                  {escSel.mod40_umas} UMAs &middot; {escSel.mod40_meses} meses
                </span>
              </div>
              <p style={{ fontSize: '38px', fontWeight: 800, color: 'white', margin: '8px 0 0', lineHeight: 1, letterSpacing: '-0.03em', ...nw, ...num }}>
                {fmtMXN2(escSel.pension_mensual)}
              </p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', margin: '4px 0 0' }}>pensión mensual</p>
            </div>

            <div style={{ background: K.greenSoft, padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ fontSize: '15px', color: K.ink }}>Mejora vs sin Mod. 40</span>
              <span style={{ fontSize: '20px', fontWeight: 700, color: K.green, ...nw, ...num }}>
                +{fmtMXN2(escSel.pension_mensual - pensionBase)}/mes
              </span>
            </div>

            <div style={{ padding: '6px 22px 16px' }}>
              {CAMPOS(escSel).map((r, ri) => (
                <div key={ri} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', padding: '12px 0', borderTop: ri ? `1px solid ${K.line}` : 'none' }}>
                  <span style={{ fontSize: '15px', color: K.muted }}>{r.label}</span>
                  <span style={{ fontSize: '17px', fontWeight: 700, color: r.fuerte ? colorSel : K.ink, ...nw, ...num }}>{r.value}</span>
                </div>
              ))}
            </div>

            <div style={{ background: K.paper, borderTop: `1px solid ${K.line}`, padding: '16px 22px' }}>
              <div style={{ display: 'flex', height: '10px', borderRadius: 999, overflow: 'hidden', background: 'rgba(0,0,0,0.06)' }}>
                <span style={{ width: `${pctRec}%`, background: K.muted }} />
                <span style={{ flex: 1, background: K.greenLt }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: K.muted }}>
                  <strong style={{ color: K.ink }}>{escSel.roi} meses</strong> para recuperar
                </span>
                <span style={{ fontSize: '13px', color: K.green, fontWeight: 700, ...nw }}>
                  {Math.max(0, HORIZONTE_MESES - escSel.roi)} meses de ganancia neta
                </span>
              </div>
              <div style={{ marginTop: '12px', background: t.bg, borderRadius: '9px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: t.color, margin: 0 }}>{t.label}</p>
                  <GuiaTermometro meses={escSel.roi} />
                </div>
                <p style={{ fontSize: '13px', color: K.ink, margin: '4px 0 0', lineHeight: 1.5 }}>{t.explica}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {vista === 'tabla' && (
        <div style={{ background: K.card, borderRadius: '14px', border: `1px solid ${K.line}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(19,33,53,0.06)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
              <thead>
                <tr style={{ background: K.navy900 }}>
                  <th style={{ padding: '13px 16px', color: 'white', textAlign: 'left', fontWeight: 600, fontSize: '13px', position: 'sticky', left: 0, background: K.navy900 }}>Concepto</th>
                  <th style={{ padding: '13px 16px', color: 'rgba(255,255,255,0.6)', textAlign: 'right', fontWeight: 600, fontSize: '13px', ...nw }}>Sin Mod. 40</th>
                  {escsConMod40.slice(0, 6).map((e, i) => (
                    <th key={i} onClick={() => setSel(i)} style={{ padding: '13px 16px', color: i === idxSel ? K.gold : 'white', textAlign: 'right', fontWeight: 700, fontSize: '13px', cursor: 'pointer', ...nw }}>
                      {e.recomendado && '* '}Esc. {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Pensión mensual', fn: (e: any) => fmtMXN2(e.pension_mensual), base: fmtMXN2(pensionBase), h: true },
                  { label: 'Mejora mensual', fn: (e: any) => '+' + fmtMXN2(e.pension_mensual - pensionBase), base: '-', h: true },
                  { label: 'Duración Mod. 40', fn: (e: any) => `${e.mod40_meses} meses`, base: '-' },
                  { label: 'UMAs registradas', fn: (e: any) => String(e.mod40_umas), base: '-' },
                  { label: 'Costo total de Mod. 40', fn: (e: any) => fmtMXN2(e.costo_total), base: '-' },
                  { label: 'Menos recuperación AFORE', fn: (e: any) => '- ' + fmtMXN2(e.recuperacion_afore), base: '-' },
                  { label: 'Inversión neta', fn: (e: any) => fmtMXN2(e.inversion_neta), base: '-', h: true },
                  { label: 'Meses para recuperar', fn: (e: any) => `${e.roi} meses`, base: '-' },
                  { label: 'Ganancia acumulada a los 80 años', fn: (e: any) => fmtMXN2(e.ganancia_a80), base: '-', h: true },
                  { label: 'Retorno sobre lo invertido', fn: (e: any) => `${((e.tasa_rendimiento ?? 0) / 100).toFixed(1)}x`, base: '-' },
                  { label: 'Aguinaldo anual', fn: (e: any) => fmtMXN2(e.aguinaldo_anual), base: '-' },
                ].map((row, ri) => {
                  const bg = row.h ? '#EEF2F8' : ri % 2 === 0 ? 'white' : '#F9FAFB'
                  return (
                    <tr key={ri} style={{ background: bg, borderBottom: `1px solid ${K.line}` }}>
                      <td style={{ padding: '12px 16px', color: K.ink, fontWeight: row.h ? 700 : 400, position: 'sticky', left: 0, background: bg, fontSize: '15px' }}>{row.label}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: K.muted, fontSize: '15px', ...nw, ...num }}>{row.base}</td>
                      {escsConMod40.slice(0, 6).map((e, i) => (
                        <td key={i} onClick={() => setSel(i)} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: row.h ? 700 : 500, color: row.h ? K.navy800 : K.ink, fontSize: '15px', cursor: 'pointer', background: i === idxSel ? K.orangeSoft : 'transparent', ...nw, ...num }}>{row.fn(e)}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(10)}
          style={{ padding: '13px 24px', background: K.orange, color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '17px', fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 3px 10px rgba(232,98,44,0.34)' }}>
          Financiamiento <i className="ti ti-arrow-right" style={{ fontSize: '16px' }} />
        </button>
      </div>
    </div>
  )
}
