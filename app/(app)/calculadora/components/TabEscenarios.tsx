'use client'
import React, { useState } from 'react'
import { esEscenarioMod40 } from '@/app/utils/formulas'

const AZUL = '#334E7B'
const VERDE = '#2E7D5A'
const NARANJA = '#E8724A'
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

const getTermometro = (meses: number) => TERMOMETRO.find(t => meses <= t.max) ?? TERMOMETRO[TERMOMETRO.length - 1]

interface Props {
  escenarios: any[]
  setTab: (t: number) => void
  fmtMXN: (n: number) => string
}

export default function TabEscenarios({ escenarios, setTab }: Props) {
  const [vista, setVista] = useState<'cards' | 'tabla'>('cards')
  const escsConMod40 = escenarios.filter(esEscenarioMod40)
  const pensionBase = escenarios[0]?.pension_base ?? 0

  if (escsConMod40.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>
      <i className="ti ti-chart-bar-off" style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} />
      <p style={{ fontSize: '14px' }}>Completa el Salario Mod. 40 para generar escenarios comparativos</p>
      <button onClick={() => setTab(2)} style={{ marginTop: '12px', padding: '8px 20px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>
        Ir a Salario Mod. 40
      </button>
    </div>
  )

  const maxPension = Math.max(...escsConMod40.map(e => e.pension_mensual))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Header con toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#111827', margin: 0 }}>Comparativa de escenarios</p>
          <p style={{ fontSize: '11px', color: '#94A3B8', margin: '2px 0 0' }}>Base actual: {fmtMXN2(pensionBase)}/mes sin Mod. 40</p>
        </div>
        <div style={{ display: 'flex', gap: '4px', background: '#F4F6F9', borderRadius: '8px', padding: '4px' }}>
          {(['cards', 'tabla'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px', fontWeight: '600', background: vista === v ? 'white' : 'transparent', color: vista === v ? AZUL : '#94A3B8', boxShadow: vista === v ? '0 1px 2px rgba(0,0,0,0.06)' : 'none' }}>
              {v === 'cards' ? 'Cards' : 'Tabla'}
            </button>
          ))}
        </div>
      </div>

      {/* Vista Cards — columnas comparativas */}
      {vista === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(escsConMod40.length, 3)}, 1fr)`, gap: '10px' }}>
          {escsConMod40.slice(0, 3).map((esc, i) => {
            const isRec = esc.recomendado
            const incr = esc.pension_mensual - pensionBase
            const t = getTermometro(esc.roi)
            const colors = [AZUL, VERDE, NARANJA]
            const c = colors[i] || AZUL
            return (
              <div key={i} style={{ background: 'white', borderRadius: '12px', border: isRec ? `2px solid ${VERDE}` : `1px solid ${BORDE}`, boxShadow: isRec ? '0 4px 16px rgba(46,125,90,0.15)' : '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', position: 'relative' }}>
                {/* Header */}
                <div style={{ background: isRec ? VERDE : c, padding: '14px 16px' }}>
                  {isRec && <div style={{ fontSize: '9px', fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: '0.8px', marginBottom: '4px' }}>⭐ RECOMENDADO</div>}
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)', marginBottom: '4px' }}>Escenario {i + 1}</div>
                  <div style={{ fontSize: '26px', fontWeight: '800', color: 'white', letterSpacing: '-0.5px', lineHeight: 1 }}>{fmtMXN2(esc.pension_mensual)}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>mensual</div>
                </div>

                {/* Ganancia vs base */}
                <div style={{ padding: '10px 14px', background: isRec ? '#F0F7F4' : '#F8FAFC', borderBottom: `1px solid ${BORDE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#64748B' }}>Mejora vs sin Mod. 40</span>
                  <span style={{ fontSize: '14px', fontWeight: '800', color: VERDE }}>+{fmtMXN2(incr)}/mes</span>
                </div>

                {/* Parámetros */}
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { label: 'Duración Mod. 40', value: `${esc.mod40_meses} meses (${(esc.mod40_meses/12).toFixed(1)} años)` },
                    { label: 'UMAs registradas', value: String(esc.mod40_umas) },
                    { label: 'Inversión total', value: fmtMXN2(esc.costo_total) },
                    { label: 'Menos recuperación AFORE', value: '− ' + fmtMXN2(esc.recuperacion_afore) },
                    { label: 'Inversión neta', value: fmtMXN2(esc.inversion_neta), bold: true },
                    { label: 'Ganancia acumulada a los 80 años', value: fmtMXN2(esc.ganancia_a80), bold: true },
                    { label: 'Retorno sobre lo invertido', value: `${((esc.tasa_rendimiento ?? 0) / 100).toFixed(1)} veces`, bold: true },
                  ].map((r, ri) => (
                    <div key={ri} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: ri < 6 ? `1px solid ${BORDE}` : 'none' }}>
                      <span style={{ fontSize: '10px', color: '#64748B' }}>{r.label}</span>
                      <span style={{ fontSize: '11px', fontWeight: r.bold ? '700' : '500', color: r.bold ? c : '#374151' }}>{r.value}</span>
                    </div>
                  ))}
                </div>

                {/* Termómetro */}
                <div style={{ padding: '10px 14px', background: t.bg, borderTop: `1px solid ${BORDE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: t.color, fontWeight: '600' }}>Recuperación en {esc.roi} meses</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: t.color, padding: '2px 8px', background: 'white', borderRadius: '4px' }}>{t.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Vista Tabla */}
      {vista === 'tabla' && (
        <div style={{ background: 'white', borderRadius: '12px', border: `1px solid ${BORDE}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: AZUL }}>
                  <th style={{ padding: '9px 12px', color: 'white', textAlign: 'left', fontWeight: '600', fontSize: '11px', position: 'sticky', left: 0, background: AZUL }}>Concepto</th>
                  <th style={{ padding: '9px 12px', color: '#93C5FD', textAlign: 'right', fontWeight: '600', fontSize: '11px', whiteSpace: 'nowrap' }}>Sin Mod. 40</th>
                  {escsConMod40.slice(0, 6).map((e, i) => (
                    <th key={i} style={{ padding: '9px 12px', color: e.recomendado ? '#FCD34D' : 'white', textAlign: 'right', fontWeight: '700', fontSize: '11px', whiteSpace: 'nowrap' }}>
                      Esc. {i+1} {e.recomendado ? '⭐' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Pensión mensual', fn: (e: any) => fmtMXN2(e.pension_mensual), h: true },
                  { label: 'Mejora mensual', fn: (e: any) => '+' + fmtMXN2(e.pension_mensual - pensionBase), h: true },
                  { label: 'Duración Mod. 40', fn: (e: any) => `${e.mod40_meses} meses` },
                  { label: 'UMAs', fn: (e: any) => String(e.mod40_umas) },
                  { label: 'Costo total', fn: (e: any) => fmtMXN2(e.costo_total) },
                  { label: 'Menos recuperación AFORE', fn: (e: any) => '− ' + fmtMXN2(e.recuperacion_afore) },
                  { label: 'Inversión neta', fn: (e: any) => fmtMXN2(e.inversion_neta), h: true },
                  { label: 'Meses recuperación', fn: (e: any) => `${e.roi} meses` },
                  { label: 'Ganancia acumulada a los 80 años', fn: (e: any) => fmtMXN2(e.ganancia_a80), h: true },
                  { label: 'Retorno', fn: (e: any) => `${((e.tasa_rendimiento ?? 0) / 100).toFixed(1)}×` },
                  { label: 'Aguinaldo anual', fn: (e: any) => fmtMXN2(e.aguinaldo_anual) },
                ].map((row, ri) => (
                  <tr key={ri} style={{ background: row.h ? '#EEF2F8' : ri % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: `1px solid ${BORDE}` }}>
                    <td style={{ padding: '8px 12px', color: '#374151', fontWeight: row.h ? '700' : '400', position: 'sticky', left: 0, background: row.h ? '#EEF2F8' : ri % 2 === 0 ? 'white' : '#F9FAFB', fontSize: '11px' }}>{row.label}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#94A3B8', fontStyle: 'italic', fontSize: '11px' }}>
                      {ri === 0 ? fmtMXN2(pensionBase) : ri === 1 ? '—' : '—'}
                    </td>
                    {escsConMod40.slice(0, 6).map((e, i) => (
                      <td key={i} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: row.h ? '700' : '500', color: row.h ? AZUL : '#374151', fontSize: '11px' }}>{row.fn(e)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Barra visual de pensiones */}
      <div style={{ background: 'white', borderRadius: '12px', border: `1px solid ${BORDE}`, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>Comparativo visual de pensión mensual</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { label: 'Sin Mod. 40', value: pensionBase, color: '#94A3B8' },
            ...escsConMod40.slice(0, 6).map((e, i) => ({
              label: `Esc. ${i+1} — ${e.mod40_umas} UMAs · ${(e.mod40_meses/12).toFixed(1)} años`,
              value: e.pension_mensual,
              color: [AZUL, VERDE, NARANJA, '#7C3AED', '#0891B2'][i] || AZUL,
              rec: e.recomendado,
            }))
          ].map((sc, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '160px', fontSize: '10px', color: i === 0 ? '#94A3B8' : '#374151', fontWeight: (sc as any).rec ? '700' : '400', textAlign: 'right', flexShrink: 0 }}>
                {(sc as any).rec ? '⭐ ' : ''}{sc.label}
              </div>
              <div style={{ flex: 1, height: '24px', background: '#F3F4F6', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${sc.value / maxPension * 100}%`, background: sc.color, display: 'flex', alignItems: 'center', paddingLeft: '8px', minWidth: '4px', borderRadius: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'white', whiteSpace: 'nowrap' }}>{fmtMXN2(sc.value)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(10)} style={{ padding: '10px 22px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
          Financiamiento <i className="ti ti-arrow-right" style={{ fontSize: '14px' }} />
        </button>
      </div>
    </div>
  )
}
