'use client'
import React from 'react'
import { K, nw } from '@/lib/design-tokens'
import PanelElegibilidad from './PanelElegibilidad'


const AZUL = K.navy600
const VERDE = K.green
const NARANJA = K.orange
const MORADO = K.purple
const BORDE = K.line

/* La procedencia del dato se conserva como informacion, pero deja de pintar
   el fondo de cada campo: eso generaba cuatro paletas compitiendo en una
   sola pantalla. Ahora es un punto de color con su etiqueta. */
const SEM = {
  imss:     { bg: K.card, border: K.line, text: K.ink, dot: K.navy600, badgeBg: '#DBEAFE', label: 'Dato IMSS' },
  manual:   { bg: K.card, border: K.line, text: K.ink, dot: K.orange,  badgeBg: '#FED7AA', label: 'Captura manual' },
  strategy: { bg: K.card, border: K.line, text: K.ink, dot: K.green,   badgeBg: '#BBF7D0', label: 'Decisión estratégica' },
  result:   { bg: K.paper, border: K.line, text: K.ink, dot: K.purple, badgeBg: '#DDD6FE', label: 'Calculado' },
}


const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

// Input semántico con dot de color
const Field = ({ label, tipo, children, fullWidth }: { label: string; tipo: keyof typeof SEM; children: React.ReactNode; fullWidth?: boolean }) => (
  <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: SEM[tipo].dot, flexShrink: 0, display: 'inline-block' }} />
      <label style={{ fontSize: '15px', fontWeight: 500, color: '#66738A' }}>{label}</label>
    </div>
    {children}
  </div>
)

const inputBase = (tipo: keyof typeof SEM): React.CSSProperties => ({
  width: '100%', height: '48px', border: `1px solid ${SEM[tipo].border}`,
  borderRadius: '10px', padding: '0 14px', fontSize: '17px', fontFamily: 'inherit',
  boxSizing: 'border-box' as const, background: SEM[tipo].bg, color: SEM[tipo].text,
  fontWeight: 600, outline: 'none',
})

