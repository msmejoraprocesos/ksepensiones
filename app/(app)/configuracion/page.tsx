'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const AZUL = '#1F3A5F'
const VERDE = '#2E8B57'
const NARANJA = '#F47920'

interface Perfil {
  nombre: string | null
  logo_url: string | null
  uma_diaria: number
  salario_minimo: number
  pmg_mensual: number
  rendimiento_afore_default: number
  inflacion_uma: number
}

export default function ConfiguracionPage() {
  const supabase = createClientComponentClient()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [userId, setUserId] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [email, setEmail] = useState('')

  const [form, setForm] = useState({
    nombre: '',
    uma_diaria: 117.31,
    salario_minimo: 315.04,
    pmg_mensual: 10636.54,
    rendimiento_afore_default: 6,
    inflacion_uma: 4.5,
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      setEmail(session.user.email ?? '')
      supabase.from('perfiles_usuario').select('*').eq('id', session.user.id).single().then(({ data }) => {
        if (data) {
          setPerfil(data as Perfil)
          setForm({
            nombre: data.nombre ?? '',
            uma_diaria: data.uma_diaria ?? 113.45,
            salario_minimo: data.salario_minimo ?? 263.12,
            pmg_mensual: data.pmg_mensual ?? 5953,
            rendimiento_afore_default: data.rendimiento_afore_default ?? 6,
            inflacion_uma: data.inflacion_uma ?? 4.5,
          })
        }
        setLoading(false)
      })
    })
  }, [])

  async function savePerfil() {
    setSaving(true)
    setSaved(false)
    const { error } = await supabase.from('perfiles_usuario').upsert({
      id: userId,
      nombre: form.nombre || null,
      uma_diaria: form.uma_diaria,
      salario_minimo: form.salario_minimo,
      pmg_mensual: form.pmg_mensual,
      rendimiento_afore_default: form.rendimiento_afore_default,
      inflacion_uma: form.inflacion_uma,
    })
    setSaving(false)
    if (!error) setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    const ext = file.name.split('.').pop()
    const path = `logos/${userId}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      await supabase.from('perfiles_usuario').update({ logo_url: data.publicUrl }).eq('id', userId)
      setPerfil(p => p ? { ...p, logo_url: data.publicUrl } : p)
    }
    setUploadingLogo(false)
  }

  const inputStyle: React.CSSProperties = { display: 'block', width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 56px)', color: '#94a3b8' }}>Cargando...</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#F4F6FB', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ color: AZUL, fontSize: '20px', fontWeight: '700', margin: 0 }}>Configuración</h1>
          <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0' }}>Perfil del asesor y variables del sistema</p>
        </div>
        <button onClick={savePerfil} disabled={saving}
          style={{ background: saved ? VERDE : (saving ? '#94a3b8' : AZUL), color: 'white', border: 'none', borderRadius: '8px', padding: '8px 20px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignContent: 'start' }}>

        {/* Perfil del asesor */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h2 style={{ color: AZUL, fontSize: '12px', fontWeight: '700', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Perfil del asesor</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Logo */}
            <div>
              <label style={labelStyle}>Logo (para PDF de diagnóstico)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '60px', height: '60px', borderRadius: '10px', border: '2px dashed #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#F8FAFC', flexShrink: 0 }}>
                  {perfil?.logo_url ? (
                    <img src={perfil.logo_url} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: '24px' }}>🖼️</span>
                  )}
                </div>
                <div>
                  <label style={{ display: 'inline-block', padding: '7px 14px', background: uploadingLogo ? '#94a3b8' : '#F1F5F9', color: '#374151', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: uploadingLogo ? 'not-allowed' : 'pointer', border: '1px solid #e2e8f0' }}>
                    {uploadingLogo ? 'Subiendo...' : 'Subir logo'}
                    <input type="file" accept="image/*" onChange={uploadLogo} style={{ display: 'none' }} disabled={uploadingLogo} />
                  </label>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>PNG, JPG, SVG · máx 2MB</p>
                </div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Nombre del asesor</label>
              <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} placeholder="Tu nombre completo" style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>Correo electrónico</label>
              <input value={email} disabled style={{ ...inputStyle, background: '#F8FAFC', color: '#94a3b8' }} />
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>El correo no se puede cambiar desde aquí</p>
            </div>
          </div>
        </div>

        {/* Variables del sistema */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h2 style={{ color: AZUL, fontSize: '12px', fontWeight: '700', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Variables del sistema 2026</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { key: 'uma_diaria', label: 'UMA diaria ($)', desc: 'Unidad de Medida y Actualización diaria', step: 0.01 },
              { key: 'salario_minimo', label: 'Salario mínimo diario ($)', desc: 'Salario mínimo general vigente', step: 0.01 },
              { key: 'pmg_mensual', label: 'PMG mensual ($)', desc: 'Pensión Mínima Garantizada mensual', step: 1 },
              { key: 'rendimiento_afore_default', label: 'Rendimiento AFORE default (%)', desc: 'Tasa de rendimiento conservadora por defecto', step: 0.5 },
              { key: 'inflacion_uma', label: 'Inflación UMA anual (%)', desc: 'Incremento anual estimado de la UMA', step: 0.1 },
            ].map(field => (
              <div key={field.key}>
                <label style={labelStyle}>{field.label}</label>
                <input
                  type="number"
                  step={field.step}
                  value={form[field.key as keyof typeof form]}
                  onChange={e => setForm(p => ({ ...p, [field.key]: parseFloat(e.target.value) }))}
                  style={inputStyle}
                />
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '3px 0 0' }}>{field.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Porcentajes Mod 40 */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h2 style={{ color: AZUL, fontSize: '12px', fontWeight: '700', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Porcentajes Modalidad 40</h2>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 16px' }}>Cuotas obrero-patronales por año de inicio</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[
              { anio: 2026, pct: 14.438 },
              { anio: 2027, pct: 15.528 },
              { anio: 2028, pct: 16.619 },
              { anio: 2029, pct: 17.709 },
              { anio: 2030, pct: 18.800 },
            ].map(item => (
              <div key={item.anio} style={{ background: '#F8FAFC', borderRadius: '8px', padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>{item.anio}</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: NARANJA }}>{item.pct}%</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '12px 0 0' }}>
            Los porcentajes de Mod 40 son fijos por ley y no se pueden modificar.
          </p>
        </div>

        {/* Info del sistema */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h2 style={{ color: AZUL, fontSize: '12px', fontWeight: '700', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Acerca de KSE Pensiones</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: 'Sistema', value: 'KSE Pensiones CRM' },
              { label: 'Versión', value: '1.0.0' },
              { label: 'Stack', value: 'Next.js 14 + Supabase + Vercel' },
              { label: 'Fórmulas', value: 'Ley 73, Ley 97, Mod 10, Mod 40' },
              { label: 'Actualización variables', value: 'Enero 2026' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>{item.label}</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: AZUL }}>{item.value}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '16px', background: '#FEF4EC', borderRadius: '8px', padding: '12px', border: '1px solid #fed7aa' }}>
            <p style={{ fontSize: '11px', color: '#92400e', margin: 0, lineHeight: '1.6' }}>
              ⚠️ Los cálculos son orientativos. Verifica siempre las variables con las fuentes oficiales (IMSS, CONASAMI, INEGI) antes de presentar diagnósticos a clientes.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
