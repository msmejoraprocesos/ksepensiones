'use client'
import React, { useState, useEffect } from 'react'

/* Tokens — docs/rediseno/SISTEMA-DISENO.md */
const K = {
  navy900: '#0D2440', navy800: '#14375F', navy600: '#245287',
  orange: '#E8622C', orangeSoft: '#FDF0E9', gold: '#F2B544',
  green: '#12855C', greenLt: '#1FA873', greenSoft: '#E6F4EE',
  red: '#B91C1C', redSoft: '#FEF2F2',
  paper: '#F5F7FA', card: '#FFFFFF',
  ink: '#132135', muted: '#66738A', line: '#E1E7F0',
}

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const nw = { whiteSpace: 'nowrap' as const }
const num = { fontVariantNumeric: 'tabular-nums' as const }

interface Props {
  escenarios: any[]
  sys: any
  duracionTramiteMeses: number
  setDuracionTramiteMeses: (v: number) => void
  plazoCredito: number
  setPlazoCredito: (v: number) => void
  setTab: (t: number) => void
}

export default function TabFinanciamiento({
  escenarios, sys, duracionTramiteMeses, setDuracionTramiteMeses,
  plazoCredito, setPlazoCredito, setTab
}: Props) {
  const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const [anim, setAnim] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAnim(true); return }
    const t = setTimeout(() => setAnim(true), 200)
    return () => clearTimeout(t)
  }, [])

  if (!escRec || escRec.mod40_meses === 0) return (
    <div style={{ textAlign: 'center', padding: '60px', color: K.muted }}>
      <i className="ti ti-building-bank" style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} />
      <p style={{ fontSize: '15px' }}>Completa las pestanias anteriores para ver el financiamiento</p>
    </div>
  )

  const total = escRec.costo_retroactivo ?? escRec.costo_total ?? 0
  const pctBanco = sys?.pct_banco_regulado ?? 35.65
  const pctAfore = sys?.pct_afore_mod40 ?? 19.85
  const tasaBanco = sys?.tasa_banco_anual ?? 32.2

  const pensionBase = escenarios[0]?.pension_base ?? 0
  const pensionDurante = escRec.pension_inmediata ?? 0
  const pensionFinal = escRec.pension_al_liquidar ?? escRec.pension_mensual ?? 0
  const descuento = escRec.descuento_mensual ?? 0

  /* Sobrecosto del pago retroactivo respecto a cotizar mes a mes.
     Se expresa sobre el costo base (Art. 17-A y 21 CFF: actualizacion + recargos). */
  const costoBase = escRec.costo_total ?? 0
  const sobrecosto = costoBase > 0 && total > costoBase ? ((total - costoBase) / costoBase) * 100 : 0

  const slices = [
    { label: 'Banco regulado', val: escRec.aportacion_banco ?? 0, pct: pctBanco, color: K.navy600 },
    { label: 'AFORE (recuperacion)', val: escRec.recuperacion_afore_retro ?? escRec.recuperacion_afore ?? 0, pct: pctAfore, color: K.green },
    { label: 'Cuenta propia / fondeador', val: escRec.aportacion_segundo_fondeo ?? 0, pct: Math.max(0, 100 - pctBanco - pctAfore), color: K.orange },
  ]

  const maxPen = Math.max(pensionBase, pensionDurante, pensionFinal, 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Franja de cifras ───────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '18px', background: `linear-gradient(118deg, ${K.navy900} 0%, ${K.navy800} 60%, ${K.navy600} 100%)` }}>
        <div style={{ position: 'absolute', width: 460, height: 460, right: -150, top: -190, borderRadius: 999, pointerEvents: 'none', background: `radial-gradient(circle, ${K.orange}33 0%, transparent 68%)` }} />
        <div style={{ position: 'relative', padding: '28px 34px 22px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', margin: 0 }}>TOTAL A FINANCIAR</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
            <p style={{ fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 800, color: 'white', margin: 0, lineHeight: 1, letterSpacing: '-.035em', ...nw, ...num }}>
              {fmtMXN(total)}
            </p>
            {sobrecosto > 0 && (
              <span style={{ background: 'rgba(255,255,255,.13)', color: K.gold, fontSize: '15px', fontWeight: 700, padding: '9px 16px', borderRadius: 999, border: `1px solid ${K.gold}55`, ...nw, ...num }}>
                +{sobrecosto.toFixed(1)}% sobre cotizar mes a mes
              </span>
            )}
          </div>
          {sobrecosto > 0 && (
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,.68)', margin: '10px 0 0' }}>
              Pagar retroactivo agrega actualizaciones y recargos: {fmtMXN(total - costoBase)} mas que cotizar desde hoy.
            </p>
          )}
        </div>

        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1px', background: 'rgba(255,255,255,.11)' }}>
          {[
            { label: `Banco regulado (${pctBanco}%)`, value: fmtMXN(escRec.aportacion_banco ?? 0), sub: `${tasaBanco}% anual`, color: 'white' },
            { label: 'Cuenta propia / fondeador', value: fmtMXN(escRec.aportacion_segundo_fondeo ?? 0), sub: 'aportacion directa', color: K.gold },
            { label: 'Descuento mensual', value: fmtMXN2(descuento), sub: `durante ${plazoCredito} meses`, color: '#FCA5A5' },
            { label: 'Pension al liquidar', value: fmtMXN2(pensionFinal), sub: 'libre de descuento', color: K.greenLt },
          ].map((k, i) => (
            <div key={i} style={{ background: K.navy900, padding: '18px 24px' }}>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.56)', margin: 0 }}>{k.label}</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: k.color, margin: '3px 0 0', ...nw, ...num }}>{k.value}</p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.44)', margin: '2px 0 0' }}>{k.sub}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.3fr) minmax(280px, 1fr)', gap: '20px' }}>

        {/* ── Distribucion del pago ──────────────────────────────── */}
        <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 4px' }}>De donde sale el dinero</p>
          <p style={{ fontSize: '13px', color: K.muted, margin: '0 0 18px' }}>Distribucion del pago retroactivo</p>

          <div style={{ display: 'flex', height: '42px', borderRadius: '9px', overflow: 'hidden', marginBottom: '20px' }}>
            {slices.map((s, i) => (
              <div key={i} style={{ width: anim ? `${s.pct}%` : '0%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width .9s cubic-bezier(.22,1,.36,1)' }}>
                {s.pct > 9 && <span style={{ color: 'white', fontWeight: 700, fontSize: '15px', ...num }}>{s.pct.toFixed(1)}%</span>}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {slices.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', background: K.paper, borderRadius: '10px', padding: '14px 16px' }}>
                <span style={{ width: 5, height: 32, background: s.color, borderRadius: 3, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '17px', color: K.ink, fontWeight: 600 }}>{s.label}</span>
                <span style={{ textAlign: 'right' }}>
                  <span style={{ display: 'block', fontSize: '17px', fontWeight: 700, color: K.ink, ...nw, ...num }}>{fmtMXN(s.val)}</span>
                  <span style={{ display: 'block', fontSize: '13px', color: K.muted, ...num }}>{s.pct.toFixed(1)}%</span>
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', background: K.navy900, borderRadius: '10px', padding: '16px 20px' }}>
            <span style={{ fontSize: '17px', color: 'rgba(255,255,255,.78)' }}>Total</span>
            <span style={{ fontSize: '24px', fontWeight: 700, color: 'white', ...nw, ...num }}>{fmtMXN(total)}</span>
          </div>
        </div>

        {/* ── Parametros + pension disponible ────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
            <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 16px' }}>Parametros del credito</p>
            {[
              { label: 'Duracion del tramite', value: duracionTramiteMeses, onChange: setDuracionTramiteMeses, options: [12, 18, 24, 30, 36, 48, 60], fmt: (v: number) => `${v} meses` },
              { label: 'Plazo del credito', value: plazoCredito, onChange: setPlazoCredito, options: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120], fmt: (v: number) => `${v} meses (${(v / 12).toFixed(1)} anios)` },
            ].map((f, i) => (
              <div key={i} style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '15px', color: K.muted, marginBottom: '6px' }}>{f.label}</label>
                <select value={f.value} onChange={e => f.onChange(Number(e.target.value))}
                  style={{ width: '100%', height: '48px', border: `1px solid ${K.line}`, borderRadius: '10px', padding: '0 14px', fontSize: '17px', fontFamily: 'inherit', background: K.card, color: K.ink, fontWeight: 600, boxSizing: 'border-box', cursor: 'pointer' }}>
                  {f.options.map(o => <option key={o} value={o}>{f.fmt(o)}</option>)}
                </select>
              </div>
            ))}
            <div style={{ background: K.orangeSoft, borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ fontSize: '15px', color: K.ink }}>Tasa del banco regulado</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: K.orange, ...nw, ...num }}>{tasaBanco}% anual</span>
            </div>
          </div>

          <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
            <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 4px' }}>Que cobra en cada etapa</p>
            <p style={{ fontSize: '13px', color: K.muted, margin: '0 0 18px' }}>Pension mensual disponible</p>

            {[
              { label: 'Sin Mod. 40 (hoy)', value: pensionBase, color: '#9AA7B8', nota: '' },
              { label: 'Durante el credito', value: pensionDurante, color: K.orange, nota: `descuento de ${fmtMXN2(descuento)}/mes` },
              { label: 'Al liquidar el credito', value: pensionFinal, color: K.green, nota: 'de por vida' },
            ].map((e, i) => (
              <div key={i} style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '15px', color: K.ink, fontWeight: i === 2 ? 700 : 500 }}>{e.label}</span>
                  <span style={{ fontSize: i === 2 ? '20px' : '17px', fontWeight: 700, color: e.color, ...nw, ...num }}>{fmtMXN2(e.value)}</span>
                </div>
                <div style={{ height: '10px', background: K.paper, borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: anim ? `${(e.value / maxPen) * 100}%` : '0%', background: e.color, borderRadius: 999, transition: 'width .9s cubic-bezier(.22,1,.36,1)' }} />
                </div>
                {e.nota && <p style={{ fontSize: '13px', color: K.muted, margin: '5px 0 0' }}>{e.nota}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(11)}
          style={{ padding: '13px 24px', background: K.orange, color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '17px', fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 3px 10px rgba(232,98,44,0.34)' }}>
          El entregable <i className="ti ti-arrow-right" style={{ fontSize: '16px' }} />
        </button>
      </div>
    </div>
  )
}
