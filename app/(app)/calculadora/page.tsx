'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
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
  INFLACION_UMA: number
  MOD40_PCT: Record<number, number>
}

const SYS_DEFAULT: SysVars = {
  UMA_DIARIA: 113.45,
  SALARIO_MIN: 263.12,
  PMG_MENSUAL: 5953,
  RENDIMIENTO_DEFAULT: 6,
  INFLACION_UMA: 0.045,
  MOD40_PCT: { 2026: 14.438, 2027: 15.528, 2028: 16.619, 2029: 17.709, 2030: 18.800 },
}

interface Inputs {
  ley: '73' | '97'
  fechaNac: string
  edadRetiro: number
  semanas: number
  salarioDiario: number
  ingresoDes: number
  mod40_umas: number
  mod40_anios: number
  mod10_umas: number
  mod10_anios: number
  ppr_mensual: number
  afore_saldo: number
  rendimiento: number
}

interface Escenario {
  nombre: string
  tag: string
  color: string
  pension: number
  inversion: number
  brecha: number
  recomendado: boolean
}

interface Cliente { id: string; nombre: string }

// ── Fórmulas ──────────────────────────────────────────────────────
function calcPensionLey73(semanas: number, salarioDiario: number, sys: SysVars): number {
  if (semanas < 500) return 0
  const sdp = salarioDiario * sys.SALARIO_MIN * 1.0452
  const extra = Math.max(0, semanas - 500)
  const pct = Math.min(1.0, 0.35 + Math.floor(extra / 52) * 0.0125)
  return Math.max(sys.PMG_MENSUAL / 30.4, sdp * pct) * 30.4
}

function calcAfore(saldo: number, aportacion: number, rend: number, anios: number): number {
  const r = rend / 100 / 12
  const n = anios * 12
  if (n === 0) return saldo * r / (1 - Math.pow(1 + r, -240))
  const vf = saldo * Math.pow(1 + r, n) + aportacion * ((Math.pow(1 + r, n) - 1) / r)
  return vf * r / (1 - Math.pow(1 + r, -240))
}

function costoMod40(umas: number, sys: SysVars, anio = 2026): number {
  const pct = sys.MOD40_PCT[anio] ?? sys.MOD40_PCT[2030]
  return umas * sys.UMA_DIARIA * 30.4 * (pct / 100)
}

function edadActual(fechaNac: string): number {
  if (!fechaNac) return 0
  const hoy = new Date()
  const nac = new Date(fechaNac)
  let edad = hoy.getFullYear() - nac.getFullYear()
  if (hoy.getMonth() - nac.getMonth() < 0 || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) edad--
  return edad
}

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

