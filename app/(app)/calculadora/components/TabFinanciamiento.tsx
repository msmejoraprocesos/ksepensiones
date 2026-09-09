'use client'
import React from 'react'

const AZUL = '#334E7B'
const VERDE = '#2E7D5A'
const NARANJA = '#E8724A'
const BORDE = '#E2E8F0'

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

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

  if (!escRec || escRec.mod40_meses === 0) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>
      <i className="ti ti-building-bank" style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} />
      <p style={{ fontSize: '14px' }}>Completa las pestañas anteriores para ver el financiamiento</p>
    </div>
  )

  const total = escRec.costo_retroactivo ?? escRec.costo_total ?? 0
  const pctBanco = sys?.pct_banco_regulado ?? 35.65
  const pctAfore = sys?.pct_afore_mod40 ?? 19.85
  const tasaBanco = sys?.tasa_banco_anual ?? 32.2

  const slices = [
    { label: 'Banco regulado', val: escRec.aportacion_banco ?? 0, pct: pctBanco, color: AZUL },
    { label: 'AFORE (recuperación)', val: escRec.recuperacion_afore_retro ?? escRec.recuperacion_afore ?? 0, pct: pctAfore, color: VERDE },
    { label: 'Cuenta propia / fondeador', val: escRec.aportacion_segundo_fondeo ?? 0, pct: 100 - pctBanco - pctAfore, color: NARANJA },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* KPIs de financiamiento */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {[
          { label: 'Total a financiar', value: fmtMXN(total), color: AZUL, bg: '#EEF2F8', border: AZUL },
          { label: `Banco (${pctBanco}%)`, value: fmtMXN(escRec.aportacion_banco ?? 0), color: '#1D4ED8', bg: '#EFF6FF', border: '#93C5FD' },
          { label: 'Cuenta propia', value: fmtMXN(escRec.aportacion_segundo_fondeo ?? 0), color: '#B45309', bg: '#FFFBEB', border: '#FCD34D' },
          { label: 'Desc. mensual a pensión', value: fmtMXN2(escRec.descuento_mensual ?? 0), color: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5' },
        ].map((k, i) => (
          <div key={i} style={{ background: k.bg, borderTop: `3px solid ${k.border}`, padding: '10px 12px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: '600' }}>{k.label}</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* Distribución visual */}
        <div style={{ background: 'white', borderRadius: '12px', borderLeft: `4px solid ${AZUL}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#EEF2F8', borderBottom: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: AZUL, display: 'inline-block' }} />
            <span style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: AZUL }}>Distribución del pago retroactivo</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            {/* Bar chart horizontal */}
            <div style={{ display: 'flex', height: '32px', borderRadius: '8px', overflow: 'hidden', marginBottom: '14px' }}>
              {slices.map((s, i) => (
                <div key={i} title={s.label} style={{ width: `${(s.val / total * 100).toFixed(1)}%`, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '2px' }}>
                  {s.val / total > 0.12 && <span style={{ fontSize: '10px', fontWeight: '700', color: 'white', whiteSpace: 'nowrap', padding: '0 4px' }}>{s.pct.toFixed(0)}%</span>}
                </div>
              ))}
            </div>
            {slices.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', marginBottom: '6px', background: '#F8FAFC', borderRadius: '6px', borderLeft: `4px solid ${s.color}` }}>
                <span style={{ fontSize: '12px', color: '#374151' }}>{s.label}</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: s.color }}>{fmtMXN(s.val)}</div>
                  <div style={{ fontSize: '10px', color: '#94A3B8' }}>{s.pct.toFixed(1)}%</div>
                </div>
              </div>
            ))}
            <div style={{ padding: '8px 10px', background: '#EEF2F8', borderRadius: '6px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: AZUL }}>TOTAL</span>
              <span style={{ fontSize: '14px', fontWeight: '900', color: AZUL }}>{fmtMXN(total)}</span>
            </div>
          </div>
        </div>

        {/* Parámetros de crédito + pensión neta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

          {/* Parámetros editables */}
          <div style={{ background: 'white', borderRadius: '12px', borderLeft: `4px solid ${NARANJA}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#FFF3ED', borderBottom: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: NARANJA, display: 'inline-block' }} />
              <span style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: NARANJA }}>Parámetros del crédito</span>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                {
                  label: 'Duración del trámite', value: duracionTramiteMeses,
                  onChange: setDuracionTramiteMeses, options: [12, 18, 24, 30, 36, 48, 60],
                  fmt: (v: number) => `${v} meses`
                },
                {
                  label: 'Plazo del crédito', value: plazoCredito,
                  onChange: setPlazoCredito, options: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120],
                  fmt: (v: number) => `${v} meses (${(v / 12).toFixed(1)} años)`
                },
              ].map((f, i) => (
                <div key={i}>
                  <label style={{ fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '5px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: NARANJA, display: 'inline-block' }} />
                    {f.label}
                  </label>
                  <select value={f.value} onChange={e => f.onChange(Number(e.target.value))}
                    style={{ width: '100%', height: '44px', border: `1.5px solid ${NARANJA}33`, borderRadius: '8px', padding: '0 12px', fontSize: '13px', fontFamily: 'inherit', background: '#FFF3ED', color: '#92400E', fontWeight: '500', boxSizing: 'border-box' }}>
                    {f.options.map(v => <option key={v} value={v}>{f.fmt(v)}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: '6px' }}>
                <div style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '2px' }}>Tasa banco regulado</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: AZUL }}>{tasaBanco}% anual</div>
              </div>
            </div>
          </div>

          {/* Pensión antes/durante/después */}
          <div style={{ background: 'white', borderRadius: '12px', borderLeft: `4px solid ${VERDE}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: VERDE, marginBottom: '10px' }}>Pensión disponible</div>
            {[
              { label: 'Sin Mod. 40 (hoy)', value: fmtMXN2(escenarios[0]?.pension_base ?? 0), color: '#94A3B8' },
              { label: 'Durante el crédito', value: fmtMXN2(escRec.pension_inmediata ?? 0), color: NARANJA, note: `(desc. ${fmtMXN2(escRec.descuento_mensual ?? 0)}/mes)` },
              { label: 'Al liquidar el crédito', value: fmtMXN2(escRec.pension_al_liquidar ?? escRec.pension_mensual ?? 0), color: VERDE, bold: true },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: i === 2 ? '#F0F7F4' : '#F8FAFC', borderRadius: '6px', marginBottom: '6px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: r.bold ? '600' : '400' }}>{r.label}</div>
                  {r.note && <div style={{ fontSize: '9px', color: '#94A3B8' }}>{r.note}</div>}
                </div>
                <span style={{ fontSize: r.bold ? '16px' : '13px', fontWeight: r.bold ? '800' : '700', color: r.color }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(11)} style={{ padding: '10px 22px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
          El entregable <i className="ti ti-arrow-right" style={{ fontSize: '14px' }} />
        </button>
      </div>
    </div>
  )
}
