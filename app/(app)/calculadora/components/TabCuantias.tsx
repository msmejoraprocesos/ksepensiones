'use client'
import React from 'react'

const AZUL = '#334E7B'
const VERDE = '#2E7D5A'
const NARANJA = '#E8724A'
const MORADO = '#7C3AED'
const BORDE = '#E2E8F0'

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const Card = ({ title, color, children }: { title: string; color: string; children: React.ReactNode }) => (
  <div style={{ background: 'white', borderRadius: '12px', borderLeft: `4px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
    <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDE}`, background: `${color}11` }}>
      <span style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.6px', color }}>{title}</span>
    </div>
    <div style={{ padding: '14px 16px' }}>{children}</div>
  </div>
)

interface Props {
  res: any
  sdiPromedio: number
  datos: any
  setTab: (t: number) => void
  Tip: (props: { id: string }) => React.ReactElement | null
}

export default function TabCuantias({ res, sdiPromedio, datos, setTab, Tip }: Props) {
  if (sdiPromedio <= 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94A3B8' }}>
      <i className="ti ti-file-alert" style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }} />
      <p style={{ fontSize: '14px' }}>Carga la constancia IMSS para ver la pensión actual</p>
    </div>
  )

  const totalAnual = res.pensionAnual
  const componentes = [
    { label: 'Cuantía básica', val: res.cuantiaBasicaAnual, color: AZUL, tip: 'cuantia' },
    { label: 'Incrementos anuales', val: res.incrementosAnual, color: VERDE, tip: 'incrementos' },
    { label: 'Asignaciones familiares', val: res.asignacionesAnual, color: NARANJA, tip: 'asignFamiliar' },
    { label: 'Ayuda asistencial', val: res.ayudaAsistencialAnual, color: MORADO, tip: 'ayudaAsistencial' },
  ].filter(c => c.val > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* KPIs principales */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
        {[
          { label: 'Pensión mensual', value: fmtMXN2(res.pensionMensual), sub: res.pmg_aplica ? '⚠️ PMG aplicada' : 'Calculada Art.167 LSS', color: AZUL, bg: '#EEF2F8', big: true },
          { label: 'Pensión anual', value: fmtMXN2(res.pensionAnual), sub: '12 mensualidades', color: VERDE, bg: '#F0FDF4', big: false },
          { label: 'Aguinaldo anual', value: fmtMXN2(res.aguinaldoAnual), sub: 'Art. 218 LSS', color: '#B45309', bg: '#FFFBEB', big: false },
        ].map((k, i) => (
          <div key={i} style={{ background: k.bg, borderTop: `3px solid ${k.color}`, padding: '14px 16px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', fontWeight: '600' }}>{k.label}</div>
            <div style={{ fontSize: k.big ? '28px' : '22px', fontWeight: '800', color: k.color, letterSpacing: '-0.5px', lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* Desglose de cuantías */}
        <Card title="Desglose de cuantías anuales" color={AZUL}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {componentes.map(({ label, val, color, tip }, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: i < componentes.length - 1 ? `1px solid ${BORDE}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                    <span style={{ fontSize: '12px', color: '#374151' }}>{label}</span>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: '700', color }}>{fmtMXN2(val)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1, height: '5px', background: '#F3F4F6', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(val / totalAnual * 100).toFixed(0)}%`, background: color, borderRadius: '3px' }} />
                  </div>
                  <span style={{ fontSize: '10px', color: '#94A3B8', minWidth: '32px', textAlign: 'right' }}>{(val / totalAnual * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
            <div style={{ paddingTop: '10px', display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${AZUL}` }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#111827' }}>Total anual</span>
              <span style={{ fontSize: '15px', fontWeight: '800', color: AZUL }}>{fmtMXN2(totalAnual)}</span>
            </div>
          </div>
        </Card>

        {/* Factores del cálculo */}
        <Card title="Factores del cálculo" color={MORADO}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { label: 'SDI promedio 250 sem.', value: fmtMXN2(sdiPromedio), color: MORADO },
              { label: 'Salario en veces UMA', value: res.vecesUMA?.toFixed(4) + ' veces', color: MORADO },
              { label: '% cuantía básica', value: (res.pctBasica * 100).toFixed(4) + '%', color: AZUL },
              { label: '% incremento anual', value: (res.pctIncremento * 100).toFixed(5) + '%', color: AZUL },
              { label: 'Años de incremento', value: res.numIncrementos?.toFixed(1) + ' años', color: VERDE },
              { label: 'Factor de edad (' + (datos.edad_min_pension || 60) + ' años)', value: (res.factorEdad * 100).toFixed(0) + '%', color: NARANJA },
              { label: 'Factor 1.11 (decreto)', value: '1.11', color: '#64748B' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: '#F8FAFC', borderRadius: '6px' }}>
                <span style={{ fontSize: '11px', color: '#64748B' }}>{r.label}</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: r.color }}>{r.value}</span>
              </div>
            ))}
            {res.pmg_aplica && (
              <div style={{ padding: '8px 10px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px' }}>
                <p style={{ fontSize: '11px', color: '#DC2626', margin: 0, fontWeight: '600' }}>
                  ⚠️ PMG aplicada — la pensión calculada ({fmtMXN2(res.pensionSinPMG ?? 0)}/mes) es menor a la pensión mínima garantizada ({fmtMXN2(res.pmgMensual ?? 0)}/mes)
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Tabla por edad */}
      <Card title="Tabla de pensión por edad de retiro (Ley 73)" color={VERDE}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: AZUL }}>
                {['Edad', 'Tipo', '% Factor', 'Pensión mensual', 'Pensión anual', 'Aguinaldo'].map((h, i) => (
                  <th key={i} style={{ padding: '8px 12px', color: 'white', fontWeight: '600', textAlign: 'center', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[60,61,62,63,64,65].map((edad, i) => {
                const pct = edad >= 65 ? 1.0 : 0.75 + (edad - 60) * 0.05
                const penMens = (res.pensionMensual / res.factorEdad) * pct
                const isActive = Math.floor(datos.edad_min_pension || 60) === edad
                return (
                  <tr key={edad} style={{ background: isActive ? '#EEF2F8' : i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: `1px solid ${BORDE}` }}>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: isActive ? '800' : '500', color: isActive ? AZUL : '#374151', fontSize: isActive ? '14px' : '12px' }}>
                      {isActive && '▶ '}{edad} años
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontSize: '11px', color: '#64748B' }}>{edad >= 65 ? 'Vejez' : 'Cesantía E.A.'}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: '800', color: isActive ? NARANJA : '#374151', fontSize: isActive ? '16px' : '13px' }}>{(pct * 100).toFixed(0)}%</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: isActive ? '900' : '600', color: isActive ? AZUL : '#374151', fontSize: isActive ? '15px' : '12px' }}>{fmtMXN2(penMens)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{fmtMXN2(penMens * 12)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', color: '#64748B' }}>{fmtMXN2(penMens)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(2)} style={{ padding: '10px 22px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
          Salario Mod. 40 <i className="ti ti-arrow-right" style={{ fontSize: '14px' }} />
        </button>
      </div>
    </div>
  )
}