const CardSection = ({ tipo, title, children }: { tipo: keyof typeof SEM; title: string; children: React.ReactNode }) => (
  <div style={{ background: K.card, borderRadius: '14px', border: `1px solid ${K.line}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(19,33,53,0.06)' }}>
    <div style={{ padding: '18px 24px 14px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
      <span style={{ fontSize: '20px', fontWeight: 700, color: K.ink }}>{title}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: K.muted, ...nw }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: SEM[tipo].dot, display: 'inline-block' }} />
        {SEM[tipo].label}
      </span>
    </div>
    <div style={{ padding: '0 24px 22px' }}>{children}</div>
  </div>
)

interface Props {
  datos: any
  setDatos: (fn: (p: any) => any) => void
  ingresoObjetivo: number
  setIngresoObjetivo: (v: number) => void
  setEdadRetiro: (v: number) => void
  sdiPromedio: number
  periodos: any[]
  periodosCompletos: any[]
  conservacion: any
  escenarios: any[]
  clientes: any[]
  clienteId: string
  setShowDetalle250: (v: boolean) => void
  setShowHistorialCompleto: (v: boolean) => void
  Tip: (props: { id: string }) => React.ReactElement | null
  setTab: (t: number) => void
}

export default function TabCliente({
  datos, setDatos, ingresoObjetivo, setIngresoObjetivo, setEdadRetiro,
  sdiPromedio, periodos, periodosCompletos, conservacion, escenarios,
  clientes, clienteId, setShowDetalle250, setShowHistorialCompleto, Tip, setTab
}: Props) {
  const sem = datos.semanas_totales - datos.semanas_descontadas
  const semFaltantes = Math.max(0, 500 - sem)
  const escRec = escenarios.find((e: any) => e.recomendado) ?? escenarios[escenarios.length - 1]
  const fechaTramite = datos.fecha_nacimiento ? (() => {
    const d = new Date(datos.fecha_nacimiento)
    d.setFullYear(d.getFullYear() + (datos.edad_min_pension || 60))
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
  })() : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Leyenda de colores ── */}
      <div style={{ display: 'flex', gap: '12px', padding: '8px 12px', background: 'white', borderRadius: '8px', border: `1px solid ${BORDE}`, flexWrap: 'wrap' as const }}>
        {Object.entries(SEM).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: v.dot, display: 'inline-block' }} />
            <span style={{ fontSize: '15px', color: '#132135' }}>{v.label}</span>
          </div>
        ))}
      </div>

      {/* ── KPIs resumen ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {[
          { label: 'Semanas netas', value: sem > 0 ? sem.toLocaleString() : '—', tipo: 'imss' as const, accent: sem >= 500 ? VERDE : AZUL },
          { label: 'Sem. faltantes', value: semFaltantes === 0 ? '✓ Listo' : String(semFaltantes), tipo: 'result' as const, accent: semFaltantes === 0 ? VERDE : '#DC2626' },
          { label: 'SDI promedio', value: sdiPromedio > 0 ? fmtMXN2(sdiPromedio) : '—', tipo: 'result' as const, accent: MORADO },
          { label: 'Fecha trámite', value: fechaTramite, tipo: 'result' as const, accent: MORADO },
        ].map((k, i) => (
          <div key={i} style={{ background: 'white', border: `1.5px solid ${k.accent}22`, borderTop: `3px solid ${k.accent}`, padding: '10px 12px', borderRadius: '8px', textAlign: 'center' as const }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: SEM[k.tipo].dot, display: 'inline-block' }} />
              <span style={{ fontSize: '13px', color: '#66738A' }}>{k.label}</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: k.accent }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Grid 2 columnas: Parámetros + Familia ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        <CardSection tipo="manual" title="Parámetros de retiro">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Field label="¿Seguirá cotizando?" tipo="manual">
                <select value={datos.sigue_cotizando ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, sigue_cotizando: e.target.value === 'si' }))} style={inputBase('manual')}>
                  <option value="si">✓ Sí</option>
                  <option value="no">✕ No</option>
                </select>
              </Field>
              <Field label="Edad de pensión" tipo="manual">
                <select value={datos.edad_min_pension || 60} onChange={e => { const v = parseInt(e.target.value); setDatos(p => ({ ...p, edad_min_pension: v })); setEdadRetiro(v) }} style={inputBase('manual')}>
                  {[60,61,62,63,64,65].map(a => <option key={a} value={a}>{a} años — {75+(a-60)*5}%</option>)}
                </select>
              </Field>
            </div>
            <Field label={<>Ingreso objetivo / mes <Tip id="ingresoObjetivo" /></> as any} tipo="manual">
              <input type="number" value={ingresoObjetivo || ''} onChange={e => setIngresoObjetivo(Number(e.target.value) || 0)} placeholder="Ej. 25,000" style={{ ...inputBase('manual'), fontWeight: '600', fontSize: '14px' }} />
            </Field>
            <Field label="Fecha de cálculo" tipo="manual">
              <input type="date" value={datos.fecha_calculo} onChange={e => setDatos(p => ({ ...p, fecha_calculo: e.target.value }))} style={inputBase('manual')} />
            </Field>
          </div>
        </CardSection>

        <CardSection tipo="imss" title="Familia y beneficiarios">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Field label="Cónyuge / concubino" tipo="manual">
                <select value={datos.tiene_conyuge ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, tiene_conyuge: e.target.value === 'si' }))} style={inputBase('manual')}>
                  <option value="no">✕ No</option>
                  <option value="si">✓ Sí</option>
                </select>
              </Field>
              <Field label="Hijos menores 16" tipo="manual">
                <select value={datos.num_hijos} onChange={e => setDatos(p => ({ ...p, num_hijos: parseInt(e.target.value) }))} style={inputBase('manual')}>
                  {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n} {n === 0 ? '(ninguno)' : n === 1 ? 'hijo' : 'hijos'}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Field label="Padres dependientes" tipo="manual">
                <select value={datos.num_padres} onChange={e => setDatos(p => ({ ...p, num_padres: parseInt(e.target.value) }))} style={inputBase('manual')}>
                  {[0,1,2].map(n => <option key={n} value={n}>{n} {n === 0 ? '(ninguno)' : n === 1 ? 'padre' : 'padres'}</option>)}
                </select>
              </Field>
              <Field label="Art. 165 Asistencial" tipo="result">
                <div style={{ ...inputBase('result'), display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: '600' }}>
                  {datos.tiene_ayuda_asistencial ? `✓ +${datos.pct_ayuda_asistencial || 0}%` : 'No aplica'}
                </div>
              </Field>
            </div>
            {/* Resumen visual beneficiarios */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              {[
                { label: 'Cónyuge', value: datos.tiene_conyuge ? 'Sí' : 'No', ok: datos.tiene_conyuge },
                { label: 'Hijos', value: String(datos.num_hijos), ok: datos.num_hijos > 0 },
                { label: 'Padres', value: String(datos.num_padres), ok: datos.num_padres > 0 },
              ].map(({ label, value, ok }, i) => (
                <div key={i} style={{ textAlign: 'center' as const, padding: '8px 4px', background: ok ? '#F0F7F4' : '#F8FAFC', border: `1px solid ${ok ? '#86EFAC' : BORDE}`, borderRadius: '8px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: ok ? VERDE : '#9CA3AF' }}>{value}</div>
                  <div style={{ fontSize: '13px', color: '#66738A' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </CardSection>
      </div>

      {/* ── SDI 250 semanas ── */}
      <CardSection tipo="result" title="SDI promedio · últimas 250 semanas">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
          <p style={{ fontSize: '15px', color: '#66738A', margin: 0 }}>Art. 167 LSS 1973 — base real del cálculo de pensión</p>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setShowDetalle250(true)} style={{ padding: '10px 16px', background: 'transparent', color: K.navy600, border: `1px solid ${K.line}`, borderRadius: '9px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Ver 250 sem.</button>
            <button onClick={() => setShowHistorialCompleto(true)} style={{ padding: '10px 16px', background: 'transparent', color: K.green, border: `1px solid ${K.line}`, borderRadius: '9px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Historial ({periodosCompletos.length})</button>
          </div>
        </div>
        {periodos.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center' as const, color: '#94A3B8', background: '#F9FAFB', border: '1px dashed #E5E7EB', borderRadius: '8px' }}>
            <p style={{ fontSize: '13px', margin: 0 }}>Carga la constancia IMSS para ver el cálculo del SDI</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '12px', alignItems: 'start' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '15px' }}>
                <thead>
                  <tr style={{ background: AZUL }}>
                    {['Período','Sem.','SDI diario','Peso'].map((h,i) => (
                      <th key={i} style={{ padding: '12px 14px', color: 'white', fontSize: '13px', fontWeight: 600, textAlign: i > 0 ? 'right' as const : 'left' as const, whiteSpace: 'nowrap' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodos.map((p: any, i: number) => (
                    <tr key={i} style={{ background: i === 0 ? '#FFFBEB' : i % 2 === 0 ? 'white' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '11px 14px', fontSize: '15px', color: '#132135', whiteSpace: 'nowrap' as const }}>{p.fecha_inicio?.slice(0,7)} → {p.fecha_fin?.slice(0,7)}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' as const, fontSize: '15px', fontVariantNumeric: 'tabular-nums' as const }}>{p.semanas}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' as const, fontWeight: '700', color: '#B45309' }}>{fmtMXN2(p.sdi)}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' as const, color: '#66738A', fontSize: '15px', fontVariantNumeric: 'tabular-nums' as const }}>{p.peso.toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr style={{ background: AZUL }}>
                    <td style={{ padding: '12px 14px', color: 'white', fontWeight: 700, fontSize: '15px' }}>Promedio ponderado</td>
                    <td style={{ padding: '12px 14px', color: 'white', fontWeight: 700, textAlign: 'right' as const, fontSize: '15px' }}>{periodos.reduce((s: number, p: any) => s + p.semanas, 0)}</td>
                    <td style={{ padding: '8px 10px', color: '#FCD34D', fontWeight: '800', textAlign: 'right' as const, fontSize: '15px' }}>{fmtMXN2(sdiPromedio)}</td>
                    <td style={{ padding: '12px 14px', color: 'white', fontWeight: 700, textAlign: 'right' as const, fontSize: '15px' }}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ padding: '10px', background: SEM.result.bg, border: `1.5px solid ${SEM.result.border}`, borderRadius: '8px', textAlign: 'center' as const }}>
                <div style={{ fontSize: '13px', color: '#66738A', marginBottom: '4px' }}>SDI diario</div>
                <div style={{ fontSize: '20px', fontWeight: '800', color: MORADO }}>{fmtMXN2(sdiPromedio)}</div>
              </div>
              <div style={{ padding: '10px', background: SEM.imss.bg, border: `1px solid ${SEM.imss.border}22`, borderRadius: '8px', textAlign: 'center' as const }}>
                <div style={{ fontSize: '13px', color: '#66738A', marginBottom: '4px' }}>SDI mensual</div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: AZUL }}>{fmtMXN(sdiPromedio * 30.4167)}</div>
              </div>
            </div>
          </div>
        )}
      </CardSection>

      {/* ── Compuerta de elegibilidad ──────────────────────────────
           Va antes del perfil del pensionado a propósito: si el cliente no
           puede acceder a la vía, el asesor debe saberlo antes de invertir
           tiempo en afinar el escenario. */}
      <PanelElegibilidad
        datos={datos}
        setDatos={setDatos}
        semanasNetas={(datos.semanas_totales || 0) - (datos.semanas_descontadas || 0)}
      />

      {/* ── Perfil del pensionado (si hay escenario) ── */}
      {escRec && escRec.mod40_meses > 0 && (
        <CardSection tipo="strategy" title="Perfil del pensionado — escenario recomendado">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { label: 'Edad de retiro', value: escRec.edad_retiro?.toFixed(1) + ' años', color: AZUL },
              { label: 'Semanas finales', value: Math.round(escRec.semanas_finales || 0).toLocaleString(), color: (escRec.semanas_finales || 0) >= 500 ? VERDE : '#DC2626' },
              { label: 'Nuevo SDI prom.', value: fmtMXN2(escRec.nuevo_sdi_250), color: MORADO },
              { label: 'Duración Mod. 40', value: `${escRec.mod40_meses} meses`, color: VERDE },
            ].map((k, i) => (
              <div key={i} style={{ padding: '10px', background: SEM.strategy.bg, border: `1px solid ${SEM.strategy.border}33`, borderRadius: '8px', textAlign: 'center' as const }}>
                <div style={{ fontSize: '13px', color: '#66738A', marginBottom: '5px' }}>{k.label}</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        </CardSection>
      )}

      {/* Siguiente */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(1)} style={{ padding: '13px 24px', background: K.orange, color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '17px', fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 3px 10px rgba(232,98,44,0.34)' }}>
          Cuantías anuales <i className="ti ti-arrow-right" style={{ fontSize: '14px' }} />
        </button>
      </div>
    </div>
  )
}
