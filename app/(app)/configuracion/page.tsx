'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'

const AZUL = '#1B3A6B'
const VERDE = '#2E8B57'
const NARANJA = '#F05B21'

interface Perfil {
  nombre: string
  razon_social: string
  rfc: string
  telefono: string
  email_contacto: string
  direccion: string
  logo_url: string | null
  vigencia_propuesta: number
  uma_diaria: number
  salario_minimo: number
  pmg_mensual: number
  rendimiento_afore_default: number
  inflacion_uma: number
}

const DEFAULTS: Perfil = {
  nombre: '',
  razon_social: '',
  rfc: '',
  telefono: '',
  email_contacto: '',
  direccion: '',
  logo_url: null,
  vigencia_propuesta: 30,
  uma_diaria: 117.31,
  salario_minimo: 315.04,
  pmg_mensual: 10636.54,
  rendimiento_afore_default: 6,
  inflacion_uma: 4.5,
}

export default function ConfiguracionPage() {
  const supabase = createClient()
  const [perfil, setPerfil] = useState<Perfil>(DEFAULTS)
  const [userId, setUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      supabase.from('perfiles_usuario').select('*').eq('id', session.user.id).single()
        .then(({ data }) => {
          if (data) setPerfil({ ...DEFAULTS, ...data })
        })
    })
  }, [])

  async function guardar() {
    if (!userId) return
    setSaving(true)
    await supabase.from('perfiles_usuario').upsert({ id: userId, ...perfil })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true)
    const ext = file.name.split('.').pop()
    const path = `logos/${userId}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      setPerfil(p => ({ ...p, logo_url: data.publicUrl }))
    }
    setUploadingLogo(false)
  }

  const set = (k: keyof Perfil, v: any) => setPerfil(p => ({ ...p, [k]: v }))

  const inputSt: React.CSSProperties = {
    display: 'block', width: '100%', padding: '10px 14px',
    border: '1.5px solid #e2e8f0', borderRadius: '8px',
    fontSize: '14px', boxSizing: 'border-box', outline: 'none',
    fontFamily: 'inherit', background: 'white', color: '#1e293b',
  }

  const labelSt: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: '700',
    color: '#475569', marginBottom: '5px',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  }

  const sectionTitle = (icon: string, title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: '18px' }}>{icon}</span>
      <h2 style={{ fontSize: '15px', fontWeight: '700', color: AZUL, margin: 0 }}>{title}</h2>
    </div>
  )

  return (
    <div style={{ height: 'calc(100vh - 56px)', overflow: 'auto', background: '#F4F6FB', padding: '24px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '800', color: AZUL, margin: 0 }}>Configuración</h1>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>Perfil del asesor y variables del sistema</p>
          </div>
          <button onClick={guardar} disabled={saving}
            style={{ padding: '10px 24px', background: saved ? VERDE : NARANJA, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', boxShadow: `0 4px 12px ${saved ? VERDE : NARANJA}50` }}>
            {saved ? '✓ Guardado' : saving ? 'Guardando...' : '💾 Guardar cambios'}
          </button>
        </div>

        {/* ── SECCIÓN 1: Identidad del asesor ── */}
        <div style={{ background: 'white', borderRadius: '14px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {sectionTitle('👤', 'Identidad del asesor')}

          {/* Logo upload */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelSt}>Logo del asesor</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '80px', height: '80px', border: '2px dashed #e2e8f0', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', overflow: 'hidden', flexShrink: 0 }}>
                {perfil.logo_url ? (
                  <img src={perfil.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '28px' }}>🏢</span>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 8px' }}>
                  Aparecerá en el encabezado del PDF de propuesta. Recomendado: PNG con fondo transparente, mínimo 200x80px.
                </p>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#EEF2F8', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: uploadingLogo ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600', color: AZUL }}>
                  {uploadingLogo ? '⏳ Subiendo...' : '📁 Seleccionar logo'}
                  <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} style={{ display: 'none' }} disabled={uploadingLogo} />
                </label>
                {perfil.logo_url && (
                  <button onClick={() => setPerfil(p => ({ ...p, logo_url: null }))}
                    style={{ marginLeft: '8px', fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Quitar logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={labelSt}>Nombre del asesor *</label>
              <input value={perfil.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej. Juan Pérez González" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Razón social / Empresa</label>
              <input value={perfil.razon_social} onChange={e => set('razon_social', e.target.value)} placeholder="Ej. Asesoría Pensional López S.C." style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>RFC</label>
              <input value={perfil.rfc} onChange={e => set('rfc', e.target.value.toUpperCase())} placeholder="Ej. LOPJ800101XX3" maxLength={13} style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Teléfono de contacto</label>
              <input value={perfil.telefono} onChange={e => set('telefono', e.target.value)} placeholder="Ej. 442 123 4567" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Email de contacto</label>
              <input type="email" value={perfil.email_contacto} onChange={e => set('email_contacto', e.target.value)} placeholder="contacto@tuempresa.com" style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>Vigencia de propuesta (días)</label>
              <input type="number" value={perfil.vigencia_propuesta} onChange={e => set('vigencia_propuesta', parseInt(e.target.value) || 30)} min={1} max={365} style={inputSt} />
              <p style={{ fontSize: '10px', color: '#94a3b8', margin: '4px 0 0' }}>Aparece en el PDF: "Válida por {perfil.vigencia_propuesta} días"</p>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSt}>Dirección / Ciudad</label>
              <input value={perfil.direccion} onChange={e => set('direccion', e.target.value)} placeholder="Ej. Querétaro, Qro." style={inputSt} />
            </div>
          </div>
        </div>

        {/* ── SECCIÓN 2: Variables del sistema ── */}
        <div style={{ background: 'white', borderRadius: '14px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {sectionTitle('📊', 'Variables del sistema 2026')}
          <p style={{ fontSize: '13px', color: '#64748b', margin: '-8px 0 16px' }}>
            Valores oficiales actualizados para los cálculos de la calculadora.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '16px' }}>
            {[
              { key: 'uma_diaria', label: 'UMA Diaria ($)', placeholder: '117.31', desc: 'INEGI · actualización feb 2026' },
              { key: 'salario_minimo', label: 'Salario Mínimo ($/día)', placeholder: '315.04', desc: 'CONASAMI · vigente 2026' },
              { key: 'pmg_mensual', label: 'PMG Ley 73 ($/mes)', placeholder: '10636.54', desc: 'Pensión mínima garantizada' },
              { key: 'rendimiento_afore_default', label: 'Rendimiento AFORE (%)', placeholder: '6', desc: 'Default conservador' },
              { key: 'inflacion_uma', label: 'Inflación estimada (%)', placeholder: '4.5', desc: 'Para ajuste a pesos de hoy' },
            ].map(f => (
              <div key={f.key}>
                <label style={labelSt}>{f.label}</label>
                <input type="number" step="0.01" value={(perfil as any)[f.key]} onChange={e => set(f.key as keyof Perfil, parseFloat(e.target.value) || 0)} placeholder={f.placeholder} style={inputSt} />
                <p style={{ fontSize: '10px', color: '#94a3b8', margin: '4px 0 0' }}>{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Porcentajes Mod 40 — solo lectura */}
          <div style={{ background: '#F4F6FB', borderRadius: '10px', padding: '14px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: AZUL, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Porcentajes Modalidad 40 (oficiales)</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[['2026','14.438%'],['2027','15.528%'],['2028','16.619%'],['2029','17.709%'],['2030','18.800%']].map(([year, pct]) => (
                <div key={year} style={{ background: 'white', borderRadius: '8px', padding: '8px 14px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>{year}</div>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: AZUL }}>{pct}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── SECCIÓN 3: Preview PDF ── */}
        <div style={{ background: 'white', borderRadius: '14px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {sectionTitle('📄', 'Vista previa del encabezado PDF')}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            {/* Simulación encabezado PDF */}
            <div style={{ background: AZUL, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {perfil.logo_url ? (
                  <img src={perfil.logo_url} alt="Logo" style={{ height: '36px', objectFit: 'contain', background: 'white', padding: '4px', borderRadius: '6px' }} />
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '6px 12px', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>Tu logo aquí</div>
                )}
                <div>
                  <div style={{ color: 'white', fontWeight: '700', fontSize: '14px' }}>{perfil.razon_social || perfil.nombre || 'Nombre del asesor'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11px' }}>
                    {[perfil.rfc, perfil.telefono, perfil.email_contacto].filter(Boolean).join(' · ') || 'RFC · Teléfono · Email'}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'white', fontSize: '13px', fontWeight: '700' }}>Diagnóstico Pensional</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '11px' }}>{new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div style={{ color: NARANJA, fontSize: '10px', fontWeight: '600', marginTop: '2px' }}>Válida por {perfil.vigencia_propuesta} días</div>
              </div>
            </div>
            {/* Simulación pie de página */}
            <div style={{ background: '#F4F6FB', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>Folio: KSE-2026-000001 · Documento confidencial</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>Página 1 de 2 · Powered by</span>
                <img src="/logo-kse.png" alt="KSE" style={{ height: '14px', objectFit: 'contain', opacity: 0.5 }} />
                <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>KSE Pensiones</span>
              </div>
            </div>
          </div>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '10px 0 0', textAlign: 'center' }}>
            Vista previa del encabezado y pie de página que aparecerán en el PDF exportado
          </p>
        </div>

        {/* Botón guardar abajo también */}
        <div style={{ textAlign: 'center', paddingBottom: '20px' }}>
          <button onClick={guardar} disabled={saving}
            style={{ padding: '12px 40px', background: saved ? VERDE : NARANJA, color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', boxShadow: `0 4px 16px ${saved ? VERDE : NARANJA}50` }}>
            {saved ? '✓ Cambios guardados' : saving ? 'Guardando...' : '💾 Guardar configuración'}
          </button>
        </div>

      </div>
    </div>
  )
}
