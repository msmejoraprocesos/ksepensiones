'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useSearchParams } from 'next/navigation'

const AZUL = '#1F3A5F'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

interface SysVars {
  UMA_DIARIA: number
  SALARIO_MIN: number
  PMG_MENSUAL: number
  RENDIMIENTO_DEFAULT: number
}

interface Cliente { id: string; nombre: string }

interface Resultados {
  e1_pension_imss: number
  e2_afore_solo: number
  e3_con_ppr: number
  e4_mod40: number
  costo_mod40: number
}

// ── Fórmulas exactas ──────────────────────────────────────────────
function calcPensionLey73(semanas: number, salarioDiario: number, sys: SysVars): number {
  if (semanas < 500) return 0
  const SDI = salarioDiario * sys.SALARIO_MIN * 1.0452
  const semanasExtra = Math.max(0, semanas - 500)
  const incrementos = Math.floor(semanasExtra / 52)
  const pct = Math.min(1.0, 0.35 + incrementos * 0.0125)
  const pensionDiaria = SDI * pct
  return Math.max(sys.PMG_MENSUAL / 30.4, pensionDiaria) * 30.4
}

function calcAforeRetiro(saldo: number, aportacion: number, rendimiento: number, anios: number): number {
  if (anios <= 0) return saldo * (rendimiento / 100 / 12) / (1 - Math.pow(1 + rendimiento / 100 / 12, -240))
  const r = rendimiento / 100 / 12
  const n = anios * 12
  const vf = saldo * Math.pow(1 + r, n) + aportacion * ((Math.pow(1 + r, n) - 1) / r)
  return vf * r / (1 - Math.pow(1 + r, -240))
}

function costoMod40(umasSalario: number, sys: SysVars, anio = 2026): number {
  const MOD40_PCT: Record<number, number> = { 2026: 14.438, 2027: 15.528, 2028: 16.619, 2029: 17.709, 2030: 18.800 }
  const pct = MOD40_PCT[anio] ?? MOD40_PCT[2030]
  return umasSalario * sys.UMA_DIARIA * 30.4 * (pct / 100)
}

