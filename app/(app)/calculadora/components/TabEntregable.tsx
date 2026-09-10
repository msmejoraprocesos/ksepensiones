'use client'
import React, { useState } from 'react'

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
    { key: 'generar',  label: '✨ Generar con Sofía',  color: '#7C3AED', bg: '#F5F3FF' },
    { key: 'revisar',  label: '✏️ Revisar y editar',    color: AZUL,       bg: '#EEF2F8' },
    { key: 'exportar', label: '✅ Exportar PDF',         color: VERDE,      bg: '#F0F7F4' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '6px', background: '#F4F6F9', padding: '6px', borderRadius: '10px' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key as any)}
            style={{ flex: 1, padding: '9px 12px', border: 'none', borderRadius: '7px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: '600',
              background: subTab === t.key ? t.bg : 'white',
              color: subTab === t.key ? t.color : '#94A3B8',
              borderBottom: subTab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
            }}>
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
              <div key={i} style={{ padding: '10px 12px', background: item.ok ? '#F0FDF4' : '#F8FAFC', border: `1px solid ${item.ok ? '#86EFAC' : BORDE}`, borderRadius: '8px' }}>
                <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: '600' }}>{item.label}</div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: item.ok ? VERDE : '#9CA3AF' }}>
                  {item.ok ? '✓ ' : '○ '}{item.val}
                </div>
              </div>
            ))}
          </div>

          {/* Hero de generación */}
          <div style={{ background: 'white', borderRadius: '12px', border: `1px solid ${BORDE}`, overflow: 'hidden' }}>
            <div style={{ background: '#7C3AED', padding: '20px 24px' }}>
              <div style={{ fontSize: '18px', fontWeight: '800', color: 'white', marginBottom: '4px' }}>
                Diagnóstico completo con Sofía IA
              </div>
              <p style={{ fontSize: '12px', color: '#DDD6FE', margin: 0, lineHeight: 1.5 }}>
                Una sola llamada llena todo el PDF: análisis de situación, interpretación de cada gráfica,
                comparativa de escenarios y próximos pasos — personalizado para {datos.nombre_trabajador || 'el cliente'}.
              </p>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* Qué va a generar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { icon: '📝', text: 'Narrativa personalizada por sección' },
                  { icon: '📊', text: 'Interpretación de cada gráfica' },
                  { icon: '⭐', text: 'Justificación del escenario recomendado' },
                  { icon: '🎯', text: 'Próximos pasos específicos para el cliente' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#F8FAFC', borderRadius: '6px' }}>
                    <span style={{ fontSize: '16px' }}>{item.icon}</span>
                    <span style={{ fontSize: '11px', color: '#374151' }}>{item.text}</span>
                  </div>
                ))}
              </div>

              {/* Costo */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#F5F3FF', borderRadius: '6px', border: '1px solid #DDD6FE' }}>
                <span style={{ fontSize: '11px', color: '#64748B' }}>Costo estimado por diagnóstico</span>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#7C3AED' }}>~$0.015 USD · ~3,500 tokens</span>
              </div>

              {error && (
                <div style={{ padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', fontSize: '12px', color: '#B91C1C' }}>
                  ⚠ {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={generarConSofia} disabled={generandoSofia || !tieneEscenarios}
                  style={{ flex: 1, padding: '12px 20px', background: generandoSofia ? '#8B5CF6' : '#7C3AED', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: generandoSofia || !tieneEscenarios ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  {generandoSofia ? (
                    <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> Sofía está generando el diagnóstico...</>
                  ) : (
                    <>✨ Generar diagnóstico completo con Sofía</>
                  )}
                </button>
              </div>

              {sofiaOutput && (
                <button onClick={() => setSubTab('revisar')}
                  style={{ padding: '8px 16px', background: '#F0FDF4', color: VERDE, border: '1px solid #86EFAC', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✓ Ya tienes un análisis generado — Ver y editar →
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
              <p style={{ fontSize: '14px', margin: 0 }}>Primero genera el análisis con Sofía IA</p>
              <button onClick={() => setSubTab('generar')} style={{ marginTop: '12px', padding: '8px 20px', background: '#7C3AED', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>
                Ir a generar →
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#111827', margin: 0 }}>Revisión del análisis de Sofía</p>
                  <p style={{ fontSize: '11px', color: '#94A3B8', margin: '2px 0 0' }}>Haz clic en cualquier texto para editarlo antes de exportar</p>
                </div>
                <button onClick={generarConSofia} disabled={generandoSofia}
                  style={{ padding: '7px 14px', background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE', borderRadius: '7px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                  ↻ Regenerar con Sofía
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
                      <div style={{ padding: '8px 12px', background: '#F0F7F4', borderBottom: `1px solid ${BORDE}`, fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: VERDE }}>
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
                      <div style={{ padding: '8px 12px', background: '#EEF2F8', borderBottom: `1px solid ${BORDE}`, fontSize: '10px', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: AZUL }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { label: 'Pensión actual', value: fmtMXN(escBase?.pension_mensual || 0), color: '#DC2626' },
                { label: 'Pensión con Mod.40', value: fmtMXN(escRec.pension_mensual), color: VERDE },
                { label: 'Mejora mensual', value: '+' + fmtMXN(escRec.pension_mensual - (escBase?.pension_mensual || 0)), color: AZUL },
              ].map((k, i) => (
                <div key={i} style={{ background: 'white', border: `1px solid ${BORDE}`, borderTop: `3px solid ${k.color}`, padding: '10px 14px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: '600' }}>{k.label}</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Panel de exportación */}
          <div style={{ background: listo ? '#F0FDF4' : '#F9FAFB', border: `2px solid ${listo ? '#86EFAC' : BORDE}`, padding: '20px', borderRadius: '12px' }}>
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '14px', fontWeight: '700', color: listo ? '#065F46' : '#6B7280', margin: '0 0 4px' }}>
                {listo
                  ? sofiaOutput ? '✓ Diagnóstico con IA listo para exportar' : '✓ Diagnóstico listo (sin análisis de IA)'
                  : '⏳ Guarda el diagnóstico antes de exportar'}
              </p>
              <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
                {sofiaOutput
                  ? 'El PDF incluirá gráficas + tablas + análisis completo de Sofía IA'
                  : 'El PDF incluirá gráficas y tablas sin análisis narrativo'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => exportarPDF(sofiaOutput)} disabled={!listo}
                style={{ flex: 1, padding: '10px 14px', background: listo ? 'white' : '#F3F4F6', color: listo ? '#64748B' : '#9CA3AF', border: `1.5px solid ${listo ? BORDE : '#E5E7EB'}`, borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: listo ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                📄 Borrador
              </button>
              <button onClick={async () => { await guardarDiagnostico('autorizado'); exportarPDF(sofiaOutput) }} disabled={!listo}
                style={{ flex: 2, padding: '10px 20px', background: listo ? VERDE : '#D1D5DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: listo ? 'pointer' : 'not-allowed', fontFamily: 'inherit', boxShadow: listo ? '0 2px 8px rgba(46,125,90,0.3)' : 'none' }}>
                ✅ Autorizar y exportar PDF
              </button>
            </div>
            {estatus === 'autorizado' && (
              <p style={{ fontSize: '11px', color: VERDE, margin: '10px 0 0', fontWeight: '600' }}>✓ Este diagnóstico ya está autorizado</p>
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
      <label style={{ fontSize: '10px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>{label}</label>
      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={compact ? 2 : 3} autoFocus
        style={{ width: '100%', border: `1.5px solid ${color}`, borderRadius: '7px', padding: '8px 10px', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
        <button onClick={() => { onChange(draft); setEditing(false) }} style={{ padding: '4px 12px', background: color, color: 'white', border: 'none', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600' }}>✓ Guardar</button>
        <button onClick={() => { setDraft(valor); setEditing(false) }} style={{ padding: '4px 10px', background: '#F8FAFC', color: '#64748B', border: `1px solid ${BORDE}`, borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
      </div>
    </div>
  )

  return (
    <div onClick={() => { setDraft(valor); setEditing(true) }}
      style={{ cursor: 'pointer', padding: compact ? '6px 8px' : '10px 12px', background: '#FAFAFA', border: `1px solid ${BORDE}`, borderLeft: `3px solid ${color}33`, borderRadius: '6px', marginBottom: compact ? '4px' : '0' }}>
      <div style={{ fontSize: '9px', fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '3px', display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span><span style={{ color: color, opacity: 0.6 }}>✏️ Editar</span>
      </div>
      <p style={{ fontSize: '11px', color: '#374151', margin: 0, lineHeight: 1.5 }}>{valor || <em style={{ color: '#94A3B8' }}>Sin contenido</em>}</p>
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
