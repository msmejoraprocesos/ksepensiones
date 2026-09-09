'use client'
import React from 'react'

const AZUL = '#334E7B'
const VERDE = '#2E7D5A'
const NARANJA = '#E8724A'
const BORDE = '#E2E8F0'

const DS = {
  label: { fontSize: '10px', fontWeight: '500' as const, color: '#94A3B8', marginBottom: '4px', display: 'block' as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  input: { width: '100%', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' as const, background: 'white', color: '#1E293B', outline: 'none' } as React.CSSProperties,
  select: { width: '100%', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', background: 'white', boxSizing: 'border-box' as const, color: '#1E293B' } as React.CSSProperties,
  tHead: { background: '#334E7B', color: 'white', padding: '7px 10px', fontSize: '10px', fontWeight: '600' as const, textAlign: 'left' as const },
  tCellR: { padding: '7px 10px', fontSize: '11px', color: '#1E293B', borderBottom: '1px solid #F1F5F9', textAlign: 'right' as const } as React.CSSProperties,
  tCellBold: { padding: '7px 10px', fontSize: '13px', color: '#334E7B', fontWeight: '700' as const, borderBottom: '1px solid #F1F5F9', textAlign: 'right' as const } as React.CSSProperties,
  tCell: { padding: '7px 10px', fontSize: '11px', color: '#1E293B', borderBottom: '1px solid #F1F5F9' } as React.CSSProperties,
}

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

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

      {/* KPIs rápidos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {[
          { label: 'Semanas netas', value: sem > 0 ? sem.toLocaleString() : '—', color: sem >= 500 ? VERDE : AZUL, bg: sem >= 500 ? '#F0FDF4' : '#EEF2F8', border: sem >= 500 ? '#86EFAC' : AZUL },
          { label: 'Sem. faltantes', value: semFaltantes === 0 ? '✓ Listo' : String(semFaltantes), color: semFaltantes === 0 ? VERDE : '#DC2626', bg: semFaltantes === 0 ? '#F0FDF4' : '#FEF2F2', border: semFaltantes === 0 ? '#86EFAC' : '#FCA5A5' },
          { label: 'SDI promedio', value: sdiPromedio > 0 ? fmtMXN2(sdiPromedio) : '—', color: '#92400E', bg: '#FFFBEB', border: '#FCD34D' },
          { label: 'Fecha trámite', value: fechaTramite, color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
        ].map((k, i) => (
          <div key={i} style={{ background: k.bg, border: `2px solid ${k.border}`, padding: '10px 12px', textAlign: 'center', borderRadius: '8px' }}>
            <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600', marginBottom: '4px' }}>{k.label}</div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Grid 2 columnas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* Card Parámetros */}
        <div style={{ background: 'white', borderRadius: '10px', borderLeft: `4px solid ${AZUL}`, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <span style={{ fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px', background: '#EEF2F8', color: AZUL, padding: '3px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '10px' }}>Parámetros de retiro</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={DS.label}>¿Seguirá cotizando?</label>
                <select value={datos.sigue_cotizando ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, sigue_cotizando: e.target.value === 'si' }))} style={DS.select}>
                  <option value="si">✓ Sí</option>
                  <option value="no">✕ No</option>
                </select>
              </div>
              <div>
                <label style={DS.label}>Edad de pensión <Tip id="factorEdad" /></label>
                <select value={datos.edad_min_pension || 60} onChange={e => { const v = parseInt(e.target.value); setDatos(p => ({ ...p, edad_min_pension: v })); setEdadRetiro(v) }} style={DS.select}>
                  {[60,61,62,63,64,65].map(a => <option key={a} value={a}>{a} años — {75+(a-60)*5}%</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={DS.label}>Ingreso objetivo / mes <Tip id="ingresoObjetivo" /></label>
              <input type="number" value={ingresoObjetivo || ''} onChange={e => setIngresoObjetivo(Number(e.target.value) || 0)} placeholder="Ej. 25,000" style={{ ...DS.input, fontWeight: '700', color: NARANJA }} />
            </div>
            <div>
              <label style={DS.label}>Fecha de cálculo</label>
              <input type="date" value={datos.fecha_calculo} onChange={e => setDatos(p => ({ ...p, fecha_calculo: e.target.value }))} style={DS.input} />
            </div>
          </div>
        </div>

        {/* Card Familia */}
        <div style={{ background: 'white', borderRadius: '10px', borderLeft: `4px solid ${VERDE}`, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <span style={{ fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px', background: '#F0F7F4', color: VERDE, padding: '3px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '10px' }}>Familia y beneficiarios</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={DS.label}>Cónyuge / concubino <Tip id="conyuge" /></label>
                <select value={datos.tiene_conyuge ? 'si' : 'no'} onChange={e => setDatos(p => ({ ...p, tiene_conyuge: e.target.value === 'si' }))} style={DS.select}>
                  <option value="no">✕ No</option>
                  <option value="si">✓ Sí</option>
                </select>
              </div>
              <div>
                <label style={DS.label}>Hijos {'<'} 16 años <Tip id="numHijos" /></label>
                <select value={datos.num_hijos} onChange={e => setDatos(p => ({ ...p, num_hijos: parseInt(e.target.value) }))} style={DS.select}>
                  {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n} {n === 0 ? '(ninguno)' : n === 1 ? 'hijo' : 'hijos'}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={DS.label}>Padres dependientes <Tip id="numPadres" /></label>
                <select value={datos.num_padres} onChange={e => setDatos(p => ({ ...p, num_padres: parseInt(e.target.value) }))} style={DS.select}>
                  {[0,1,2].map(n => <option key={n} value={n}>{n} {n === 0 ? '(ninguno)' : n === 1 ? 'padre' : 'padres'}</option>)}
                </select>
              </div>
              <div>
                <label style={DS.label}>Art. 165 Asistencial</label>
                <div style={{ padding: '8px 10px', background: datos.tiene_ayuda_asistencial ? '#F0FDF4' : '#F8FAFC', border: `1px solid ${datos.tiene_ayuda_asistencial ? '#86EFAC' : BORDE}`, borderRadius: '7px', fontSize: '12px', fontWeight: '600', color: datos.tiene_ayuda_asistencial ? VERDE : '#94A3B8', textAlign: 'center' }}>
                  {datos.tiene_ayuda_asistencial ? `✓ +${datos.pct_ayuda_asistencial || 0}%` : 'No aplica'}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              {[
                { label: 'Cónyuge', value: datos.tiene_conyuge ? 'Sí' : 'No', ok: datos.tiene_conyuge },
                { label: 'Hijos', value: String(datos.num_hijos), ok: datos.num_hijos > 0 },
                { label: 'Padres', value: String(datos.num_padres), ok: datos.num_padres > 0 },
              ].map(({ label, value, ok }, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '8px 4px', background: ok ? '#F0F7F4' : '#F8FAFC', border: `1px solid ${ok ? '#86EFAC' : BORDE}`, borderRadius: '6px' }}>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: ok ? VERDE : '#9CA3AF' }}>{value}</div>
                  <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Card SDI 250 semanas */}
      <div style={{ background: 'white', borderRadius: '10px', borderLeft: `4px solid ${NARANJA}`, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px', background: '#FFF7ED', color: '#B45309', padding: '3px 8px', borderRadius: '4px' }}>SDI promedio 250 semanas</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setShowDetalle250(true)} style={{ padding: '4px 10px', background: '#EEF2F8', color: AZUL, border: `1px solid #BFDBFE`, borderRadius: '5px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>Ver 250 sem.</button>
            <button onClick={() => setShowHistorialCompleto(true)} style={{ padding: '4px 10px', background: '#F0FDF4', color: '#065F46', border: '1px solid #86EFAC', borderRadius: '5px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>Historial ({periodosCompletos.length})</button>
          </div>
        </div>
        {periodos.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', background: '#F9FAFB', border: '1px dashed #E5E7EB', borderRadius: '8px' }}>
            <p style={{ fontSize: '13px', margin: 0 }}>Carga la constancia IMSS para ver el cálculo del SDI</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'start' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ background: AZUL }}>
                    {['Período','Sem.','SDI diario','Peso'].map((h,i) => (
                      <th key={i} style={{ ...DS.tHead, textAlign: i > 0 ? 'right' : 'left' as any }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodos.map((p: any, i: number) => (
                    <tr key={i} style={{ background: i === 0 ? '#FFFBEB' : i % 2 === 0 ? 'white' : '#F9FAFB' }}>
                      <td style={DS.tCell}>{p.fecha_inicio?.slice(0,7)} → {p.fecha_fin?.slice(0,7)}</td>
                      <td style={DS.tCellR}>{p.semanas}</td>
                      <td style={DS.tCellBold}>{fmtMXN2(p.sdi)}</td>
                      <td style={DS.tCellR}>{p.peso.toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr style={{ background: AZUL }}>
                    <td style={{ padding: '8px 10px', color: 'white', fontWeight: '700', fontSize: '11px' }}>Promedio ponderado</td>
                    <td style={{ padding: '8px 10px', color: 'white', fontWeight: '700', textAlign: 'right', fontSize: '11px' }}>{periodos.reduce((s: number, p: any) => s + p.semanas, 0)}</td>
                    <td style={{ padding: '8px 10px', color: '#FCD34D', fontWeight: '900', textAlign: 'right', fontSize: '14px' }}>{fmtMXN2(sdiPromedio)}</td>
                    <td style={{ padding: '8px 10px', color: 'white', fontWeight: '700', textAlign: 'right', fontSize: '11px' }}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '140px' }}>
              <div style={{ padding: '10px', background: '#FFFBEB', border: '2px solid #FCD34D', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: '#94A3B8', marginBottom: '3px', textTransform: 'uppercase' }}>SDI diario</div>
                <div style={{ fontSize: '18px', fontWeight: '900', color: '#92400E' }}>{fmtMXN2(sdiPromedio)}</div>
              </div>
              <div style={{ padding: '10px', background: '#EEF2F8', border: `1px solid #BFDBFE`, borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: '#94A3B8', marginBottom: '3px', textTransform: 'uppercase' }}>SDI mensual</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: AZUL }}>{fmtMXN(sdiPromedio * 30.4167)}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Perfil del pensionado si hay escenario */}
      {escRec && escRec.mod40_meses > 0 && (
        <div style={{ background: 'white', borderRadius: '10px', borderLeft: '4px solid #7C3AED', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <span style={{ fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.6px', background: '#F5F3FF', color: '#7C3AED', padding: '3px 8px', borderRadius: '4px', display: 'inline-block', marginBottom: '10px' }}>Perfil del pensionado — escenario recomendado</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { label: 'Edad de retiro', value: escRec.edad_retiro?.toFixed(1) + ' años', color: AZUL },
              { label: 'Semanas finales', value: Math.round(escRec.semanas_finales || 0).toLocaleString(), color: (escRec.semanas_finales || 0) >= 500 ? VERDE : '#DC2626' },
              { label: 'Nuevo SDI prom.', value: fmtMXN2(escRec.nuevo_sdi_250), color: '#92400E' },
              { label: 'Duración Mod. 40', value: `${escRec.mod40_meses} meses`, color: '#7C3AED' },
            ].map((k, i) => (
              <div key={i} style={{ padding: '10px', background: '#F8FAFC', border: `1px solid ${BORDE}`, borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>{k.label}</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Siguiente */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setTab(1)} style={{ padding: '9px 20px', background: AZUL, color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', fontFamily: 'inherit' }}>
          Cuantías anuales →
        </button>
      </div>
    </div>
  )
}