function CalculadoraInner() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const clienteIdParam = searchParams.get('cliente')

  const [sys, setSys] = useState<SysVars>({ UMA_DIARIA: 113.45, SALARIO_MIN: 263.12, PMG_MENSUAL: 5953, RENDIMIENTO_DEFAULT: 6 })
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [userId, setUserId] = useState('')

  // Inputs
  const [ley, setLey] = useState<'73' | '97'>('73')
  const [clienteId, setClienteId] = useState(clienteIdParam ?? '')
  const [semanas, setSemanas] = useState('')
  const [salarioDiario, setSalarioDiario] = useState('')
  const [edadActual, setEdadActual] = useState('')
  const [edadRetiro, setEdadRetiro] = useState('65')
  const [ingresoDeseado, setIngresoDeseado] = useState('')
  const [aforeSaldo, setAforeSaldo] = useState('0')
  const [pprMensual, setPprMensual] = useState('0')
  const [rendimiento, setRendimiento] = useState('6')
  const [anioMod40, setAnioMod40] = useState(2026)

  const [resultados, setResultados] = useState<Resultados | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notas, setNotas] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      // Load sys vars
      supabase.from('perfiles_usuario').select('*').eq('id', session.user.id).single().then(({ data }) => {
        if (data) setSys({
          UMA_DIARIA: data.uma_diaria ?? 113.45,
          SALARIO_MIN: data.salario_minimo ?? 263.12,
          PMG_MENSUAL: data.pmg_mensual ?? 5953,
          RENDIMIENTO_DEFAULT: data.rendimiento_afore_default ?? 6,
        })
      })
      // Load clientes
      supabase.from('clientes').select('id, nombre').eq('asesor_id', session.user.id).order('nombre').then(({ data }) => {
        setClientes((data as Cliente[]) ?? [])
      })
    })
  }, [])

  function calcular() {
    const sem = parseInt(semanas) || 0
    const sal = parseFloat(salarioDiario) || 0
    const edadR = parseInt(edadRetiro) || 65
    const edadA = parseInt(edadActual) || 40
    const anios = Math.max(0, edadR - edadA)
    const saldo = parseFloat(aforeSaldo) || 0
    const ppr = parseFloat(pprMensual) || 0
    const rend = parseFloat(rendimiento) || sys.RENDIMIENTO_DEFAULT

    const e1 = ley === '73' ? calcPensionLey73(sem, sal, sys) : 0
    const e2 = calcAforeRetiro(saldo, 0, rend, anios)
    const e3 = calcAforeRetiro(saldo, ppr, rend, anios)
    const umasSalario = sal * sys.SALARIO_MIN / sys.UMA_DIARIA
    const costo = costoMod40(umasSalario, sys, anioMod40)
    const e4 = ley === '73' ? calcPensionLey73(sem + (anios * 52), sal, sys) : calcAforeRetiro(saldo, ppr + costo, rend, anios)

    setResultados({ e1_pension_imss: e1, e2_afore_solo: e2, e3_con_ppr: e3, e4_mod40: e4, costo_mod40: costo })
    setSaved(false)
  }

  async function guardarDiagnostico() {
    if (!resultados || !clienteId) return
    setSaving(true)
    await supabase.from('diagnosticos').insert({
      asesor_id: userId,
      cliente_id: clienteId,
      ley,
      semanas: parseInt(semanas) || 0,
      salario_diario: parseFloat(salarioDiario) || 0,
      edad_retiro: parseInt(edadRetiro) || 65,
      ingreso_deseado: parseFloat(ingresoDeseado) || 0,
      afore_saldo: parseFloat(aforeSaldo) || 0,
      ppr_mensual: parseFloat(pprMensual) || 0,
      rendimiento: parseFloat(rendimiento) || 6,
      resultado_e1: resultados.e1_pension_imss,
      resultado_e2: resultados.e2_afore_solo,
      resultado_e3: resultados.e3_con_ppr,
      resultado_e4: resultados.e4_mod40,
      notas: notas || null,
    })
    setSaving(false)
    setSaved(true)
  }

  const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`
  const inputStyle = { display: 'block', width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' as const, outline: 'none' }
  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '600' as const, color: '#374151', marginBottom: '5px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', flexShrink: 0 }}>
        <h1 style={{ color: AZUL, fontSize: '20px', fontWeight: '700', margin: 0 }}>Calculadora de Pensiones</h1>
        <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0' }}>Variables del sistema: UMA ${sys.UMA_DIARIA} · SM ${sys.SALARIO_MIN} · PMG ${sys.PMG_MENSUAL.toLocaleString()}</p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '380px 1fr', gap: '20px' }}>
        {/* Panel izquierdo — Inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Cliente y Ley */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ color: AZUL, fontSize: '13px', fontWeight: '700', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Datos generales</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Cliente</label>
                <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={{ ...inputStyle, background: 'white' }}>
                  <option value="">— Seleccionar cliente —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Régimen de pensión</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['73', '97'] as const).map(l => (
                    <button key={l} onClick={() => setLey(l)}
                      style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `2px solid ${ley === l ? AZUL : '#e2e8f0'}`, background: ley === l ? AZUL : 'white', color: ley === l ? 'white' : '#64748b', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                      Ley {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Datos laborales */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ color: AZUL, fontSize: '13px', fontWeight: '700', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Datos laborales</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Semanas cotizadas</label>
                <input type="number" value={semanas} onChange={e => setSemanas(e.target.value)} placeholder="Ej. 750" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Salario diario (veces SM)</label>
                <input type="number" value={salarioDiario} onChange={e => setSalarioDiario(e.target.value)} placeholder="Ej. 2.5" step="0.1" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Edad actual</label>
                <input type="number" value={edadActual} onChange={e => setEdadActual(e.target.value)} placeholder="Ej. 45" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Edad de retiro</label>
                <input type="number" value={edadRetiro} onChange={e => setEdadRetiro(e.target.value)} placeholder="65" style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Ingreso deseado al retiro ($/mes)</label>
                <input type="number" value={ingresoDeseado} onChange={e => setIngresoDeseado(e.target.value)} placeholder="Ej. 15000" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* AFORE y PPR */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ color: AZUL, fontSize: '13px', fontWeight: '700', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>AFORE y ahorro</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Saldo AFORE actual ($)</label>
                <input type="number" value={aforeSaldo} onChange={e => setAforeSaldo(e.target.value)} placeholder="0" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Aportación PPR mensual ($)</label>
                <input type="number" value={pprMensual} onChange={e => setPprMensual(e.target.value)} placeholder="0" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Rendimiento AFORE anual (%)</label>
                <input type="number" value={rendimiento} onChange={e => setRendimiento(e.target.value)} placeholder="6" step="0.5" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Mod 40 */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ color: AZUL, fontSize: '13px', fontWeight: '700', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Modalidad 40</h3>
            <div>
              <label style={labelStyle}>Año de inicio Mod. 40</label>
              <select value={anioMod40} onChange={e => setAnioMod40(parseInt(e.target.value))} style={{ ...inputStyle, background: 'white' }}>
                {[2026, 2027, 2028, 2029, 2030].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <button onClick={calcular}
            style={{ padding: '14px', background: AZUL, color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', letterSpacing: '0.3px' }}>
            Calcular diagnóstico
          </button>
        </div>

        {/* Panel derecho — Resultados */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!resultados ? (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#94a3b8' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⊞</div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>Llena los datos y presiona calcular</div>
              <div style={{ fontSize: '13px', marginTop: '8px' }}>El diagnóstico mostrará 4 escenarios</div>
            </div>
          ) : (
            <>
              {/* 4 escenarios */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {[
                  { label: 'E1 — Pensión IMSS', sublabel: ley === '73' ? 'Ley 73 sin modificaciones' : 'Ley 97 base', value: resultados.e1_pension_imss, color: AZUL, icon: '🏛️' },
                  { label: 'E2 — Solo AFORE', sublabel: 'Saldo actual proyectado', value: resultados.e2_afore_solo, color: VERDE, icon: '💰' },
                  { label: 'E3 — AFORE + PPR', sublabel: `Con aportación $${parseInt(pprMensual || '0').toLocaleString()}/mes`, value: resultados.e3_con_ppr, color: '#7C3AED', icon: '📈' },
                  { label: 'E4 — Con Mod. 40', sublabel: `Costo: ${fmtMoney(resultados.costo_mod40)}/mes`, value: resultados.e4_mod40, color: NARANJA, icon: '⚡' },
                ].map((e, i) => (
                  <div key={i} style={{ background: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <span style={{ fontSize: '20px' }}>{e.icon}</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>{e.label}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{e.sublabel}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '800', color: e.color }}>{fmtMoney(e.value)}</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>mensuales al retiro</div>
                    {ingresoDeseado && (
                      <div style={{ marginTop: '8px', fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: e.value >= parseFloat(ingresoDeseado) ? '#f0fdf4' : '#fef2f2', color: e.value >= parseFloat(ingresoDeseado) ? VERDE : '#dc2626', fontWeight: '600' }}>
                        {e.value >= parseFloat(ingresoDeseado) ? '✓ Cubre meta' : `Brecha: ${fmtMoney(parseFloat(ingresoDeseado) - e.value)}/mes`}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Guardar diagnóstico */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ color: AZUL, fontSize: '13px', fontWeight: '700', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Guardar diagnóstico</h3>
                <textarea placeholder="Notas del diagnóstico (opcional)..." value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', resize: 'none', outline: 'none', marginBottom: '10px' }} />
                {!clienteId && <p style={{ fontSize: '12px', color: NARANJA, marginBottom: '8px' }}>⚠️ Selecciona un cliente para guardar</p>}
                <button onClick={guardarDiagnostico} disabled={saving || !clienteId || saved}
                  style={{ width: '100%', padding: '10px', background: saved ? VERDE : (!clienteId ? '#94a3b8' : AZUL), color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: (!clienteId || saved) ? 'not-allowed' : 'pointer' }}>
                  {saved ? '✓ Diagnóstico guardado' : saving ? 'Guardando...' : 'Guardar diagnóstico'}
                </button>
              </div>

              {/* Disclaimer */}
              <div style={{ background: '#FEF4EC', borderRadius: '10px', padding: '12px 16px', border: '1px solid #fed7aa' }}>
                <p style={{ fontSize: '11px', color: '#92400e', margin: 0, lineHeight: '1.6' }}>
                  ⚠️ <strong>Cálculos orientativos.</strong> Rendimientos AFORE son proyecciones, no garantías. Los resultados dependen de factores variables como inflación, cambios legislativos y rendimientos reales del fondo. Este diagnóstico no constituye asesoría financiera formal.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CalculadoraPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Cargando calculadora...</div>}>
      <CalculadoraInner />
    </Suspense>
  )
}
