'use client'
import React, { useState, useEffect } from 'react'
import { esEscenarioMod40 } from '@/app/utils/formulas'

/* Tokens — docs/rediseno/SISTEMA-DISENO.md */
const K = {
  navy900: '#0D2440', navy800: '#14375F', navy600: '#245287',
  orange: '#E8622C', orangeSoft: '#FDF0E9', gold: '#F2B544',
  green: '#12855C', greenLt: '#1FA873', greenSoft: '#E6F4EE',
  purple: '#6D3BD4', amber: '#B45309', amberSoft: '#FFFBEB',
  paper: '#F5F7FA', card: '#FFFFFF',
  ink: '#132135', muted: '#66738A', line: '#E1E7F0',
}
const COLORES = [K.navy600, K.green, K.orange, K.purple]

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const nw = { whiteSpace: 'nowrap' as const }
const num = { fontVariantNumeric: 'tabular-nums' as const }

const CSS = `
@media (max-width: 1000px) { .kse-2col { grid-template-columns: 1fr !important; } }

/* En movil el orden queda: resultado arriba, controles en medio. Al cambiar
   un selector la pension proyectada -- que es justo la retroalimentacion que
   se busca -- sale del campo de vision. Una franja compacta se fija al tope
   mientras se manipulan los controles. */
.kse-resumen-fijo { display: none; }
@media (max-width: 1000px) {
  .kse-resumen-fijo {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 6;
  }
}
@media (prefers-reduced-motion: reduce) {
  .kse-resumen-fijo { position: static; }
}
`

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
  const umaDiaria = sys?.UMA_DIARIA ?? 117.31
  const sdiMod40 = mod40Umas * umaDiaria
  const pensionActual = escenarios[0]?.pension_base ?? 0
  const escs = escenarios.filter(esEscenarioMod40).slice(0, 4)
  const [anim, setAnim] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setAnim(true); return }
    const t = setTimeout(() => setAnim(true), 200)
    return () => clearTimeout(t)
  }, [])

  const campo: React.CSSProperties = {
    width: '100%', height: '48px', border: `1px solid ${K.line}`,
    borderRadius: '10px', padding: '0 14px', fontSize: '17px',
    fontFamily: 'inherit', boxSizing: 'border-box', background: K.card,
    color: K.ink, fontWeight: 600, outline: 'none', cursor: 'pointer',
  }

  const Etiqueta = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: 'block', fontSize: '15px', color: K.muted, marginBottom: '6px' }}>{children}</label>
  )

  const maxPension = Math.max(...escs.map(e => e.pension_mensual), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <style>{CSS}</style>

      {/* ── Franja: el resultado de la decision ────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '18px', background: `linear-gradient(118deg, ${K.navy900} 0%, ${K.navy800} 60%, ${K.navy600} 100%)` }}>
        <div style={{ position: 'absolute', width: 440, height: 440, right: -150, top: -190, borderRadius: 999, pointerEvents: 'none', background: `radial-gradient(circle, ${K.orange}33 0%, transparent 68%)` }} />
        <div style={{ position: 'relative', padding: '28px 34px 22px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', margin: 0 }}>
            PENSIÓN PROYECTADA CON ESTOS PARÁMETROS
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
            <p style={{ fontSize: 'clamp(40px, 5vw, 64px)', fontWeight: 800, color: 'white', margin: 0, lineHeight: 1, letterSpacing: '-.035em', ...nw, ...num }}>
              {escRec ? fmtMXN2(escRec.pension_mensual) : '\u2014'}
            </p>
            {escRec && pensionActual > 0 && (
              <span style={{ background: K.green, color: 'white', fontSize: '17px', fontWeight: 700, padding: '9px 16px', borderRadius: 999, ...nw, ...num }}>
                +{fmtMXN2(escRec.pension_mensual - pensionActual)} cada mes
              </span>
            )}
          </div>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,.68)', margin: '10px 0 0' }}>
            Cotizando {mod40Umas} UMAs durante {mod40Meses} meses a partir de los {edadIngresoAnios} años {edadIngresoMeses} meses.
          </p>
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1px', background: 'rgba(255,255,255,.11)' }}>
          {[
            ['SDI a registrar', `${fmtMXN2(sdiMod40)}/dia`, `${mod40Umas} UMAs x ${fmtMXN2(umaDiaria)}`, K.gold],
            ['Duración', `${mod40Meses} meses`, `${(mod40Meses / 12).toFixed(1)} años de cotización`, 'white'],
            ['Inversión neta', escRec ? fmtMXN(escRec.inversion_neta) : '\u2014', 'descontando AFORE', K.gold],
            ['Recuperación', escRec ? `${escRec.roi} meses` : '\u2014', 'de pensión mejorada', K.greenLt],
          ].map((k, i) => (
            <div key={i} style={{ background: K.navy900, padding: '18px 24px' }}>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.56)', margin: 0 }}>{k[0]}</p>
              <p style={{ fontSize: '24px', fontWeight: 700, color: k[3], margin: '3px 0 0', ...nw, ...num }}>{k[1]}</p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.44)', margin: '2px 0 0' }}>{k[2]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Resumen fijo — solo en movil, ver CSS arriba */}
      <div className="kse-resumen-fijo" style={{ alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: K.navy900, borderRadius: '12px', padding: '14px 18px', boxShadow: '0 4px 16px rgba(13,36,64,.22)' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.56)', margin: 0 }}>
            {mod40Umas} UMAs · {mod40Meses} meses
          </p>
          <p style={{ fontSize: '24px', fontWeight: 800, color: 'white', margin: '2px 0 0', ...nw, ...num }}>
            {escRec ? fmtMXN2(escRec.pension_mensual) : '—'}
          </p>
        </div>
        {escRec && pensionActual > 0 && (
          <span style={{ background: K.green, color: 'white', fontSize: '15px', fontWeight: 700, padding: '8px 14px', borderRadius: 999, flexShrink: 0, ...nw, ...num }}>
            +{fmtMXN(escRec.pension_mensual - pensionActual)}
          </span>
        )}
      </div>

      <div className="kse-2col" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1.15fr)', gap: '20px' }}>

        {/* ── Decisión estratégica ──────────────────────────────── */}
        <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
            <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: 0 }}>Decisión estratégica</p>
            <button onClick={resetParametrosMod40}
              style={{ padding: '8px 14px', background: 'transparent', color: K.muted, border: `1px solid ${K.line}`, borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', ...nw }}>
              Restablecer
            </button>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <Etiqueta>Edad de ingreso a Mod. 40 <Tip id="duracionMod40" /></Etiqueta>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <p style={{ fontSize: '13px', color: K.muted, margin: '0 0 4px' }}>Años</p>
                <select value={edadIngresoAnios} onChange={e => setEdadIngresoAnios(Number(e.target.value))} style={{ ...campo, fontSize: '20px', fontWeight: 800 }}>
                  {Array.from({ length: 31 }, (_, i) => i + 40).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <p style={{ fontSize: '13px', color: K.muted, margin: '0 0 4px' }}>Meses</p>
                <select value={edadIngresoMeses} onChange={e => setEdadIngresoMeses(Number(e.target.value))} style={{ ...campo, fontSize: '20px', fontWeight: 800 }}>
                  {Array.from({ length: 12 }, (_, i) => i).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: K.muted, margin: '6px 0 0' }}>
              Precargado de la constancia. Ajusta si el cliente quiere entrar después.
            </p>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <Etiqueta>Salario a registrar <Tip id="uma" /></Etiqueta>
            <select value={mod40Umas} onChange={e => setMod40Umas(Number(e.target.value))} style={campo}>
              {Array.from({ length: 25 }, (_, i) => i + 1).map(u => (
                <option key={u} value={u}>{u} UMA{u > 1 ? 's' : ''} — {fmtMXN2(u * umaDiaria)}/dia</option>
              ))}
            </select>
            {ingresoObjetivo > 0 && escRec && (
              <div style={{ marginTop: '10px', background: escRec.pension_mensual >= ingresoObjetivo ? K.greenSoft : K.amberSoft, borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '15px', color: K.ink, margin: 0, lineHeight: 1.55 }}>
                  {escRec.pension_mensual >= ingresoObjetivo
                    ? <>Con {mod40Umas} UMAs la pension <span style={{ color: K.green, fontWeight: 700 }}>alcanza la meta</span> de {fmtMXN2(ingresoObjetivo)}/mes.</>
                    : <>Faltan <span style={{ color: K.amber, fontWeight: 700 }}>{fmtMXN2(ingresoObjetivo - escRec.pension_mensual)}/mes</span> para la meta de {fmtMXN2(ingresoObjetivo)}. Sube las UMAs o los meses.</>}
                </p>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '18px' }}>
            <Etiqueta>Meses en Mod. 40 <Tip id="duracionMod40" /></Etiqueta>
            <select value={mod40Meses} onChange={e => setMod40Meses(Number(e.target.value))} style={campo}>
              {[6,12,18,24,30,36,42,48,54,60,66,72,78,84,90,96,102,108,114,120].map(m => (
                <option key={m} value={m}>{m} meses ({(m / 12).toFixed(1)} anios)</option>
              ))}
            </select>
          </div>

          <div>
            <Etiqueta>Trámite retroactivo <Tip id="retroactivo" /></Etiqueta>
            <select value={tieneAtraso ? 'si' : 'no'} onChange={e => setTieneAtraso(e.target.value === 'si')}
              style={{ ...campo, borderColor: tieneAtraso ? K.orange : K.line, background: tieneAtraso ? K.orangeSoft : K.card, color: tieneAtraso ? K.orange : K.ink }}>
              <option value="no">No — cotización mensual normal</option>
              <option value="si">Sí — pago retroactivo con recargos</option>
            </select>
            {tieneAtraso && (
              <div style={{ marginTop: '10px', background: K.orangeSoft, borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '15px', color: K.ink, margin: 0, lineHeight: 1.55 }}>
                  El pago retroactivo agrega actualizaciones y recargos sobre el costo base.{' '}
                  <span style={{ color: K.orange, fontWeight: 700 }}>Verifica que el cliente siga dentro del plazo del Art. 219 LSS.</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Escenarios calculados ─────────────────────────────── */}
        <div style={{ background: K.card, border: `1px solid ${K.line}`, borderRadius: '14px', boxShadow: '0 1px 3px rgba(19,33,53,0.06)', padding: '24px' }}>
          <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: '0 0 4px' }}>Escenarios calculados</p>
          <p style={{ fontSize: '13px', color: K.muted, margin: '0 0 18px' }}>
            Comparados contra {fmtMXN2(pensionActual)}/mes sin Mod. 40
          </p>

          {escs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: K.muted }}>
              <p style={{ fontSize: '15px', margin: 0 }}>Ajusta los parámetros para generar escenarios</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {escs.map((esc, i) => {
                const c = COLORES[i] || K.navy600
                const incr = esc.pension_mensual - pensionActual
                return (
                  <div key={i} style={{ borderRadius: '12px', padding: '16px', background: esc.recomendado ? K.greenSoft : K.paper, border: esc.recomendado ? `1px solid ${K.green}44` : `1px solid ${K.line}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: c, ...nw }}>
                        {esc.recomendado && '\u2605 '}Esc. {i + 1} — {esc.mod40_umas} UMAs &middot; {esc.mod40_meses} meses
                      </span>
                      <span style={{ fontSize: '22px', fontWeight: 800, color: K.ink, ...nw, ...num }}>{fmtMXN2(esc.pension_mensual)}</span>
                    </div>

                    <div style={{ height: '8px', background: 'rgba(0,0,0,.06)', borderRadius: 999, overflow: 'hidden', margin: '10px 0 12px' }}>
                      <div style={{ height: '100%', width: anim ? `${(esc.pension_mensual / maxPension) * 100}%` : '0%', background: c, borderRadius: 999, transition: 'width .9s cubic-bezier(.22,1,.36,1)' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      {[
                        ['Mejora', '+' + fmtMXN(incr), K.green],
                        ['Inversión neta', fmtMXN(esc.inversion_neta), K.amber],
                        ['Recuperación', `${esc.roi} meses`, K.navy600],
                      ].map(([l, v, col], mi) => (
                        <div key={mi}>
                          <p style={{ fontSize: '13px', color: K.muted, margin: 0 }}>{l}</p>
                          <p style={{ fontSize: '17px', fontWeight: 700, color: col, margin: '2px 0 0', ...nw, ...num }}>{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(3)}
          style={{ padding: '13px 24px', background: K.orange, color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '17px', fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 3px 10px rgba(232,98,44,0.34)' }}>
          SDI 250 sem. <i className="ti ti-arrow-right" style={{ fontSize: '16px' }} />
        </button>
      </div>
    </div>
  )
}
