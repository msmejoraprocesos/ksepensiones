'use client'
import React from 'react'

const AZUL = '#334E7B'
const VERDE = '#2E7D5A'
const NARANJA = '#E8724A'
const MORADO = '#7C3AED'
const BORDE = '#E2E8F0'

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

interface Props {
  escenarios: any[]
  datos: any
  sys: any
  mod40Umas: number
  setMod40Umas: (v: number) => void
  edadIngresoAnios: number
  setEdadIngresoAnios: (v: number) => void
  edadIngresoMeses: number
  setEdadIngresoMeses: (v: number) => void
  mod40Meses: number
  setMod40Meses: (v: number) => void
  ingresoObjetivo: number
  resetParametrosMod40: () => void
  tieneAtraso: boolean
  setTieneAtraso: (v: boolean) => void
  fechaAtrasoMod40: string
  setFechaAtrasoMod40: (v: string) => void
  setTab: (t: number) => void
  Tip: (props: { id: string }) => React.ReactElement | null
}

export default function TabSalarioMod40({
  escenarios, datos, sys, mod40Umas, setMod40Umas,
  edadIngresoAnios, setEdadIngresoAnios, edadIngresoMeses, setEdadIngresoMeses,
  mod40Meses, setMod40Meses, ingresoObjetivo, resetParametrosMod40,
  tieneAtraso, setTieneAtraso, fechaAtrasoMod40, setFechaAtrasoMod40,
  setTab, Tip
}: Props) {
  const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const sdiMod40 = mod40Umas * (sys?.UMA_DIARIA ?? 117.31)
  const pensionActual = escenarios[0]?.pension_base ?? 0

  const inputStrategy: React.CSSProperties = {
    width: '100%', height: '44px', border: `2px solid ${VERDE}`,
    borderRadius: '8px', padding: '0 12px', fontSize: '13px',
    fontFamily: 'inherit', boxSizing: 'border-box', background: '#F0F7F4',
    color: '#1A5C40', fontWeight: '500', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Header con SDI resultante */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        <div style={{ background: '#F0F7F4', borderTop: `3px solid ${VERDE}`, padding: '12px 16px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: '600' }}>SDI a registrar</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: VERDE }}>{fmtMXN2(sdiMod40)}/día</div>
          <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>{mod40Umas} UMAs × ${sys?.UMA_DIARIA ?? 117.31}/día</div>
        </div>
        <div style={{ background: '#EEF2F8', borderTop: `3px solid ${AZUL}`, padding: '12px 16px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: '600' }}>Duración Mod. 40</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: AZUL }}>{mod40Meses} meses</div>
          <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>{(mod40Meses / 12).toFixed(1)} años de cotización</div>
        </div>
        <div style={{ background: '#F5F3FF', borderTop: `3px solid ${MORADO}`, padding: '12px 16px', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: '600' }}>Pensión proyectada</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: MORADO }}>{escRec ? fmtMXN2(escRec.pension_mensual) : '—'}</div>
          <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>
            {escRec && pensionActual > 0 ? `+${fmtMXN2(escRec.pension_mensual - pensionActual)}/mes` : 'vs sin Mod. 40'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* Parámetros estratégicos */}
        <div style={{ background: 'white', borderRadius: '12px', borderLeft: `4px solid ${VERDE}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#F0F7F4', borderBottom: `1px solid ${BORDE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: VERDE, display: 'inline-block' }} />
              <span style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: VERDE }}>Decisión estratégica</span>
            </div>
            <button onClick={resetParametrosMod40} style={{ padding: '4px 10px', background: 'white', color: '#64748B', border: `1px solid ${BORDE}`, borderRadius: '6px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
              ↺ Restablecer
            </button>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Edad de ingreso */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: VERDE, display: 'inline-block' }} />
                <label style={{ fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                  Edad de ingreso a Mod. 40 <Tip id="duracionMod40" />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '9px', color: '#94A3B8', textAlign: 'center', marginBottom: '3px', fontWeight: '600' }}>AÑOS</div>
                  <select value={edadIngresoAnios} onChange={e => setEdadIngresoAnios(Number(e.target.value))} style={{ ...inputStrategy, fontSize: '20px', fontWeight: '800', textAlign: 'center' }}>
                    {Array.from({ length: 31 }, (_, i) => i + 40).map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '9px', color: '#94A3B8', textAlign: 'center', marginBottom: '3px', fontWeight: '600' }}>MESES</div>
                  <select value={edadIngresoMeses} onChange={e => setEdadIngresoMeses(Number(e.target.value))} style={{ ...inputStrategy, fontSize: '20px', fontWeight: '800', textAlign: 'center', border: `1.5px solid ${VERDE}` }}>
                    {Array.from({ length: 12 }, (_, i) => i).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <p style={{ fontSize: '10px', color: '#94A3B8', margin: '4px 0 0' }}>Pre-cargado de la constancia — ajusta si el cliente quiere entrar después</p>
            </div>

            {/* UMAs */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: VERDE, display: 'inline-block' }} />
                <label style={{ fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                  Salario a registrar (UMAs) <Tip id="uma" />
                </label>
              </div>
              <select value={mod40Umas} onChange={e => setMod40Umas(Number(e.target.value))} style={{ ...inputStrategy, fontSize: '14px' }}>
                {Array.from({ length: 25 }, (_, i) => i + 1).map(u => (
                  <option key={u} value={u}>{u} UMA{u > 1 ? 's' : ''} — {fmtMXN2(u * (sys?.UMA_DIARIA ?? 117.31))}/día</option>
                ))}
              </select>
              {ingresoObjetivo > 0 && escRec && (
                <div style={{ marginTop: '6px', padding: '7px 10px', background: escRec.pension_mensual >= ingresoObjetivo ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${escRec.pension_mensual >= ingresoObjetivo ? '#86EFAC' : '#FCD34D'}`, borderLeft: `3px solid ${escRec.pension_mensual >= ingresoObjetivo ? VERDE : '#F59E0B'}`, borderRadius: '4px' }}>
                  <p style={{ fontSize: '11px', color: escRec.pension_mensual >= ingresoObjetivo ? '#065F46' : '#92400E', margin: 0, lineHeight: 1.5 }}>
                    {escRec.pension_mensual >= ingresoObjetivo
                      ? `✅ Con ${mod40Umas} UMAs la pensión alcanza tu meta de ${fmtMXN2(ingresoObjetivo)}/mes`
                      : `⚠️ Necesitas más UMAs para alcanzar ${fmtMXN2(ingresoObjetivo)}/mes`}
                  </p>
                </div>
              )}
            </div>

            {/* Duración */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: VERDE, display: 'inline-block' }} />
                <label style={{ fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                  Meses en Mod. 40 <Tip id="duracionMod40" />
                </label>
              </div>
              <select value={mod40Meses} onChange={e => setMod40Meses(Number(e.target.value))} style={inputStrategy}>
                {[6,12,18,24,30,36,42,48,54,60,66,72,78,84,90,96,102,108,114,120].map(m => (
                  <option key={m} value={m}>{m} meses ({(m/12).toFixed(1)} años)</option>
                ))}
              </select>
            </div>

            {/* Trámite retroactivo */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: NARANJA, display: 'inline-block' }} />
                <label style={{ fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                  ¿Trámite retroactivo? <Tip id="retroactivo" />
                </label>
              </div>
              <select value={tieneAtraso ? 'si' : 'no'} onChange={e => setTieneAtraso(e.target.value === 'si')}
                style={{ ...inputStrategy, border: `1.5px solid ${NARANJA}`, background: '#FFF3ED', color: '#92400E' }}>
                <option value="no">No — cotización mensual normal</option>
                <option value="si">Sí — pago retroactivo con recargos</option>
              </select>
            </div>
          </div>
        </div>

        {/* Proyección de escenarios */}
        <div style={{ background: 'white', borderRadius: '12px', borderLeft: `4px solid ${MORADO}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#F5F3FF', borderBottom: `1px solid ${BORDE}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: MORADO, display: 'inline-block' }} />
            <span style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: MORADO }}>Resultado calculado — escenarios</span>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {escenarios.filter(e => e.mod40_meses > 0).slice(0, 4).map((esc, i) => {
              const colors = [AZUL, VERDE, NARANJA, MORADO]
              const c = colors[i] || AZUL
              const incr = esc.pension_mensual - pensionActual
              const isRec = esc.recomendado
              return (
                <div key={i} style={{ padding: '10px 12px', background: isRec ? '#F0F7F4' : '#F8FAFC', border: `1px solid ${isRec ? '#86EFAC' : BORDE}`, borderRadius: '8px', borderLeft: `4px solid ${c}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#374151' }}>
                      {isRec ? '⭐ ' : ''}Esc. {i + 1} — {esc.mod40_umas} UMAs · {esc.mod40_meses} meses
                    </span>
                    <span style={{ fontSize: '15px', fontWeight: '800', color: c }}>{fmtMXN2(esc.pension_mensual)}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                    {[
                      { label: 'Mejora', value: '+' + fmtMXN2(incr), color: VERDE },
                      { label: 'Inversión neta', value: fmtMXN(esc.inversion_neta), color: '#B45309' },
                      { label: 'Recuperación', value: esc.roi + ' meses', color: AZUL },
                    ].map((m, mi) => (
                      <div key={mi} style={{ textAlign: 'center', padding: '4px', background: 'white', borderRadius: '4px' }}>
                        <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase' as const }}>{m.label}</div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: m.color }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {escenarios.filter(e => e.mod40_meses > 0).length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94A3B8' }}>
                <p style={{ fontSize: '12px', margin: 0 }}>Ajusta los parámetros para generar escenarios</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(3)} style={{ padding: '10px 22px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
          SDI 250 sem. <i className="ti ti-arrow-right" style={{ fontSize: '14px' }} />
        </button>
      </div>
    </div>
  )
}