function CalculadoraInner() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const [sys, setSys] = useState<SysVars>(SYS_DEFAULT)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [userId, setUserId] = useState('')
  const [escenarios, setEscenarios] = useState<Escenario[]>([])
  const [escSelected, setEscSelected] = useState('e4')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [clienteId, setClienteId] = useState(searchParams.get('cliente') ?? '')
  const [notas, setNotas] = useState('')

  const [inp, setInp] = useState<Inputs>({
    ley: '73', fechaNac: '', edadRetiro: 65,
    semanas: 800, salarioDiario: 4, ingresoDes: 30000,
    mod40_umas: 15, mod40_anios: 5,
    mod10_umas: 12, mod10_anios: 5,
    ppr_mensual: 3000, afore_saldo: 150000, rendimiento: 6,
  })

  const upd = (k: keyof Inputs, v: number | string) => setInp(p => ({ ...p, [k]: v }))

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      Promise.all([
        supabase.from('perfiles_usuario').select('*').eq('id', session.user.id).single(),
        supabase.from('clientes').select('id,nombre').eq('asesor_id', session.user.id).order('nombre'),
      ]).then(([{ data: sv }, { data: cli }]) => {
        if (sv) setSys(p => ({ ...p, UMA_DIARIA: sv.uma_diaria ?? p.UMA_DIARIA, SALARIO_MIN: sv.salario_minimo ?? p.SALARIO_MIN, PMG_MENSUAL: sv.pmg_mensual ?? p.PMG_MENSUAL, RENDIMIENTO_DEFAULT: sv.rendimiento_afore_default ?? p.RENDIMIENTO_DEFAULT }))
        if (cli) setClientes(cli as Cliente[])
      })
    })
  }, [])

  const calcular = useCallback(() => {
    const edad = edadActual(inp.fechaNac)
    const anios = Math.max(0, inp.edadRetiro - (edad || 40))

    const p1 = inp.ley === '73' ? calcPensionLey73(inp.semanas, inp.salarioDiario, sys) : calcAfore(inp.afore_saldo, 0, inp.rendimiento, anios)
    const p2 = inp.ley === '73' ? calcPensionLey73(inp.semanas + inp.mod10_anios * 52, Math.max(inp.salarioDiario, inp.mod10_umas), sys) : calcAfore(inp.afore_saldo, 0, inp.rendimiento, anios)
    const p3 = inp.ley === '73' ? calcPensionLey73(inp.semanas + inp.mod40_anios * 52, Math.max(inp.salarioDiario, inp.mod40_umas), sys) : p1
    const pBase = inp.ley === '73' ? p3 : calcAfore(inp.afore_saldo, 0, inp.rendimiento, anios)
    const pPPR = calcAfore(0, inp.ppr_mensual, 8, anios)
    const p4 = pBase + pPPR

    const inv3 = inp.ley === '73' ? costoMod40(inp.mod40_umas, sys) : 0
    const inv4 = inv3 + inp.ppr_mensual

    const esc: Escenario[] = [
      { nombre: 'Sin acción', tag: 'e1', color: '#94a3b8', pension: p1, inversion: 0, brecha: Math.max(0, inp.ingresoDes - p1), recomendado: false },
      { nombre: inp.ley === '73' ? 'Modalidad 10' : 'AFORE actual', tag: 'e2', color: '#3b82f6', pension: p2, inversion: 0, brecha: Math.max(0, inp.ingresoDes - p2), recomendado: false },
      { nombre: inp.ley === '73' ? 'Modalidad 40' : 'AFORE optimizado', tag: 'e3', color: NARANJA, pension: p3, inversion: inv3, brecha: Math.max(0, inp.ingresoDes - p3), recomendado: false },
      { nombre: 'Combinada + PPR', tag: 'e4', color: VERDE, pension: p4, inversion: inv4, brecha: Math.max(0, inp.ingresoDes - p4), recomendado: false },
    ]

    const cubren = esc.filter(e => e.brecha === 0)
    const mejor = cubren.length > 0 ? cubren.reduce((a, b) => a.inversion <= b.inversion ? a : b) : [...esc].sort((a, b) => a.brecha - b.brecha)[0]
    mejor.recomendado = true

    setEscenarios(esc)
    setSaved(false)
  }, [inp, sys])

  useEffect(() => { calcular() }, [calcular])

  async function guardar() {
    if (!clienteId || escenarios.length === 0) return
    setSaving(true)
    const e = escenarios
    await supabase.from('diagnosticos').insert({
      asesor_id: userId, cliente_id: clienteId, ley: inp.ley,
      semanas: inp.semanas, salario_diario: inp.salarioDiario,
      edad_retiro: inp.edadRetiro, ingreso_deseado: inp.ingresoDes,
      afore_saldo: inp.afore_saldo, ppr_mensual: inp.ppr_mensual,
      rendimiento: inp.rendimiento,
      resultado_e1: e[0]?.pension, resultado_e2: e[1]?.pension,
      resultado_e3: e[2]?.pension, resultado_e4: e[3]?.pension,
      notas: notas || null,
    })
    setSaving(false)
    setSaved(true)
  }

  const edad = edadActual(inp.fechaNac)
  const aniosRetiro = Math.max(0, inp.edadRetiro - (edad || 40))
  const escAct = escenarios.find(e => e.tag === escSelected) ?? escenarios[0]

  const inputSt: React.CSSProperties = { width: '100%', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: AZUL, outline: 'none', boxSizing: 'border-box', background: 'white', fontFamily: 'inherit' }
  const labelSt: React.CSSProperties = { display: 'block', fontSize: '10px', color: AZUL, fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }
  const stepBadge = (n: number, color: string) => (
    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: color, color: 'white', fontSize: '11px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ color: AZUL, fontSize: '18px', fontWeight: '700', margin: 0 }}>🧮 Calculadora de Pensiones</h1>
          <p style={{ color: '#94a3b8', fontSize: '11px', margin: '2px 0 0' }}>Ley 73 · Ley 97 · Modalidad 10 · Modalidad 40 · Comparador 4 escenarios</p>
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8' }}>UMA ${sys.UMA_DIARIA} · SM ${sys.SALARIO_MIN} · PMG ${sys.PMG_MENSUAL.toLocaleString()}</div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Panel izquierdo — inputs */}
        <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid #e2e8f0', background: 'white', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Step 1 — Perfil */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              {stepBadge(1, AZUL)}
              <span style={{ fontSize: '11px', fontWeight: '700', color: AZUL, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Perfil del cliente</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={labelSt}>Régimen de pensión</label>
                <select value={inp.ley} onChange={e => upd('ley', e.target.value as '73' | '97')} style={inputSt}>
                  <option value="73">Ley 73 (antes jul/1997)</option>
                  <option value="97">Ley 97 / AFORE (después jul/1997)</option>
                </select>
              </div>
              <div>
                <label style={labelSt}>Fecha de nacimiento</label>
                <input type="date" value={inp.fechaNac} onChange={e => upd('fechaNac', e.target.value)} style={inputSt} />
                {inp.fechaNac && <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>Edad: <strong>{edad} años</strong> · Años para retiro: <strong>{aniosRetiro}</strong></p>}
              </div>
              <div>
                <label style={labelSt}>Edad de retiro</label>
                <input type="number" value={inp.edadRetiro} onChange={e => upd('edadRetiro', parseInt(e.target.value))} style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Ingreso deseado en retiro / mes</label>
                <input type="number" value={inp.ingresoDes} onChange={e => upd('ingresoDes', parseInt(e.target.value))} style={inputSt} />
                <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>{fmtMXN(inp.ingresoDes)}/mes</p>
              </div>
            </div>
          </div>

          {/* Step 2 — IMSS */}
          {inp.ley === '73' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                {stepBadge(2, NARANJA)}
                <span style={{ fontSize: '11px', fontWeight: '700', color: AZUL, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Situación IMSS · Ley 73</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={labelSt}>Semanas cotizadas</label>
                  <input type="number" value={inp.semanas} onChange={e => upd('semanas', parseInt(e.target.value))} style={inputSt} />
                  {inp.semanas < 500 && <p style={{ fontSize: '10px', color: '#ef4444', margin: '3px 0 0' }}>⚠️ Mínimo 500 semanas para pensión IMSS</p>}
                </div>
                <div>
                  <label style={labelSt}>Salario diario (veces SM)</label>
                  <input type="number" value={inp.salarioDiario} step={0.5} onChange={e => upd('salarioDiario', parseFloat(e.target.value))} style={inputSt} />
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>= {fmtMXN(inp.salarioDiario * sys.SALARIO_MIN)}/día</p>
                </div>
              </div>
            </div>
          )}

          {inp.ley === '97' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                {stepBadge(2, NARANJA)}
                <span style={{ fontSize: '11px', fontWeight: '700', color: AZUL, textTransform: 'uppercase', letterSpacing: '0.5px' }}>AFORE · Ley 97</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={labelSt}>Saldo AFORE actual</label>
                  <input type="number" value={inp.afore_saldo} onChange={e => upd('afore_saldo', parseInt(e.target.value))} style={inputSt} />
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>{fmtMXN(inp.afore_saldo)}</p>
                </div>
                <div>
                  <label style={labelSt}>Rendimiento anual (%)</label>
                  <input type="number" value={inp.rendimiento} step={0.5} onChange={e => upd('rendimiento', parseFloat(e.target.value))} style={inputSt} />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Estrategias */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              {stepBadge(3, VERDE)}
              <span style={{ fontSize: '11px', fontWeight: '700', color: AZUL, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Estrategias adicionales</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {inp.ley === '73' && (
                <>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px' }}>
                    <p style={{ fontSize: '10px', fontWeight: '700', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Modalidad 10</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div>
                        <label style={{ ...labelSt, color: '#1e40af' }}>Salario cotizable (UMAS)</label>
                        <input type="number" value={inp.mod10_umas} onChange={e => upd('mod10_umas', parseFloat(e.target.value))} style={inputSt} />
                      </div>
                      <div>
                        <label style={{ ...labelSt, color: '#1e40af' }}>Años de cotización</label>
                        <input type="number" value={inp.mod10_anios} onChange={e => upd('mod10_anios', parseInt(e.target.value))} style={inputSt} />
                      </div>
                    </div>
                  </div>
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px' }}>
                    <p style={{ fontSize: '10px', fontWeight: '700', color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Modalidad 40</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div>
                        <label style={{ ...labelSt, color: '#9a3412' }}>Salario cotizable (UMAS)</label>
                        <input type="number" value={inp.mod40_umas} onChange={e => upd('mod40_umas', parseFloat(e.target.value))} style={inputSt} />
                        <p style={{ fontSize: '10px', color: '#9a3412', margin: '3px 0 0' }}>Costo: {fmtMXN(costoMod40(inp.mod40_umas, sys))}/mes</p>
                      </div>
                      <div>
                        <label style={{ ...labelSt, color: '#9a3412' }}>Años de cotización</label>
                        <input type="number" value={inp.mod40_anios} onChange={e => upd('mod40_anios', parseInt(e.target.value))} style={inputSt} />
                      </div>
                    </div>
                  </div>
                </>
              )}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px' }}>
                <p style={{ fontSize: '10px', fontWeight: '700', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>PPR / Aportación adicional</p>
                <div>
                  <label style={{ ...labelSt, color: '#15803d' }}>Aportación mensual</label>
                  <input type="number" value={inp.ppr_mensual} onChange={e => upd('ppr_mensual', parseInt(e.target.value))} style={inputSt} />
                  <p style={{ fontSize: '10px', color: '#15803d', margin: '3px 0 0' }}>{fmtMXN(inp.ppr_mensual * 12)}/año · Rend. asumido: 8%</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Panel derecho — resultados */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* 4 escenarios */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {escenarios.map(esc => {
              const pct = Math.min(100, Math.round((esc.pension / inp.ingresoDes) * 100))
              const activo = escSelected === esc.tag
              return (
                <div key={esc.tag} onClick={() => setEscSelected(esc.tag)} style={{
                  borderRadius: '12px', padding: '16px', cursor: 'pointer', position: 'relative',
                  background: activo ? esc.color : 'white',
                  border: `2px solid ${activo ? esc.color : '#e2e8f0'}`,
                  boxShadow: activo ? `0 4px 20px ${esc.color}40` : '0 2px 6px rgba(0,0,0,0.04)',
                  transition: 'all 0.15s',
                }}>
                  {esc.recomendado && (
                    <div style={{ position: 'absolute', top: '-8px', right: '-8px', fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '12px', background: NARANJA, color: 'white' }}>⭐ MEJOR</div>
                  )}
                  <p style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px', color: activo ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>{esc.nombre}</p>
                  <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 4px', color: activo ? 'white' : esc.color }}>{fmtMXN(esc.pension)}</p>
                  <p style={{ fontSize: '10px', margin: '0 0 8px', color: activo ? 'rgba(255,255,255,0.6)' : '#94a3b8' }}>/mes en retiro</p>
                  <div style={{ height: '6px', borderRadius: '3px', overflow: 'hidden', background: activo ? 'rgba(255,255,255,0.2)' : '#e2e8f0', marginBottom: '6px' }}>
                    <div style={{ height: '100%', borderRadius: '3px', width: `${pct}%`, background: activo ? 'rgba(255,255,255,0.8)' : esc.color, transition: 'width 0.5s' }} />
                  </div>
                  <p style={{ fontSize: '10px', fontWeight: '700', margin: 0, color: activo ? 'rgba(255,255,255,0.8)' : esc.color }}>{pct}% de tu objetivo</p>
                  {esc.inversion > 0 && <p style={{ fontSize: '10px', margin: '4px 0 0', color: activo ? 'rgba(255,255,255,0.5)' : '#94a3b8' }}>Inversión: {fmtMXN(esc.inversion)}/mes</p>}
                </div>
              )
            })}
          </div>

          {/* Detalle escenario seleccionado */}
          {escAct && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '14px' }}>
              {/* Card detalle */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <span style={{ color: escAct.color, fontSize: '16px' }}>●</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: AZUL }}>Detalle — {escAct.nombre}</span>
                  {escAct.recomendado && <span style={{ marginLeft: 'auto', fontSize: '10px', background: NARANJA, color: 'white', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>Escenario recomendado</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  {[
                    { label: 'Pensión mensual estimada', value: fmtMXN(escAct.pension), color: escAct.color },
                    { label: 'Objetivo de retiro', value: fmtMXN(inp.ingresoDes), color: AZUL },
                    { label: 'Brecha mensual', value: escAct.brecha > 0 ? fmtMXN(escAct.brecha) : '✅ Cubierto', color: escAct.brecha > 0 ? '#ef4444' : VERDE },
                    { label: 'Inversión mensual', value: escAct.inversion > 0 ? fmtMXN(escAct.inversion) : 'Sin costo adicional', color: AZUL },
                  ].map(item => (
                    <div key={item.label} style={{ background: '#F4F6FB', borderRadius: '10px', padding: '12px' }}>
                      <p style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' }}>{item.label}</p>
                      <p style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: item.color }}>{item.value}</p>
                    </div>
                  ))}
                </div>
                {/* Barra cobertura */}
                <div style={{ background: '#F4F6FB', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: '600', color: AZUL }}>Cobertura del objetivo</span>
                    <span style={{ fontWeight: '700', color: escAct.color }}>{Math.min(100, Math.round((escAct.pension / inp.ingresoDes) * 100))}%</span>
                  </div>
                  <div style={{ height: '12px', borderRadius: '6px', overflow: 'hidden', background: 'white', border: '1px solid #e2e8f0' }}>
                    <div style={{ height: '100%', borderRadius: '6px', width: `${Math.min(100, (escAct.pension / inp.ingresoDes) * 100)}%`, background: `linear-gradient(90deg, ${escAct.color}, ${escAct.color}99)`, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                    <span>$0</span><span>{fmtMXN(inp.ingresoDes)}</span>
                  </div>
                </div>
              </div>

              {/* Variables del sistema */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: AZUL, margin: '0 0 12px' }}>Variables 2026</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { label: 'UMA diaria', value: `$${sys.UMA_DIARIA}` },
                    { label: 'Salario mínimo', value: `$${sys.SALARIO_MIN}` },
                    { label: 'PMG mensual', value: fmtMXN(sys.PMG_MENSUAL) },
                    { label: 'Mod 40 2026', value: `${sys.MOD40_PCT[2026]}%` },
                    { label: 'Mod 40 2027', value: `${sys.MOD40_PCT[2027]}%` },
                    { label: 'Mod 40 2028', value: `${sys.MOD40_PCT[2028]}%` },
                  ].map(v => (
                    <div key={v.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: '#64748b' }}>{v.label}</span>
                      <span style={{ fontWeight: '600', color: AZUL }}>{v.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 10px', fontSize: '10px', color: '#92400e' }}>
                  ⚠️ Cálculos orientativos. Rendimientos AFORE son proyecciones, no garantías.
                </div>
              </div>
            </div>
          )}

          {/* Tabla comparativa */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: AZUL, margin: 0 }}>Comparativo de los 4 escenarios</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: AZUL }}>
                    {['', 'E1 — Sin acción', 'E2 — Mod. 10', 'E3 — Mod. 40', 'E4 ⭐ Combinada + PPR'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Pensión mensual', fn: (e: Escenario) => fmtMXN(e.pension) },
                    { label: 'Inversión mensual', fn: (e: Escenario) => e.inversion > 0 ? fmtMXN(e.inversion) : '—' },
                    { label: 'Brecha vs objetivo', fn: (e: Escenario) => e.brecha > 0 ? fmtMXN(e.brecha) : '✅ Cubierto' },
                    { label: 'Cobertura', fn: (e: Escenario) => `${Math.min(100, Math.round((e.pension / inp.ingresoDes) * 100))}%` },
                  ].map((row, ri) => (
                    <tr key={row.label} style={{ background: ri % 2 === 0 ? 'white' : '#F8FAFC' }}>
                      <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: '600', color: AZUL }}>{row.label}</td>
                      {escenarios.map(esc => (
                        <td key={esc.tag} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: '700', color: escSelected === esc.tag ? esc.color : AZUL, background: escSelected === esc.tag ? `${esc.color}08` : undefined }}>
                          {row.fn(esc)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Guardar diagnóstico */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '18px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: AZUL, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '11px' }}>Guardar diagnóstico</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={labelSt}>Cliente</label>
                <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={inputSt}>
                  <option value="">— Seleccionar cliente —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Notas</label>
                <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones..." style={inputSt} />
              </div>
            </div>
            {!clienteId && <p style={{ fontSize: '11px', color: NARANJA, margin: '0 0 8px' }}>⚠️ Selecciona un cliente para guardar el diagnóstico</p>}
            <button onClick={guardar} disabled={saving || !clienteId || saved}
              style={{ width: '100%', padding: '10px', background: saved ? VERDE : (!clienteId ? '#94a3b8' : AZUL), color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: (!clienteId || saved) ? 'not-allowed' : 'pointer' }}>
              {saved ? '✓ Diagnóstico guardado' : saving ? 'Guardando...' : '💾 Guardar diagnóstico'}
            </button>
          </div>
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
