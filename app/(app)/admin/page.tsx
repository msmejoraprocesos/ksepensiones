'use client'
/**
 * /admin/formulas — KSE Pensiones
 * ════════════════════════════════════════════════════════════════════
 * Página exclusiva del administrador para ver y ajustar las constantes
 * configurables del sistema pensional.
 *
 * Constantes FIJAS (solo cambian con la ley) → solo lectura
 * Constantes CONFIGURABLES (UMA, PMG, tasas Mod40) → editables
 *
 * Todo lo que aquí se edita se guarda en la tabla `configuracion_sistema`
 * de Supabase y es leída por la calculadora en tiempo real.
 * ════════════════════════════════════════════════════════════════════
 */

import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import {
  TABLA_CUANTIA_UMA, FACTOR_EDAD_RETIRO, ASIGNACIONES,
  SEMANAS_MINIMAS_PENSION, DIAS_AGUINALDO, MAX_MESES_RETROACTIVO,
  TASA_ACTUALIZACION_MENSUAL, TASA_ACTUALIZACION_DEFAULT,
  TASA_RECARGO_MENSUAL, TASAS_MOD40_POR_ANIO, TASA_MOD40_TECHO,
  PCT_RECUPERACION_AFORE_DEFAULT, EDAD_ANALISIS_FLUJOS,
  FACTOR_ACTUALIZACION_UMA, fmtMXN, fmtPct
} from '@/app/utils/formulas'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F05B21'

