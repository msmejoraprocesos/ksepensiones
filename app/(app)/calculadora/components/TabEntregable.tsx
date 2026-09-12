'use client'
import React, { useState } from 'react'
import { K, nw, num } from '@/lib/design-tokens'

const AZUL = '#334E7B'
const VERDE = '#2E7D5A'
const NARANJA = '#E8724A'
const BORDE = '#E2E8F0'



const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
const fmtMXN2 = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

interface Props {
  // Data
  escenarios: any[]
  datos: any
  periodos: any[]
  sdiPromedio: number
  sys: any
  diagGuardadoId: string | null
  estatus: string
  pdfConfig?: any
  // Sofia output
  sofiaOutput: any
  setSofiaOutput: (v: any) => void
  generandoSofia: boolean
  setGenerandoSofia: (v: boolean) => void
  // Actions
  exportarPDF: (sofiaOutput?: any) => void
  guardarDiagnostico: (estatus: string) => Promise<void>
  // Identidad asesor (para la llamada)
  userId: string
  clienteId: string
}

export default function TabEntregable({
  escenarios, datos, periodos, sdiPromedio, sys, diagGuardadoId, estatus,
  pdfConfig, sofiaOutput, setSofiaOutput, generandoSofia, setGenerandoSofia,
  exportarPDF, guardarDiagnostico, userId, clienteId
}: Props) {
  const [subTab, setSubTab] = useState('generar' as 'generar' | 'revisar' | 'exportar')
  const [error, setError] = useState('')
  const [editandoTexto, setEditandoTexto] = useState(null as string | null)
  const listo = !!diagGuardadoId

  const escRec = escenarios.find(e => e.recomendado) ?? escenarios[escenarios.length - 1]
  const escBase = escenarios[0]
  const tieneEscenarios = escenarios.some(e => e.mod40_meses > 0)

  async function generarConSofia() {
    if (!tieneEscenarios) { setError('Completa los escenarios antes de generar'); return }
    setGenerandoSofia(true)
    setError('')
    try {
      const res = await fetch('/api/pdf-inteligente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asesor_id: userId,
          cliente_id: clienteId,
          datos,
          escenarios,
          periodos,
          sdiPromedio,
          sys,
          pdfConfig,
        }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error || 'Error al generar'); return }
      setSofiaOutput(data.sofiaOutput)
      setSubTab('revisar')
    } catch (e: any) {
      setError(e.message || 'Error de conexión')
    } finally {
      setGenerandoSofia(false)
    }
  }

  const updateBloqueTexto = (bloque: string, campo: string, valor: string) => {
    setSofiaOutput((prev: any) => ({
      ...prev,
      bloques: {
        ...prev?.bloques,
        [bloque]: { ...(prev?.bloques?.[bloque] || {}), [campo]: valor }
      }
    }))
  }

  const tabs = [
    { key: 'generar',  label: 'Generar con Sofía',  color: K.purple },
    { key: 'revisar',  label: 'Revisar y editar',   color: K.navy600 },
    { key: 'exportar', label: 'Exportar PDF',       color: K.green },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '2px', background: K.card, border: `1px solid ${K.line}`, padding: '3px', borderRadius: '11px' }}>
        {tabs.map((t, i) => (
          <button key={t.key} onClick={() => setSubTab(t.key as any)}
            style={{ flex: 1, padding: '11px 12px', border: 'none', borderRadius: '9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '15px', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
              background: subTab === t.key ? K.navy800 : 'transparent',
              color: subTab === t.key ? 'white' : K.muted, ...nw }}>
            <span style={{ width: 20, height: 20, borderRadius: 999, flexShrink: 0, fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: subTab === t.key ? t.color : 'transparent',
              border: subTab === t.key ? 'none' : `1.5px solid ${K.line}`,
              color: subTab === t.key ? 'white' : K.muted }}>{i + 1}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── GENERAR ── */}
      {subTab === 'generar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Estado del flujo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {[
              { label: 'Datos del cliente', ok: sdiPromedio > 0, val: sdiPromedio > 0 ? `SDI ${fmtMXN2(sdiPromedio)}` : 'Pendiente' },
              { label: 'Escenarios', ok: tieneEscenarios, val: tieneEscenarios ? `${escenarios.filter(e => e.mod40_meses > 0).length} escenario(s)` : 'Pendiente' },
              { label: 'Sofía IA', ok: !!sofiaOutput, val: sofiaOutput ? 'Listo para revisar' : 'Sin generar' },
            ].map((item, i) => (
              <div key={i} style={{ padding: '16px 18px', background: K.card, border: `1px solid ${item.ok ? K.green + '44' : K.line}`, borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ width: 26, height: 26, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: item.ok ? K.green : K.paper, color: item.ok ? 'white' : K.muted, fontSize: 13, fontWeight: 700 }}>
                  {item.ok ? '✓' : String(i + 1)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: K.muted }}>{item.label}</div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: item.ok ? K.ink : K.muted, ...nw }}>{item.val}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Hero de generación */}
          <div style={{ background: K.card, borderRadius: '14px', border: `1px solid ${K.line}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(19,33,53,0.06)' }}>
            <div style={{ background: `linear-gradient(118deg, ${K.navy900} 0%, ${K.purple} 130%)`, padding: '26px 28px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'white', marginBottom: '6px', letterSpacing: '-.015em' }}>
                Diagnóstico completo con Sofía
              </div>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,.72)', margin: 0, lineHeight: 1.6 }}>
                Una sola llamada llena todo el PDF: análisis de situación, interpretación de cada gráfica,
                comparativa de escenarios y próximos pasos — personalizado para {datos.nombre_trabajador || 'el cliente'}.
              </p>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* Qué va a generar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  'Narrativa personalizada por sección',
                  'Interpretación de cada gráfica',
                  'Justificación del escenario recomendado',
                  'Próximos pasos específicos para el cliente',
                ].map((texto, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '14px 16px', background: K.paper, borderRadius: '10px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: K.purple, flexShrink: 0 }} />
                    <span style={{ fontSize: '15px', color: K.ink }}>{texto}</span>
                  </div>
                ))}
              </div>

              {/* Costo */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '14px 16px', background: K.purpleSoft, borderRadius: '10px' }}>
                <span style={{ fontSize: '15px', color: K.ink }}>Costo estimado por diagnóstico</span>
                <span style={{ fontSize: '17px', fontWeight: 700, color: K.purple, ...nw, ...num }}>~$0.015 USD · ~3,500 tokens</span>
              </div>

              {error && (
                <div style={{ padding: '14px 16px', background: K.redSoft, border: `1px solid ${K.red}33`, borderRadius: '10px', fontSize: '15px', color: K.red, lineHeight: 1.55 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={generarConSofia} disabled={generandoSofia || !tieneEscenarios}
                  style={{ flex: 1, padding: '15px 22px', background: !tieneEscenarios ? K.line : K.purple, color: !tieneEscenarios ? K.muted : 'white', border: 'none', borderRadius: '11px', fontSize: '17px', fontWeight: 700, cursor: generandoSofia || !tieneEscenarios ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', boxShadow: !tieneEscenarios ? 'none' : '0 3px 12px rgba(109,59,212,.3)' }}>
                  {generandoSofia ? (
                    <>Sofía está generando el diagnóstico…</>
                  ) : (
                    <>Generar diagnóstico completo con Sofía</>
                  )}
                </button>
              </div>

              {sofiaOutput && (
                <button onClick={() => setSubTab('revisar')}
                  style={{ padding: '13px 18px', background: K.greenSoft, color: K.green, border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Ya tienes un análisis generado — ver y editar →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── REVISAR Y EDITAR ── */}
      {subTab === 'revisar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!sofiaOutput ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8' }}>
              <p style={{ fontSize: '15px', margin: 0 }}>Primero genera el análisis con Sofía</p>
              <button onClick={() => setSubTab('generar')} style={{ marginTop: '14px', padding: '12px 22px', background: K.purple, color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: 600, fontFamily: 'inherit' }}>
                Ir a generar →
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: K.ink, margin: 0 }}>Revisión del análisis</p>
                  <p style={{ fontSize: '13px', color: K.muted, margin: '4px 0 0' }}>Toca cualquier texto para editarlo antes de exportar</p>
                </div>
                <button onClick={generarConSofia} disabled={generandoSofia}
                  style={{ padding: '10px 16px', background: K.purpleSoft, color: K.purple, border: 'none', borderRadius: '9px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', ...nw }}>
                  Regenerar con Sofía
                </button>
              </div>

              {/* Apertura */}
              {sofiaOutput.apertura !== undefined && (
                <EditableBlock
                  label="Apertura del diagnóstico"
                  valor={sofiaOutput.apertura || ''}
                  onChange={v => setSofiaOutput((p: any) => ({ ...p, apertura: v }))}
                  color="#7C3AED"
                />
              )}

              {/* Bloques */}
              {Object.entries(sofiaOutput.bloques || {}).map(([key, val]: [string, any]) => (
                <div key={key}>
                  {key === 'proximos_pasos' ? (
                    <div style={{ background: 'white', borderRadius: '10px', border: `1px solid ${BORDE}`, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 18px', background: K.card, borderBottom: `1px solid ${K.line}`, fontSize: '17px', fontWeight: 700, color: K.ink }}>
                        Próximos pasos
                      </div>
                      <div style={{ padding: '12px' }}>
                        {val.texto !== undefined && (
                          <EditableBlock label="Introducción" valor={val.texto || ''} onChange={v => updateBloqueTexto(key, 'texto', v)} color={VERDE} compact />
                        )}
                        {(val.pasos || []).map((paso: string, i: number) => (
                          <EditableBlock key={i} label={`Paso ${i + 1}`} valor={paso} onChange={v => {
                            const newPasos = [...(val.pasos || [])]
                            newPasos[i] = v
                            setSofiaOutput((p: any) => ({ ...p, bloques: { ...p.bloques, proximos_pasos: { ...val, pasos: newPasos } } }))
                          }} color={VERDE} compact />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: 'white', borderRadius: '10px', border: `1px solid ${BORDE}`, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 18px', background: K.card, borderBottom: `1px solid ${K.line}`, fontSize: '17px', fontWeight: 700, color: K.ink }}>
                        {labelBloque(key)}
                      </div>
                      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {typeof val === 'object' && val !== null && Object.entries(val).map(([campo, texto]: [string, any]) => (
                          <EditableBlock key={campo} label={labelCampo(campo)} valor={texto || ''} onChange={v => updateBloqueTexto(key, campo, v)} color={AZUL} compact />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Recomendación final */}
              {sofiaOutput.recomendacion_final !== undefined && (
                <EditableBlock
                  label="Recomendación final"
                  valor={sofiaOutput.recomendacion_final || ''}
                  onChange={v => setSofiaOutput((p: any) => ({ ...p, recomendacion_final: v }))}
                  color={VERDE}
                />
              )}

              <button onClick={() => setSubTab('exportar')}
                style={{ padding: '10px 22px', background: AZUL, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', fontFamily: 'inherit', alignSelf: 'flex-end' }}>
                Continuar a exportar →
              </button>
            </>
          )}
        </div>
      )}

      {/* ── EXPORTAR ── */}
      {subTab === 'exportar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Resumen ejecutivo compacto */}
          {escRec && (
            <section style={{ position: 'relative', overflow: 'hidden', borderRadius: '18px', background: 'linear-gradient(118deg, #0D2440 0%, #14375F 60%, #245287 100%)' }}>
              <div style={{ position: 'absolute', width: 420, height: 420, right: -150, top: -180, borderRadius: 999, pointerEvents: 'none', background: 'radial-gradient(circle, #E8622C33 0%, transparent 68%)' }} />
              <div style={{ position: 'relative', padding: '26px 32px 20px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', margin: 0 }}>
                  LO QUE VA EN EL DIAGNÓSTICO
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap', marginTop: '8px' }}>
                  <p style={{ fontSize: 'clamp(36px, 4.4vw, 56px)', fontWeight: 800, color: 'white', margin: 0, lineHeight: 1, letterSpacing: '-.035em', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtMXN(escRec.pension_mensual)}
                  </p>
                  <span style={{ background: '#12855C', color: 'white', fontSize: '17px', fontWeight: 700, padding: '9px 16px', borderRadius: 999, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    +{fmtMXN(escRec.pension_mensual - (escBase?.pension_mensual || 0))} cada mes
                  </span>
                </div>
              </div>
              <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1px', background: 'rgba(255,255,255,.11)' }}>
                {[
                  { label: 'Pensión actual', value: fmtMXN(escBase?.pension_mensual || 0), sub: 'sin Modalidad 40', color: 'rgba(255,255,255,.72)' },
                  { label: 'Pensión con Mod. 40', value: fmtMXN(escRec.pension_mensual), sub: 'de por vida', color: '#1FA873' },
                  { label: 'Inversión neta', value: fmtMXN(escRec.inversion_neta || 0), sub: 'descontando AFORE', color: '#F2B544' },
                ].map((k, i) => (
                  <div key={i} style={{ background: '#0D2440', padding: '18px 24px' }}>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.56)', margin: 0 }}>{k.label}</p>
                    <p style={{ fontSize: '23px', fontWeight: 700, color: k.color, margin: '3px 0 0', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{k.value}</p>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.44)', margin: '2px 0 0' }}>{k.sub}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Panel de exportación */}
          <div style={{ background: listo ? '#F0FDF4' : '#F9FAFB', border: `2px solid ${listo ? '#86EFAC' : BORDE}`, padding: '20px', borderRadius: '12px' }}>
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '14px', fontWeight: '700', color: listo ? '#065F46' : '#6B7280', margin: '0 0 4px' }}>
                {listo
                  ? sofiaOutput ? '✓ Diagnóstico con IA listo para exportar' : '✓ Diagnóstico listo (sin análisis de IA)'
                  : '⏳ Guarda el diagnóstico antes de exportar'}
              </p>
              <p style={{ fontSize: '15px', color: K.muted, margin: 0 }}>
                {sofiaOutput
                  ? 'El PDF incluirá gráficas + tablas + análisis completo de Sofía IA'
                  : 'El PDF incluirá gráficas y tablas sin análisis narrativo'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => exportarPDF(sofiaOutput)} disabled={!listo}
                style={{ flex: 1, padding: '14px 18px', background: K.card, color: listo ? K.ink : K.muted, border: `1px solid ${K.line}`, borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: listo ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                📄 Borrador
              </button>
              <button onClick={async () => { await guardarDiagnostico('autorizado'); exportarPDF(sofiaOutput) }} disabled={!listo}
                style={{ flex: 2, padding: '10px 20px', background: listo ? VERDE : '#D1D5DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: listo ? 'pointer' : 'not-allowed', fontFamily: 'inherit', boxShadow: listo ? '0 2px 8px rgba(46,125,90,0.3)' : 'none' }}>
                ✅ Autorizar y exportar PDF
              </button>
            </div>
            {estatus === 'autorizado' && (
              <p style={{ fontSize: '15px', color: K.green, margin: '12px 0 0', fontWeight: 600 }}>Este diagnóstico ya está autorizado</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente de campo editable ──────────────────────────────────────────────
function EditableBlock({ label, valor, onChange, color, compact }: {
  label: string; valor: string; onChange: (v: string) => void; color: string; compact?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(valor)

  if (editing) return (
    <div style={{ marginBottom: compact ? '6px' : '0' }}>
      <label style={{ fontSize: '15px', fontWeight: 500, color: K.muted, display: 'block', marginBottom: '6px' }}>{label}</label>
      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={compact ? 2 : 3} autoFocus
        style={{ width: '100%', border: `1px solid ${K.line}`, borderRadius: '10px', padding: '12px 14px', fontSize: '15px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6, color: K.ink }} />
      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
        <button onClick={() => { onChange(draft); setEditing(false) }} style={{ padding: '9px 18px', background: K.navy800, color: 'white', border: 'none', borderRadius: '9px', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Guardar</button>
        <button onClick={() => { setDraft(valor); setEditing(false) }} style={{ padding: '9px 16px', background: 'transparent', color: K.muted, border: `1px solid ${K.line}`, borderRadius: '9px', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
      </div>
    </div>
  )

  return (
    <div onClick={() => { setDraft(valor); setEditing(true) }}
      style={{ cursor: 'pointer', padding: compact ? '6px 8px' : '10px 12px', background: '#FAFAFA', border: `1px solid ${BORDE}`, borderLeft: `3px solid ${color}33`, borderRadius: '6px', marginBottom: compact ? '4px' : '0' }}>
      <div style={{ fontSize: '13px', fontWeight: 500, color: K.muted, marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span><span style={{ color: color, opacity: 0.6 }}>✏️ Editar</span>
      </div>
      <p style={{ fontSize: '15px', color: K.ink, margin: 0, lineHeight: 1.65 }}>{valor || <em style={{ color: K.muted }}>Sin contenido</em>}</p>
    </div>
  )
}

function labelBloque(key: string): string {
  const map: Record<string, string> = {
    situacion: 'Situación actual',
    sin_mod40: 'Pensión sin Mod. 40',
    con_mod40: 'Con Modalidad 40',
    gauge: 'Termómetro de recuperación',
    timeline: 'Cronograma',
    area_flujos: 'Flujos a 80 años',
    comparativa: 'Comparativa de escenarios',
    cuantias: 'Desglose de cuantías',
    sdi: 'Historial SDI',
    financiamiento: 'Financiamiento',
  }
  return map[key] || key
}

function labelCampo(campo: string): string {
  const map: Record<string, string> = {
    texto: 'Texto', texto_antes: 'Texto antes', texto_despues: 'Texto después',
    calificacion_narrativa: 'Calificación narrativa', urgencia: 'Urgencia',
  }
  return map[campo] || campo
}
