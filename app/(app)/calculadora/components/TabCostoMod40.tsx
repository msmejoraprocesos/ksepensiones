'use client'
import React from 'react'

const AZUL = '#334E7B'
const VERDE = '#2E7D5A'
const NARANJA = '#E8724A'
const MORADO = '#7C3AED'
const BORDE = '#E2E8F0'

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const TERMOMETRO = [
  { max: 16, label: 'Excelente', color: '#059669', bg: '#D1FAE5' },
  { max: 24, label: 'Buena', color: '#16A34A', bg: '#DCFCE7' },
  { max: 36, label: 'Aceptable', color: '#CA8A04', bg: '#FEF9C3' },
  { max: 48, label: 'Riesgo moderado', color: '#D97706', bg: '#FEF3C7' },
  { max: 60, label: 'Riesgo alto', color: '#DC2626', bg: '#FEE2E2' },
  { max: Infinity, label: 'Requiere cautela', color: '#991B1B', bg: '#FEE2E2' },
]

interface Props {
  escenarios: any[]
  sys: any
  getMod40Pct: (year: number) => number
  setTab: (t: number) => void
}

export default function TabCostoMod40({ escenarios, sys, getMod40Pct, setTab }: Props) {
  const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]

  if (!escRec || escRec.mod40_meses === 0) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>
      <i className="ti ti-coin-off" style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} />
      <p style={{ fontSize: '14px' }}>Configura el Salario Mod. 40 para ver el costo</p>
      <button onClick={() => setTab(2)} style={{ marginTop: '12px', padding: '8px 20px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>
        Ir a Salario Mod. 40
      </button>
    </div>
  )

  const t = TERMOMETRO.find(t => escRec.roi <= t.max) ?? TERMOMETRO[TERMOMETRO.length - 1]
  const pctAfore = sys?.pct_afore_mod40 ?? 19.85

  // Build year-by-year table
  const anioInicio = parseInt(escRec.fecha_ingreso_mod40?.slice(0, 4) || '2027')
  const anioFin = parseInt(escRec.fecha_baja_mod40?.slice(0, 4) || '2030')
  const rows: any[] = []
  for (let a = anioInicio; a <= anioFin; a++) {
    const tasa = getMod40Pct(a)
    const diasAnio = a % 4 === 0 ? 366 : 365
    const sdi = escRec.sdi_mod40 ?? 0
    const cuotaMens = sdi * (tasa / 100) * diasAnio / 12
    const cuotaAnual = cuotaMens * 12
    rows.push({ a, tasa, sdi, cuotaMens, cuotaAnual })
  }
  const maxCuota = Math.max(...rows.map(r => r.cuotaAnual))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* KPIs con termómetro */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'stretch' }}>
        {[
          { label: 'Costo total Mod. 40', value: fmtMXN2(escRec.costo_total), color: '#B91C1C', bg: '#FEF2F2', border: '#FCA5A5' },
          { label: `Recuperación AFORE (${pctAfore}%)`, value: fmtMXN2(escRec.recuperacion_afore), color: VERDE, bg: '#F0FDF4', border: '#86EFAC' },
          { label: 'Inversión neta', value: fmtMXN2(escRec.inversion_neta), color: '#B45309', bg: '#FFFBEB', border: '#FCD34D' },
        ].map((k, i) => (
          <div key={i} style={{ background: k.bg, borderTop: `3px solid ${k.border}`, padding: '12px 14px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px', fontWeight: '600' }}>{k.label}</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: k.color, letterSpacing: '-0.5px' }}>{k.value}</div>
          </div>
        ))}
        {/* Termómetro */}
        <div style={{ background: t.bg, borderTop: `3px solid ${t.color}`, padding: '12px 14px', borderRadius: '8px', textAlign: 'center', minWidth: '120px' }}>
          <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px', fontWeight: '600' }}>Recuperación</div>
          <div style={{ fontSize: '18px', fontWeight: '800', color: t.color }}>{escRec.roi} meses</div>
          <div style={{ fontSize: '10px', fontWeight: '700', color: t.color, marginTop: '3px', padding: '2px 6px', background: 'white', borderRadius: '4px', display: 'inline-block' }}>{t.label}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>

        {/* Tabla año por año */}
        <div style={{ background: 'white', borderRadius: '12px', borderLeft: `4px solid ${MORADO}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#F5F3FF', borderBottom: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: MORADO, display: 'inline-block' }} />
            <span style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: MORADO }}>Desglose año por año</span>
          </div>
          <div style={{ padding: '0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: AZUL }}>
                  {['Año', 'Tasa %', 'Cuota mensual', 'Cuota anual', 'Barra'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', color: 'white', fontWeight: '600', textAlign: i < 2 ? 'center' : 'right', fontSize: '10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: `1px solid ${BORDE}` }}>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '600', color: AZUL }}>{r.a}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748B' }}>{r.tasa.toFixed(3)}%</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>{fmtMXN2(r.cuotaMens)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '700', color: MORADO }}>{fmtMXN2(r.cuotaAnual)}</td>
                    <td style={{ padding: '8px 10px', width: '80px' }}>
                      <div style={{ height: '6px', background: '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(r.cuotaAnual / maxCuota * 100).toFixed(0)}%`, background: MORADO, borderRadius: '3px' }} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: AZUL }}>
                  <td colSpan={2} style={{ padding: '9px 10px', color: 'white', fontWeight: '700' }}>TOTAL</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#93C5FD', fontWeight: '700' }}>
                    {fmtMXN2(escRec.costo_total / (escRec.mod40_meses || 1))}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', color: '#FCD34D', fontWeight: '800', fontSize: '14px' }}>{fmtMXN2(escRec.costo_total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel lateral: análisis de rentabilidad */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Ganancia a 80 años */}
          <div style={{ background: 'white', borderRadius: '12px', borderLeft: `4px solid ${VERDE}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: VERDE, marginBottom: '10px' }}>Rentabilidad</div>
            {[
              { label: 'Ganancia a 80 años', value: fmtMXN(escRec.ganancia_a80), color: VERDE, big: true },
              { label: 'Tasa de rendimiento', value: `${escRec.tasa_rendimiento?.toFixed(1)}%`, color: VERDE, big: false },
              { label: 'ROI mensual', value: `${escRec.roi} meses`, color: AZUL, big: false },
              { label: 'Meses a 80 años', value: `${Math.round((80 - (escRec.edad_retiro ?? 60)) * 12)}`, color: '#64748B', big: false },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 3 ? `1px solid ${BORDE}` : 'none' }}>
                <span style={{ fontSize: '11px', color: '#64748B' }}>{r.label}</span>
                <span style={{ fontSize: r.big ? '15px' : '12px', fontWeight: r.big ? '800' : '700', color: r.color }}>{r.value}</span>
              </div>
            ))}
          </div>

          {/* AFORE breakdown */}
          <div style={{ background: 'white', borderRadius: '12px', borderLeft: `4px solid ${NARANJA}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: NARANJA, marginBottom: '10px' }}>Flujo de caja</div>
            {[
              { label: 'Costo total', value: fmtMXN2(escRec.costo_total), color: '#B91C1C' },
              { label: `AFORE recuperable (${pctAfore}%)`, value: '− ' + fmtMXN2(escRec.recuperacion_afore), color: VERDE },
              { label: 'Inversión neta final', value: fmtMXN2(escRec.inversion_neta), color: '#B45309', bold: true },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < 2 ? `1px solid ${BORDE}` : 'none' }}>
                <span style={{ fontSize: '11px', color: '#64748B' }}>{r.label}</span>
                <span style={{ fontSize: '12px', fontWeight: r.bold ? '800' : '700', color: r.color }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(5)} style={{ padding: '10px 22px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
          Importe de pensión <i className="ti ti-arrow-right" style={{ fontSize: '14px' }} />
        </button>
      </div>
    </div>
  )
}
