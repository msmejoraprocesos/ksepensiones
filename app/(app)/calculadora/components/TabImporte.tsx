'use client'
import React from 'react'

const AZUL = '#334E7B'
const VERDE = '#2E7D5A'
const NARANJA = '#E8724A'
const BORDE = '#E2E8F0'

const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

interface Props {
  escenarios: any[]
  datos: any
  setTab: (t: number) => void
  Tip: (props: { id: string }) => React.ReactElement | null
}

export default function TabImporte({ escenarios, datos, setTab, Tip }: Props) {
  const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]

  if (!escRec || escRec.mod40_meses === 0) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>
      <i className="ti ti-coin-off" style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} />
      <p style={{ fontSize: '14px' }}>Completa los datos y el salario Mod. 40 para ver el importe</p>
      <button onClick={() => setTab(2)} style={{ marginTop: '12px', padding: '8px 20px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>
        Ir a Salario Mod. 40
      </button>
    </div>
  )

  const pensionActual = escenarios[0]?.pension_base ?? 0
  const incremento = escRec.pension_mensual - pensionActual
  const pctMejora = pensionActual > 0 ? ((incremento / pensionActual) * 100) : 0
  const edadRet = Math.floor(escRec.edad_retiro || 62)
  const factorEdad = edadRet >= 65 ? 1.0 : 0.75 + (edadRet - 60) * 0.05
  const pension100 = escRec.pension_mensual / factorEdad

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Hero: Comparativo sin vs con */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        {/* Sin Mod 40 */}
        <div style={{ background: '#F1F5F9', padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px', fontWeight: '600' }}>Sin Modalidad 40</div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#94A3B8', letterSpacing: '-1px', lineHeight: 1 }}>{fmtMXN2(pensionActual)}</div>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>mensual actual</div>
        </div>
        {/* Flecha y diferencia */}
        <div style={{ background: '#2E7D5A', padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
          <div style={{ fontSize: '20px', color: 'white' }}>→</div>
          <div style={{ fontSize: '18px', fontWeight: '800', color: 'white', whiteSpace: 'nowrap' }}>+{fmtMXN2(incremento)}</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>+{pctMejora.toFixed(1)}%</div>
        </div>
        {/* Con Mod 40 */}
        <div style={{ background: AZUL, padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px', fontWeight: '600' }}>Con Modalidad 40</div>
          <div style={{ fontSize: '32px', fontWeight: '800', color: 'white', letterSpacing: '-1px', lineHeight: 1 }}>{fmtMXN2(escRec.pension_mensual)}</div>
          <div style={{ fontSize: '11px', color: '#93C5FD', marginTop: '4px' }}>mensual mejorada</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* Desglose pensión con Mod40 */}
        <div style={{ background: 'white', borderRadius: '12px', borderLeft: `4px solid ${AZUL}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDE}`, background: '#EEF2F8' }}>
            <span style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px', color: AZUL }}>Desglose pensión con Mod. 40</span>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { label: 'Cuantía básica anual', value: fmtMXN2(escRec.cuantia_basica_anual ?? 0), color: AZUL },
              { label: 'Incrementos anuales', value: fmtMXN2(escRec.incrementos_anual ?? 0), color: VERDE },
              { label: 'Asignaciones familiares', value: fmtMXN2(escRec.asignaciones_anual ?? 0), color: NARANJA },
              { label: 'Pensión anual total', value: fmtMXN2(escRec.pension_mensual * 12), color: AZUL, bold: true },
              { label: 'Pensión mensual', value: fmtMXN2(escRec.pension_mensual), color: AZUL, big: true },
              { label: 'Aguinaldo anual', value: fmtMXN2(escRec.aguinaldo_anual ?? 0), color: '#B45309' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: r.big ? '#EEF2F8' : '#F8FAFC', borderRadius: '6px', border: r.big ? `1px solid #BFDBFE` : 'none' }}>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: r.bold ? '600' : '400' }}>{r.label}</span>
                <span style={{ fontSize: r.big ? '16px' : '12px', fontWeight: r.big ? '800' : r.bold ? '700' : '600', color: r.color }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabla por edad */}
        <div style={{ background: 'white', borderRadius: '12px', borderLeft: `4px solid ${VERDE}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDE}`, background: '#F0F7F4' }}>
            <span style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px', color: VERDE }}>Factor por edad de retiro <Tip id="factorEdad" /></span>
          </div>
          <div style={{ padding: '0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: AZUL }}>
                  {['Edad', '%', 'Pensión/mes'].map((h, i) => (
                    <th key={i} style={{ padding: '7px 10px', color: 'white', fontWeight: '600', textAlign: i === 0 ? 'left' : 'center', fontSize: '10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[60,61,62,63,64,65].map((edad, i) => {
                  const pct = edad >= 65 ? 1.0 : 0.75 + (edad - 60) * 0.05
                  const penMens = pension100 * pct
                  const isActive = edadRet === edad
                  return (
                    <tr key={edad} style={{ background: isActive ? '#EEF2F8' : i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: `1px solid ${BORDE}` }}>
                      <td style={{ padding: '8px 10px', fontWeight: isActive ? '700' : '400', color: isActive ? AZUL : '#374151', fontSize: isActive ? '12px' : '11px' }}>
                        {isActive ? '▶ ' : ''}{edad} años
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: isActive ? NARANJA : '#374151', fontSize: isActive ? '14px' : '12px' }}>{(pct * 100).toFixed(0)}%</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: isActive ? '800' : '600', color: isActive ? AZUL : '#374151', fontSize: isActive ? '13px' : '11px' }}>{fmtMXN2(penMens)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(8)} style={{ padding: '10px 22px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
          Escenarios <i className="ti ti-arrow-right" style={{ fontSize: '14px' }} />
        </button>
      </div>
    </div>
  )
}
