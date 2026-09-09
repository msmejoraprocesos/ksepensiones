'use client'
import React, { useState } from 'react'

const AZUL = '#334E7B'
const VERDE = '#2E7D5A'

interface Props {
  // Sub-tab state
  subTab: string
  setSubTab: (t: string) => void
  // Data
  escenarios: any[]
  datos: any
  diagGuardadoId: string | null
  estatus: string
  analisis: any[]
  analisisManualSecciones: any
  modoAnalisis: string
  setModoAnalisis: (m: string) => void
  setAnalisisManualSecciones: (fn: any) => void
  generandoAnalisis: boolean
  // Actions
  generarAnalisisIA: () => void
  exportarPDF: () => void
  guardarDiagnostico: (estatus: string) => Promise<void>
  // Children for resumen and semaforo (complex sections stay in parent)
  resumenContent: React.ReactNode
  semaforoContent: React.ReactNode
  simuladorContent: React.ReactNode
  fmtMXN: (n: number) => string
  fmtMXN2: (n: number) => string
}

export default function TabEntregable({
  subTab, setSubTab,
  diagGuardadoId, estatus, analisis, analisisManualSecciones,
  modoAnalisis, setModoAnalisis, setAnalisisManualSecciones,
  generandoAnalisis, generarAnalisisIA, exportarPDF, guardarDiagnostico,
  resumenContent, semaforoContent, simuladorContent,
}: Props) {
  const tieneAnalisis = (modoAnalisis === 'ia' && analisis.length > 0) ||
    (modoAnalisis === 'manual' && Object.values(analisisManualSecciones).some((v: any) => v.trim().length > 0))
  const listo = !!diagGuardadoId

  const tabs = [
    { key: 'analisis', label: '🤖 Análisis Sofía IA', color: '#7C3AED', bg: '#F5F3FF' },
    { key: 'resumen',  label: '📊 Resumen ejecutivo', color: AZUL,     bg: '#EEF2F8' },
    { key: 'exportar', label: '✅ Exportar PDF',       color: VERDE,    bg: '#F0F7F4' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: '6px', background: '#F4F6F9', padding: '6px', borderRadius: '10px' }}>
        {tabs.map(s => (
          <button key={s.key} onClick={() => setSubTab(s.key)}
            style={{ flex: 1, padding: '9px 12px', border: 'none', borderRadius: '7px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: '600', transition: 'all 0.15s',
              background: subTab === s.key ? s.bg : 'white',
              color: subTab === s.key ? s.color : '#94A3B8',
              boxShadow: subTab === s.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              borderBottom: subTab === s.key ? `2px solid ${s.color}` : '2px solid transparent',
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Sub-tab: Análisis ── */}
      {subTab === 'analisis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ background: 'white', border: '1px solid #DDD6FE', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ background: '#7C3AED', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '700', color: 'white', margin: '0 0 2px' }}>📝 Análisis del diagnóstico</p>
                <p style={{ fontSize: '11px', color: '#DDD6FE', margin: 0 }}>Escríbelo tú o genera uno con Sofía IA</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setModoAnalisis(modoAnalisis === 'manual' ? 'ia' : 'manual')}
                  style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {modoAnalisis === 'ia' ? '✏️ Cambiar a manual' : '🤖 Cambiar a IA'}
                </button>
                <button onClick={generarAnalisisIA} disabled={generandoAnalisis}
                  style={{ padding: '6px 14px', border: '1px solid white', fontSize: '12px', fontWeight: '700', color: '#7C3AED', background: 'white', fontFamily: 'inherit', cursor: 'pointer', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', opacity: generandoAnalisis ? 0.7 : 1 }}>
                  {generandoAnalisis ? '⏳ Generando...' : '✨ Generar con Sofía IA'}
                </button>
              </div>
            </div>
            <div style={{ padding: '14px 16px' }}>
              {modoAnalisis === 'ia' && analisis.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {analisis.map((sec: any, i: number) => (
                    <div key={i} style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '8px', padding: '12px 14px' }}>
                      <p style={{ fontSize: '11px', fontWeight: '700', color: '#7C3AED', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{sec.titulo}</p>
                      <p style={{ fontSize: '12px', color: '#374151', margin: 0, lineHeight: 1.6 }}>{sec.contenido}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Object.entries(analisisManualSecciones).map(([key, value]: any) => (
                    <div key={key}>
                      <label style={{ fontSize: '10px', fontWeight: '600', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>
                        {key === 'situacion_actual' ? 'Situación actual' : key === 'propuesta' ? 'Propuesta' : key === 'beneficios' ? 'Beneficios' : key === 'siguiente_paso' ? 'Siguiente paso' : key}
                      </label>
                      <textarea value={value} onChange={e => setAnalisisManualSecciones((p: any) => ({ ...p, [key]: e.target.value }))} rows={3}
                        placeholder={`Escribe el análisis de ${key.replace('_', ' ')}...`}
                        style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', color: '#374151' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-tab: Resumen ── */}
      {subTab === 'resumen' && (
        <div>{resumenContent}</div>
      )}

      {/* ── Sub-tab: Exportar ── */}
      {subTab === 'exportar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ background: listo ? '#F0FDF4' : '#F9FAFB', border: `2px solid ${listo ? '#86EFAC' : '#E5E7EB'}`, padding: '20px', borderRadius: '10px' }}>
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '14px', fontWeight: '700', color: listo ? '#065F46' : '#6B7280', margin: '0 0 4px' }}>
                {listo ? (tieneAnalisis ? '✓ Diagnóstico completo — listo para exportar' : '✓ Listo para exportar (sin análisis)') : '⏳ Diagnóstico incompleto'}
              </p>
              <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
                {!listo ? 'Guarda el diagnóstico antes de exportar' : tieneAnalisis ? 'El PDF incluirá datos, escenarios y análisis de Sofía IA' : 'El PDF incluirá datos y escenarios sin análisis narrativo'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={exportarPDF} disabled={!listo}
                style={{ flex: 1, padding: '11px 16px', background: listo ? 'white' : '#F3F4F6', color: listo ? '#64748B' : '#9CA3AF', border: `1.5px solid ${listo ? '#E2E8F0' : '#E5E7EB'}`, borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: listo ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                📄 Exportar borrador
              </button>
              <button onClick={async () => { await guardarDiagnostico('autorizado'); exportarPDF() }} disabled={!listo}
                style={{ flex: 2, padding: '11px 20px', background: listo ? VERDE : '#D1D5DB', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: listo ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: listo ? '0 2px 8px rgba(46,125,90,0.3)' : 'none' }}>
                ✅ Autorizar y exportar PDF
              </button>
            </div>
            {estatus === 'autorizado' && (
              <p style={{ fontSize: '11px', color: VERDE, margin: '10px 0 0', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                ✓ Este diagnóstico ya está autorizado
              </p>
            )}
          </div>
          {semaforoContent}
          {simuladorContent}
        </div>
      )}
    </div>
  )
}