function AdminFormulasInner() {
  const supabase = createClient()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Valores configurables (se cargan de Supabase)
  const [uma, setUma] = useState(117.31)
  const [salMin, setSalMin] = useState(315.04)
  const [pmgL73, setPmgL73] = useState(10636.54)
  const [pmgL97, setPmgL97] = useState(4345.72)
  const [pctAfore, setPctAfore] = useState(20)
  const [rendDefault, setRendDefault] = useState(6)
  const [tasasMod40, setTasasMod40] = useState<Record<number, number>>({ ...TASAS_MOD40_POR_ANIO })
  const [activeTab, setActiveTab] = useState<'configurables' | 'legales'>('configurables')

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      // Verificar rol admin en perfiles_usuario
      const { data: perfil } = await supabase
        .from('perfiles_usuario')
        .select('is_admin')
        .eq('id', session.user.id)
        .single()
      if (!perfil?.is_admin) { setIsAdmin(false); return }
      setIsAdmin(true)
      // Cargar valores desde configuracion_sistema
      const { data: conf } = await supabase
        .from('configuracion_sistema')
        .select('*')
        .limit(1)
        .single()
      if (conf) {
        if (conf.UMA_DIARIA) setUma(conf.UMA_DIARIA)
        if (conf.SALARIO_MIN) setSalMin(conf.SALARIO_MIN)
        if (conf.PMG_L73) setPmgL73(conf.PMG_L73)
        if (conf.PMG_L97) setPmgL97(conf.PMG_L97)
        if (conf.pct_afore_mod40) setPctAfore(conf.pct_afore_mod40)
        if (conf.RENDIMIENTO_DEFAULT) setRendDefault(conf.RENDIMIENTO_DEFAULT)
        const t: Record<number, number> = { ...TASAS_MOD40_POR_ANIO }
        for (let y = 2026; y <= 2030; y++) {
          const k = `mod40_${y}`
          if (conf[k]) t[y] = conf[k]
        }
        setTasasMod40(t)
      }
    }
    init()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const payload: Record<string, number> = {
      UMA_DIARIA: uma, SALARIO_MIN: salMin,
      PMG_L73: pmgL73, PMG_L97: pmgL97,
      pct_afore_mod40: pctAfore, RENDIMIENTO_DEFAULT: rendDefault,
    }
    for (let y = 2026; y <= 2030; y++) payload[`mod40_${y}`] = tasasMod40[y] ?? TASAS_MOD40_POR_ANIO[y]
    await supabase.from('configuracion_sistema').upsert({ id: 1, ...payload })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const sectionTitle = (t: string, sub: string) => (
    <div style={{ marginBottom: '14px' }}>
      <p style={{ fontSize: '13px', fontWeight: '800', color: AZUL, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t}</p>
      <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0' }}>{sub}</p>
    </div>
  )

  const fieldRow = (label: string, legal: string, excel: string, value: React.ReactNode, editable = false) => (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: '#374151', width: '220px' }}>{label}</td>
      <td style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>{legal}</td>
      <td style={{ padding: '10px 12px', fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{excel}</td>
      <td style={{ padding: '10px 12px' }}>{value}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center' as const }}>
        {editable
          ? <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontWeight: '700' }}>EDITABLE</span>
          : <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: '#f0fdf4', color: '#166534', fontWeight: '700' }}>FIJO POR LEY</span>
        }
      </td>
    </tr>
  )

  const numInput = (val: number, onChange: (v: number) => void, step = 0.01) => (
    <input
      type="number" step={step} value={val}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={{ width: '110px', padding: '4px 8px', border: '1.5px solid #f59e0b', borderRadius: '6px', fontSize: '12px', fontWeight: '700', color: '#374151', background: '#fffbeb' }}
    />
  )

  if (isAdmin === null) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>Verificando acceso...</div>

  if (isAdmin === false) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px' }}>
      <div style={{ fontSize: '40px' }}>🔒</div>
      <p style={{ fontSize: '16px', fontWeight: '700', color: '#374151' }}>Acceso restringido</p>
      <p style={{ fontSize: '13px', color: '#94a3b8' }}>Esta página solo es accesible para administradores del sistema.</p>
      <button onClick={() => router.back()} style={{ padding: '8px 20px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>← Regresar</button>
    </div>
  )

  return (
    <div style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: '800', color: AZUL, margin: 0 }}>⚙️ Fórmulas y Constantes del Sistema</h1>
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>
            Las constantes marcadas como <strong>FIJO POR LEY</strong> solo se modifican si cambia la Ley del Seguro Social 1973.<br/>
            Las marcadas como <strong>EDITABLE</strong> se actualizan cada año (UMA, PMG, tasas IMSS).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => router.back()} style={{ padding: '8px 16px', background: 'white', color: '#374151', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
            ← Regresar
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', background: saved ? VERDE : NARANJA, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#f1f5f9', borderRadius: '8px', padding: '4px' }}>
        {(['configurables', 'legales'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', background: activeTab === t ? 'white' : 'transparent', color: activeTab === t ? AZUL : '#64748b', boxShadow: activeTab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
            {t === 'configurables' ? '📝 Parámetros editables (actualización anual)' : '⚖️ Constantes legales (solo cambian con la ley)'}
          </button>
        ))}
      </div>

      {/* Tabla de parámetros editables */}
      {activeTab === 'configurables' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
            {sectionTitle('Valores CONASAMI / IMSS — actualizar cada enero/febrero', 'Fuente: DOF (Diario Oficial de la Federación)')}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['Campo', 'Fundamento', 'Celda Excel', 'Valor actual', 'Tipo'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fieldRow('UMA Diaria', 'CONASAMI — actualiza cada febrero', 'SAL. PROM MOD 40!E16', numInput(uma, setUma, 0.01), true)}
                {fieldRow('Salario Mínimo Diario', 'CONASAMI — actualiza cada enero', 'COSTO MOD. 40 (referencia)', numInput(salMin, setSalMin, 0.01), true)}
                {fieldRow('PMG Ley 73 (mensual)', 'IMSS — Pensión Mínima Garantizada Ley 73', 'PENSION MOD. 40!D18', numInput(pmgL73, setPmgL73, 1), true)}
                {fieldRow('PMG Ley 97 (mensual)', 'CONSAR — Pensión Garantizada Ley 97', 'Configuración', numInput(pmgL97, setPmgL97, 1), true)}
                {fieldRow('% Recuperación AFORE', 'Estimado de mercado (~20% va a subcuenta Retiro 97)', 'COSTO MOD. 40!G17', numInput(pctAfore, setPctAfore, 0.1), true)}
                {fieldRow('Rendimiento AFORE %', 'Estimado para proyecciones de Ley 97', 'Configuración', numInput(rendDefault, setRendDefault, 0.1), true)}
              </tbody>
            </table>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
            {sectionTitle('Tasas de cotización Modalidad 40 — por año', 'Fuente: IMSS — sube ~1.091% anual hasta llegar al techo de 18.8% en 2030. Excel: COSTO MOD. 40!D4-D14')}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Año', 'Tasa %', 'Costo mensual (25 UMAs)', 'Tipo'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => {
                    const tasa = tasasMod40[y] ?? TASAS_MOD40_POR_ANIO[y]
                    const costoEjemplo = 25 * uma * (tasa / 100) * 365 / 12
                    const editable = y >= 2026
                    return (
                      <tr key={y} style={{ borderBottom: '1px solid #f1f5f9', background: y === new Date().getFullYear() ? '#f0f9ff' : 'white' }}>
                        <td style={{ padding: '8px 12px', fontWeight: '700', color: y === new Date().getFullYear() ? AZUL : '#374151' }}>{y} {y === new Date().getFullYear() && '← actual'}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {editable
                            ? numInput(tasa, v => setTasasMod40(prev => ({ ...prev, [y]: v })), 0.001)
                            : <span style={{ fontWeight: '700', color: '#374151' }}>{tasa.toFixed(3)}%</span>
                          }
                        </td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{fmtMXN(costoEjemplo)}/mes</td>
                        <td style={{ padding: '8px 12px' }}>
                          {editable
                            ? <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontWeight: '700' }}>EDITABLE</span>
                            : <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: '#f0fdf4', color: '#166534', fontWeight: '700' }}>HISTÓRICO</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: '700', color: '#64748b' }}>2031+</td>
                    <td style={{ padding: '8px 12px', fontWeight: '700', color: '#374151' }}>{TASA_MOD40_TECHO}% (techo)</td>
                    <td colSpan={2} style={{ padding: '8px 12px', fontSize: '11px', color: '#94a3b8' }}>Tasa máxima establecida por ley — no cambia</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de constantes legales (solo lectura) */}
      {activeTab === 'legales' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
            {sectionTitle('Parámetros generales — Art. 162-183 LSS 1973', 'Solo se modifican si cambia la ley. Para cambiarlos, editar formulas.ts')}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['Campo', 'Fundamento legal', 'Celda Excel', 'Valor', ''].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fieldRow('Semanas mínimas para pensión', 'Art. 162 LSS 1973', 'Implícito en DATOS GEN.', <span style={{ fontWeight: '700' }}>{SEMANAS_MINIMAS_PENSION} semanas</span>)}
                {fieldRow('Días de aguinaldo', 'Art. 171 LSS 1973', 'PENSIÓN ACTUAL!A25', <span style={{ fontWeight: '700' }}>{DIAS_AGUINALDO} días</span>)}
                {fieldRow('Máximo retroactivo Mod40', 'Reglamento IMSS / criterio validado', 'PAGO RETROACTIVO', <span style={{ fontWeight: '700' }}>{MAX_MESES_RETROACTIVO} meses (5 años)</span>)}
                {fieldRow('Factor de actualización UMA', 'Metodología del Excel de referencia', 'PENSIÓN ACTUAL!×1.11', <span style={{ fontWeight: '700' }}>×{FACTOR_ACTUALIZACION_UMA}</span>)}
                {fieldRow('Techo tasa Mod40', 'IMSS — a partir de 2031', 'COSTO MOD. 40!D14', <span style={{ fontWeight: '700' }}>{TASA_MOD40_TECHO}%</span>)}
                {fieldRow('Edad de análisis de flujos', 'Estándar de industria', 'INVERSION!D46/F46', <span style={{ fontWeight: '700' }}>{EDAD_ANALISIS_FLUJOS} años</span>)}
                {fieldRow('Tasa actualización default', 'Estimado conservador (post-2024)', 'PAGO RETROACTIVO', <span style={{ fontWeight: '700' }}>{(TASA_ACTUALIZACION_DEFAULT * 100).toFixed(2)}% mensual</span>)}
              </tbody>
            </table>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
            {sectionTitle('Factores de edad — Art. 167 LSS 1973', 'El 100% de vejez se otorga a los 65 años. Se reduce 5% por cada año antes, con mínimo a los 60 (75%). Excel: DATOS GEN.!E27-E32')}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(FACTOR_EDAD_RETIRO).filter(([edad]) => parseInt(edad) <= 65).map(([edad, factor]) => (
                <div key={edad} style={{ padding: '10px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Edad {edad}</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: AZUL }}>{(factor * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
            {sectionTitle('Asignaciones familiares — Art. 164-165 LSS 1973', 'Se aplican sobre la cuantía total cruda (antes del factor de edad). Art. 164: cónyuge + hijos + padres. Art. 165: ayuda asistencial si no hay ningún beneficiario.')}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { label: 'Cónyuge', pct: ASIGNACIONES.CONYUGE * 100, legal: 'Art. 164 fracc. I' },
                { label: 'Por hijo', pct: ASIGNACIONES.HIJO * 100, legal: 'Art. 164 fracc. II (máx. 2 con cónyuge, 3 sin)' },
                { label: 'Por padre dep.', pct: ASIGNACIONES.PADRE * 100, legal: 'Art. 164 fracc. III (solo sin cónyuge ni hijos)' },
                { label: 'Ayuda asistencial (sin nadie)', pct: ASIGNACIONES.AYUDA_ASISTENCIAL_SIN_NADIE * 100, legal: 'Art. 165 LSS' },
                { label: 'Ayuda asistencial (solo padres)', pct: ASIGNACIONES.AYUDA_ASISTENCIAL_SOLO_PADRES * 100, legal: 'Art. 165 LSS' },
              ].map(a => (
                <div key={a.label} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', minWidth: '150px' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>{a.label}</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: VERDE }}>{a.pct.toFixed(0)}%</div>
                  <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>{a.legal}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
            {sectionTitle('Tabla de cuantía básica por veces UMA — Art. 167 LSS 1973', '22 rangos de salario relativo (SDI / UMA diaria). A menor salario → mayor % de cuantía. Excel: hoja de cálculo implícita en PENSIÓN ACTUAL y PENSION MOD. 40')}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['Rango (veces UMA)', 'Cuantía básica %', 'Incremento anual %', 'Nota'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TABLA_CUANTIA_UMA.map((fila, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#f8fafc' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>
                        {fila.min === 0 ? '0' : fila.min.toFixed(2)} – {fila.max === Infinity ? '∞' : fila.max.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 10px', fontWeight: '700', color: AZUL }}>{(fila.basica * 100).toFixed(2)}%</td>
                      <td style={{ padding: '6px 10px', fontWeight: '700', color: VERDE }}>{(fila.incremento * 100).toFixed(4)}%</td>
                      <td style={{ padding: '6px 10px', color: '#94a3b8', fontSize: '10px' }}>
                        {i === 0 ? 'Salario ≤ UMA' : i === TABLA_CUANTIA_UMA.length - 1 ? 'Salario > 6 UMAs' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminFormulasPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>Cargando...</div>}>
      <AdminFormulasInner />
    </Suspense>
  )
}
